import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { LoadLegStatus } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { validateLoadTransition, getTimestampFieldForStatus } from '../utils/load-status-machine';
import { isReversalTransition } from '../utils/load-reversal-config';
import { validateReadyForConfirmation } from '../utils/load-confirmation-rules';
import { LoadEventsService } from './load-events.service';
import { LoadLegService } from './load-leg.service';
import { formatLoadResponse } from '../utils/format-load-response';

@Injectable()
export class LoadStatusService {
  private readonly logger = new Logger(LoadStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
    private readonly loadLegService: LoadLegService,
  ) {}

  /**
   * Update load status with state machine validation
   */
  async updateStatus(loadNumber: string, status: string, options?: { reason?: string }) {
    const load = await this.prisma.load.findFirst({ where: { loadNumber } });
    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    // For relay loads, forward transitions delegate to leg service
    if (
      load.isRelay &&
      ['IN_TRANSIT', 'DELIVERED'].includes(status) &&
      ['ASSIGNED', 'IN_TRANSIT'].includes(load.status)
    ) {
      const legs = await this.prisma.loadLeg.findMany({
        where: { loadId: load.id },
        orderBy: { sequence: 'asc' },
      });
      const activeLeg = LoadLegService.getActiveLeg(legs);
      if (activeLeg) {
        // Safe cast: filtered to ['IN_TRANSIT', 'DELIVERED'] above — both are valid LoadLegStatus members.
        return this.loadLegService.advanceLegStatus(activeLeg.legId, status as LoadLegStatus, load.tenantId);
      }
    }

    // Validate state transition
    validateLoadTransition(load.status, status);

    // Block reversal transitions through this endpoint — must use /revert
    if (isReversalTransition(load.status, status)) {
      throw new BadRequestException(
        `Cannot revert ${load.status} → ${status} via status update. Use the /revert endpoint instead.`,
      );
    }

    // Validate field completeness for draft → pending
    if (load.status === 'DRAFT' && status === 'PENDING') {
      const loadStops = await this.prisma.loadStop.findMany({
        where: { loadId: load.id },
        include: { stop: true },
        orderBy: { sequenceOrder: 'asc' },
      });
      const stopsForValidation = loadStops.map((ls) => ({
        actionType: ls.actionType,
        city: ls.stop?.city || null,
        state: ls.stop?.state || null,
      }));
      const issues = validateReadyForConfirmation({
        customerId: load.customerId,
        rateCents: load.rateCents,
        referenceNumber: load.referenceNumber,
        stops: stopsForValidation,
      });
      if (issues.length > 0) {
        throw new BadRequestException({
          message: 'Load is not ready for confirmation',
          issues,
        });
      }
    }

    // Require reason for on_hold and tonu
    if (status === 'ON_HOLD' && !options?.reason) {
      throw new BadRequestException('on_hold_reason is required when placing a load on hold');
    }
    if (status === 'TONU' && !options?.reason) {
      throw new BadRequestException('tonu_reason is required when marking a load as TONU');
    }

    const updateData: any = { status };

    // Set lifecycle timestamp
    const tsField = getTimestampFieldForStatus(status);
    if (tsField) {
      updateData[tsField] = new Date();
    }

    // Set reason fields
    if (status === 'ON_HOLD') {
      updateData.onHoldReason = options?.reason;
    }
    if (status === 'TONU') {
      updateData.tonuReason = options?.reason;
    }

    // Handle status demotions — clear forward-looking data
    // Capture vehicleId before it's cleared by demotion
    const vehicleIdBeforeDemotion = status === 'DRAFT' || status === 'PENDING' ? load.vehicleId : null;
    if (status === 'DRAFT') {
      updateData.assignedAt = null;
      updateData.inTransitAt = null;
      updateData.onHoldAt = null;
      updateData.onHoldReason = null;
      updateData.driverId = null;
      updateData.vehicleId = null;
    }
    if (status === 'PENDING') {
      updateData.assignedAt = null;
      updateData.driverId = null;
      updateData.vehicleId = null;
      updateData.inTransitAt = null;
    }
    // On hold → anywhere (except cancel): clear hold data
    if (load.status === 'ON_HOLD' && status !== 'CANCELLED') {
      updateData.onHoldAt = null;
      updateData.onHoldReason = null;
    }

    // When transitioning to delivered, apply the shared delivery side-effects
    // (billingStatus, stop completion, linehaul charge). Single source of truth
    // shared with the relay path (LoadLegService.advanceLegStatus) so the two
    // never diverge — see SQ-114.
    if (status === 'DELIVERED') {
      await LoadLegService.applyDeliverySideEffects(this.prisma, {
        id: load.id,
        loadNumber: load.loadNumber,
        billingStatus: load.billingStatus,
        rateCents: load.rateCents,
      });
    }

    const updated = await this.prisma.load.update({
      where: { id: load.id },
      data: updateData,
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        trip: { select: { tripId: true, loadCount: true } },
      },
    });

