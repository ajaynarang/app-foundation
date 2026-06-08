import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LoadStopStatusSchema, STOP_STATUS_TRANSITIONS, type LoadStopStatus } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { validateLoadTransition } from '../utils/load-status-machine';
import { LoadEventsService } from './load-events.service';
import { LoadChargesService } from './load-charges.service';
import { LoadStatusService } from './load-status.service';

const STOP_STATUS = LoadStopStatusSchema.enum;

@Injectable()
export class StopStatusService {
  private readonly logger = new Logger(StopStatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
    private readonly loadChargesService: LoadChargesService,
    private readonly loadStatusService: LoadStatusService,
  ) {}

  /**
   * Update stop status (ARRIVED → IN_PROGRESS → COMPLETED).
   * Drivers can update their own stops; dispatchers/admin/owners can update any.
   */
  async updateStopStatus(
    loadNumber: string,
    stopId: number,
    status: Exclude<LoadStopStatus, 'PENDING'>,
    userId: string,
    tenantId: number,
  ) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      include: { stops: true },
    });

    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    const loadStop = load.stops.find((s) => s.id === stopId);
    if (!loadStop) {
      throw new NotFoundException(`Stop ${stopId} not found on load ${loadNumber}`);
    }

    // Validate transition (single source of truth in shared-types)
    const currentStatus = (loadStop.status || STOP_STATUS.PENDING) as LoadStopStatus;
    const allowed = STOP_STATUS_TRANSITIONS[currentStatus] ?? [];
    if (!(allowed as readonly string[]).includes(status)) {
      throw new BadRequestException(`Invalid transition from '${currentStatus}' to '${status}'`);
    }

    const now = new Date();
    const updateData: any = { status };

    if (status === STOP_STATUS.ARRIVED) {
      updateData.arrivedAt = now;
    } else if (status === STOP_STATUS.IN_PROGRESS) {
      updateData.loadingStartedAt = now;
    } else if (status === STOP_STATUS.COMPLETED) {
      updateData.completedAt = now;
      // Calculate detention minutes from arrival
      if (loadStop.arrivedAt) {
        updateData.detentionMinutes = Math.round((now.getTime() - loadStop.arrivedAt.getTime()) / 60_000);
      }
    }

    await this.prisma.loadStop.update({
      where: { id: stopId },
      data: updateData,
    });

    // Emit domain event for stop status change
    await this.events.emit(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, load.tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
      stopId,
      status,
    });

    // Auto-transition: assigned → in_transit when a pickup stop is completed.
    // Uses a transaction to prevent race condition where two concurrent stop
    // completions both pass the "one in_transit per driver" check.
    let didAutoTransition = false;
    if (status === STOP_STATUS.COMPLETED && loadStop.actionType === 'pickup' && load.status === 'ASSIGNED') {
      didAutoTransition = await this.prisma.$transaction(async (tx) => {
        // Guard: only one in_transit load per driver at a time
        if (load.driverId) {
          const driverInTransit = await tx.load.findFirst({
            where: {
              driverId: load.driverId,
              status: 'IN_TRANSIT',
              isActive: true,
              id: { not: load.id },
            },
            select: { loadNumber: true },
          });
          if (driverInTransit) {
            this.logger.warn(
              `Blocking auto-transition for load ${load.loadNumber}: driver already has in_transit load ${driverInTransit.loadNumber}`,
            );
            throw new BadRequestException(
              `Driver already has Load #${driverInTransit.loadNumber} in-transit. Complete or deliver it first.`,
            );
          }

          // Also check relay legs in-transit
          const relayLegInTransit = await tx.loadLeg.findFirst({
            where: {
              driverId: load.driverId,
              status: 'IN_TRANSIT',
              load: { isActive: true, id: { not: load.id } },
            },
          });
          if (relayLegInTransit) {
            throw new BadRequestException('Driver already has a relay leg in-transit');
          }
        }

        // Guard: only one in_transit load per vehicle at a time
        if (load.vehicleId) {
          const vehicleInTransit = await tx.load.findFirst({
            where: {
              vehicleId: load.vehicleId,
              status: 'IN_TRANSIT',
              isActive: true,
              id: { not: load.id },
            },
            select: { loadNumber: true },
          });
          if (vehicleInTransit) {
            this.logger.warn(
              `Blocking auto-transition for load ${load.loadNumber}: vehicle already has in_transit load ${vehicleInTransit.loadNumber}`,
            );
            throw new BadRequestException(
              `Vehicle already has Load #${vehicleInTransit.loadNumber} in-transit. Complete or deliver it first.`,
            );
          }
        }

        // Validate the transition via the state machine
        validateLoadTransition(load.status, 'IN_TRANSIT');

        // Use updateMany with status in WHERE for optimistic locking —
        // prevents duplicate transitions when concurrent requests both
        // pass the guards above
        const transitionResult = await tx.load.updateMany({
          where: { id: load.id, status: 'ASSIGNED' },
          data: { status: 'IN_TRANSIT', inTransitAt: now },
        });
        if (transitionResult.count === 0) {
          // Another concurrent request already transitioned this load
          return false;
        }
        return true;
      });

      if (didAutoTransition) {
        this.loadEventsService
          .logEvent({
            loadId: load.id,
            eventType: 'status_changed',
            fromValue: 'ASSIGNED',
            toValue: 'IN_TRANSIT',
            description: 'Auto-transitioned to IN_TRANSIT — pickup stop completed',
          })
          .catch((err) => this.logger.error(`Failed to log auto-transition event: ${err.message}`));

        await this.events.emit(SALLY_EVENTS.LOAD_STATUS_CHANGED, tenantId, {
          entityId: load.loadNumber,
          entityType: 'load',
          loadNumber: load.loadNumber,
          status: 'IN_TRANSIT',
          previousStatus: 'ASSIGNED',
        });
      }
    }

    // Auto-transition: in_transit → delivered when the LAST delivery stop is completed.
    // Uses a transaction to prevent race condition where concurrent stop completions
    // both trigger the delivered transition.
    let didAutoDeliver = false;
    if (
      status === STOP_STATUS.COMPLETED &&
      loadStop.actionType === 'delivery' &&
      load.status === 'IN_TRANSIT' &&
      !didAutoTransition
    ) {
      didAutoDeliver = await this.prisma.$transaction(async (tx) => {
        // Re-check load status inside transaction
        const freshLoad = await tx.load.findUnique({
          where: { id: load.id },
          select: { status: true },
        });
        if (!freshLoad || freshLoad.status !== 'IN_TRANSIT') return false;

        const incompleteStops = await tx.loadStop.count({
          where: {
            loadId: load.id,
            status: { not: STOP_STATUS.COMPLETED },
            id: { not: stopId },
          },
        });
        if (incompleteStops > 0) return false;

        validateLoadTransition('IN_TRANSIT', 'DELIVERED');

        await tx.load.update({
          where: { id: load.id },
          data: {
            status: 'DELIVERED',
            deliveredAt: now,
            billingStatus: 'PENDING_DOCUMENTS',
          },
        });
        return true;
      });

      if (didAutoDeliver) {
        // Auto-create linehaul charge if missing (fire-and-forget, outside txn)
        const existingLinehaul = await this.prisma.loadCharge.findFirst({
          where: { loadId: load.id, chargeType: 'linehaul' },
        });
        if (!existingLinehaul && load.rateCents) {
          await this.loadChargesService.addCharge({
            loadId: load.id,
            chargeType: 'linehaul',
            description: `Linehaul - Load #${load.loadNumber}`,
            unitPriceCents: load.rateCents,
          });
        }

        // Sync vehicle status
        if (load.vehicleId) {
          this.loadStatusService
            .syncVehicleStatusAfterLoadTerminal(load.vehicleId)
            .catch((err) => this.logger.error(`Vehicle status sync failed: ${err.message}`));
        }

        this.loadEventsService
          .logEvent({
            loadId: load.id,
            eventType: 'status_changed',
            fromValue: 'IN_TRANSIT',
            toValue: 'DELIVERED',
            description: 'Auto-transitioned to DELIVERED — all stops completed',
          })
          .catch((err) => this.logger.error(`Failed to log auto-transition event: ${err.message}`));

        await this.events.emit(SALLY_EVENTS.LOAD_STATUS_CHANGED, tenantId, {
          entityId: load.loadNumber,
          entityType: 'load',
          loadNumber: load.loadNumber,
          status: 'DELIVERED',
          previousStatus: 'IN_TRANSIT',
        });
      }
    }

    // Log stop status event (always, regardless of auto-transition outcome)
    const eventDescription =
      status === STOP_STATUS.ARRIVED
        ? `Driver arrived at stop ${loadStop.sequenceOrder}`
        : status === STOP_STATUS.IN_PROGRESS
          ? `Driver started ${loadStop.actionType === 'pickup' ? 'loading' : 'unloading'} at stop ${loadStop.sequenceOrder}`
          : `Driver completed stop ${loadStop.sequenceOrder}`;

    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'stop_status_change',
        fromValue: currentStatus,
        toValue: status,
        description: eventDescription,
      })
      .catch((err) => this.logger.error(`Failed to log stop status event: ${err.message}`));

    return { stopId, status, ...updateData };
  }
}