    // Emit domain event for status change
    await this.events.emit(SALLY_EVENTS.LOAD_STATUS_CHANGED, updated.tenantId, {
      entityId: updated.loadNumber,
      entityType: 'load',
      loadNumber: updated.loadNumber,
      status: updated.status,
      previousStatus: load.status,
    });

    // Auto-sync vehicle status on terminal states or demotions
    const vehicleToSync = ['DELIVERED', 'CANCELLED', 'TONU'].includes(status)
      ? load.vehicleId
      : vehicleIdBeforeDemotion;
    if (vehicleToSync) {
      this.syncVehicleStatusAfterLoadTerminal(vehicleToSync).catch((err) =>
        this.logger.error(`Vehicle status sync failed: ${err.message}`),
      );
    }

    // Log status change event
    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'status_changed',
        fromValue: load.status,
        toValue: status,
        description: `Status changed from ${load.status} to ${status}`,
        metadata: options?.reason ? { reason: options.reason } : undefined,
      })
      .catch((err) => this.logger.error(`Failed to log status event: ${err.message}`));

    // Complete route plan when load reaches terminal state (await to ensure consistency)
    await this.completeRoutePlanIfTerminal(loadNumber, status);

    this.logger.log(`Load ${loadNumber} status updated: ${load.status} → ${status}`);
    return formatLoadResponse(updated);
  }

  /**
   * After a load reaches a terminal state, check if the vehicle has other active loads.
   * If not, and if status is ASSIGNED, revert to AVAILABLE.
   * Respects manual overrides: only ASSIGNED → AVAILABLE, never touches IN_SHOP/OUT_OF_SERVICE.
   */
  async syncVehicleStatusAfterLoadTerminal(vehicleId: number): Promise<void> {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: { id: true, vehicleId: true, status: true },
    });
    if (!vehicle || vehicle.status !== 'ASSIGNED') return;

    const activeLoadCount = await this.prisma.load.count({
      where: {
        vehicleId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
        isActive: true,
      },
    });

    if (activeLoadCount === 0) {
      await this.prisma.vehicle.update({
        where: { id: vehicleId },
        data: { status: 'AVAILABLE' },
      });
      this.logger.log(`Vehicle ${vehicle.vehicleId} status auto-updated: ASSIGNED → AVAILABLE (no active loads)`);
    }
  }

  /**
   * Revert a delivered load back to in_transit.
   * Only allowed when billingStatus is PENDING_DOCUMENTS.
   */
  async revertDelivery(tenantId: number, loadNumber: string, reason: string, userId?: number) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });

    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);
    if (load.status !== 'DELIVERED') {
      throw new BadRequestException('Load is not in delivered status');
    }
    if (load.billingStatus !== 'PENDING_DOCUMENTS') {
      throw new BadRequestException(
        'Cannot revert: billing has progressed past document collection. Use close-out to manage billing.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.load.update({
        where: { id: load.id },
        data: {
          status: 'IN_TRANSIT',
          billingStatus: null,
          deliveredAt: null,
        },
        include: {
          stops: {
            include: { stop: true },
            orderBy: { sequenceOrder: 'asc' },
          },
          trip: { select: { tripId: true, loadCount: true } },
        },
      });

      // Revert previously COMPLETED stops back to ARRIVED — semantically correct
      // (driver was at the dock when the truck reached the stop). IN_TRANSIT is
      // a load-level state, not a stop-level state.
      await tx.loadStop.updateMany({
        where: { loadId: load.id, status: 'COMPLETED' },
        data: { status: 'ARRIVED', completedAt: null },
      });

      return result;
    });

    // Emit domain event for delivery revert
    await this.events.emit(SALLY_EVENTS.LOAD_STATUS_CHANGED, load.tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
      status: 'IN_TRANSIT',
      previousStatus: 'DELIVERED',
    });

    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'status_revert',
        fromValue: 'DELIVERED',
        toValue: 'IN_TRANSIT',
        description: reason,
        userId,
      })
      .catch((err) => this.logger.error(`Failed to log revert event: ${err.message}`));

    this.logger.log(`Load ${loadNumber} reverted from delivered to in_transit`);
    return formatLoadResponse(updated);
  }

  /**
   * When a load reaches a terminal state, check if its active route plan
   * should be completed. Multi-load safe: only completes when ALL loads
   * in the plan are terminal.
   */
  async completeRoutePlanIfTerminal(loadNumber: string, terminalStatus: string): Promise<void> {
    const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'TONU'];
    if (!TERMINAL_STATUSES.includes(terminalStatus)) return;

    const planLoad = await this.prisma.routePlanLoad.findFirst({
      where: {
        load: { loadNumber },
        plan: { isActive: true, status: 'ACTIVE' },
      },
      include: {
        plan: {
          include: {
            loads: {
              include: { load: { select: { id: true, status: true, loadNumber: true } } },
            },
            segments: { where: { status: 'PLANNED' }, select: { id: true } },
          },
        },
      },
    });

    if (!planLoad) return;

    const nonTerminalLoads = planLoad.plan.loads.filter((pl) => !TERMINAL_STATUSES.includes(pl.load.status));

    // Exclude current load (status may not be committed yet in the read)
    const remainingNonTerminal = nonTerminalLoads.filter((pl) => pl.loadId !== planLoad.loadId);

    if (remainingNonTerminal.length > 0) return;

    await this.prisma.$transaction([
      this.prisma.routePlan.update({
        where: { id: planLoad.plan.id },
        data: {
          status: 'COMPLETED',
          isActive: false,
          completedAt: new Date(),
        },
      }),
      this.prisma.routeSegment.updateMany({
        where: {
          planId: planLoad.plan.id,
          status: 'PLANNED',
        },
        data: { status: 'SKIPPED' },
      }),
      // Phase 2 Task 10 — alert.loadId is now the Int FK to loads.id.
      this.prisma.alert.updateMany({
        where: {
          tenantId: planLoad.plan.tenantId,
          status: 'ACTIVE',
          alertType: {
            in: ['PLAN_MISSED_STOP', 'PLAN_BEHIND_SCHEDULE', 'PLAN_SEGMENT_STALLED'],
          },
          loadId: {
            in: planLoad.plan.loads.map((pl) => pl.load.id),
          },
        },
        data: {
          status: 'AUTO_RESOLVED',
          resolvedAt: new Date(),
        },
      }),
    ]);

    this.logger.log(`Route plan ${planLoad.plan.planId} completed: all loads terminal`);
  }

  /**
   * Cancel active route plan when a load's driver is reassigned.
   */
  async cancelRoutePlanForLoad(loadNumber: string): Promise<void> {
    const planLoad = await this.prisma.routePlanLoad.findFirst({
      where: {
        load: { loadNumber },
        plan: { isActive: true, status: 'ACTIVE' },
      },
      select: { plan: { select: { id: true, planId: true } } },
    });

    if (!planLoad) return;

    await this.prisma.routePlan.update({
      where: { id: planLoad.plan.id },
      data: {
        status: 'CANCELLED',
        isActive: false,
        cancelledAt: new Date(),
      },
    });

    this.logger.log(`Route plan ${planLoad.plan.planId} cancelled: driver reassigned on load ${loadNumber}`);
  }
}
