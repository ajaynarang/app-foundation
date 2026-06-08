import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import type { LoadStatus } from '@prisma/client';
import type { LoadStopStatus } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { LoadLegService } from './load-leg.service';
import { LoadTrackingService } from './load-tracking.service';
import { CustomerLoadService } from './customer-load.service';
import { LoadQueryService } from './load-query.service';
import { LoadCreationService } from './load-creation.service';
import { LoadDraftService } from './load-draft.service';
import { LoadStatusService } from './load-status.service';
import { LoadAssignmentService } from './load-assignment.service';
import { StopStatusService } from './stop-status.service';
import { toUtcCalendarDate } from '../../../../shared/utils/calendar-date';
import { formatLoadResponse } from '../utils/format-load-response';

@Injectable()
export class LoadsService {
  private readonly logger = new Logger(LoadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadLegService: LoadLegService,
    private readonly loadTrackingService: LoadTrackingService,
    private readonly customerLoadService: CustomerLoadService,
    private readonly loadQueryService: LoadQueryService,
    private readonly loadCreationService: LoadCreationService,
    private readonly loadDraftService: LoadDraftService,
    private readonly loadStatusService: LoadStatusService,
    private readonly loadAssignmentService: LoadAssignmentService,
    private readonly stopStatusService: StopStatusService,
  ) {}

  /**
   * Create a new load with stops
   * Supports inline stop creation for manual entry (when stop doesn't exist yet)
   */
  async create(data: Parameters<LoadCreationService['create']>[0]) {
    return this.loadCreationService.create(data);
  }

  /**
   * Find all loads with optional filtering, search, sort, and pagination
   */
  async findAll(
    tenantId: number,
    filters?: Parameters<LoadQueryService['findAll']>[1],
    pagination?: Parameters<LoadQueryService['findAll']>[2],
  ) {
    return this.loadQueryService.findAll(tenantId, filters, pagination);
  }

  /** Full active set for the dispatcher kanban board (no client pagination). */
  async findActiveBoard(tenantId: number) {
    return this.loadQueryService.findActiveBoard(tenantId);
  }

  /**
   * Find one load by ID with stops.
   * Draft/pending loads skip cache — they're actively edited and stop
   * location edits (stopsApi.update) don't emit LOAD_UPDATED events.
   */
  async findOne(loadNumber: string, tenantId?: number) {
    return this.loadQueryService.findOne(loadNumber, tenantId);
  }

  /**
   * Batch-fetch confirmed Document records for an array of LoadStops
   * and attach `uploadedDocuments` to each stop.
   */
  async enrichStopsWithDocuments(stops: any[], tenantId: number): Promise<any[]> {
    return this.loadQueryService.enrichStopsWithDocuments(stops, tenantId);
  }

  /**
   * Update load status with state machine validation
   */
  async updateStatus(loadNumber: string, status: string, options?: { reason?: string }) {
    return this.loadStatusService.updateStatus(loadNumber, status, options);
  }

  /**
   * Revert a delivered load back to in_transit.
   * Only allowed when billingStatus is PENDING_DOCUMENTS.
   */
  async revertDelivery(tenantId: number, loadNumber: string, reason: string, userId?: number) {
    return this.loadStatusService.revertDelivery(tenantId, loadNumber, reason, userId);
  }

  /**
   * Update a draft load (scalar fields and/or stops)
   */
  async updateDraft(loadNumber: string, data: Parameters<LoadDraftService['updateDraft']>[1]) {
    return this.loadDraftService.updateDraft(loadNumber, data);
  }

  /**
   * Assign driver and vehicle to load
   */
  async assignLoad(loadNumber: string, driverId: string, vehicleId: string, trailerId?: string) {
    return this.loadAssignmentService.assignLoad(loadNumber, driverId, vehicleId, trailerId);
  }

  /**
   * Assign drivers (and optionally vehicles) to all legs of a relay load in one call.
   */
  async assignAllLegs(
    loadNumber: string,
    assignments: Parameters<LoadAssignmentService['assignAllLegs']>[1],
    tenantId: number,
  ) {
    return this.loadAssignmentService.assignAllLegs(loadNumber, assignments, tenantId);
  }

  /**
   * Delete a draft load (hard delete with all related records)
   */
  async deleteLoad(loadNumber: string, tenantId: number) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });

    if (!load) {
      throw new NotFoundException('Load not found');
    }

    if (load.status !== 'DRAFT') {
      throw new BadRequestException('Only draft loads can be deleted. Use cancel for non-draft loads.');
    }

    if (load.tripId) {
      throw new BadRequestException('Remove the load from its trip before deleting.');
    }

    // Delete in FK-safe order: events, notes, charges, stops, then load
    await this.prisma.$transaction([
      this.prisma.loadEvent.deleteMany({ where: { loadId: load.id } }),
      this.prisma.loadNote.deleteMany({ where: { loadId: load.id } }),
      this.prisma.loadCharge.deleteMany({ where: { loadId: load.id } }),
      this.prisma.loadStop.deleteMany({ where: { loadId: load.id } }),
      this.prisma.load.delete({ where: { id: load.id } }),
    ]);

    // Emit domain event for deletion
    await this.events.emit(SALLY_EVENTS.LOAD_DELETED, load.tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
    });

    this.logger.log(`Draft load ${loadNumber} deleted`);
    return { deleted: true, loadNumber };
  }

  /**
   * Find loads scoped to a specific customer ID
   */
  async findByCustomerId(customerId: number, tenantId?: number) {
    return this.customerLoadService.findByCustomerId(customerId, tenantId);
  }

  /**
   * Find a single load for a customer (validates customer ownership)
   */
  async findOneForCustomer(loadNumber: string, customerId: number) {
    return this.customerLoadService.findOneForCustomer(loadNumber, customerId);
  }

  /**
   * Create a load from customer portal request (creates as draft)
   */
  async createFromCustomerRequest(data: Parameters<CustomerLoadService['createFromCustomerRequest']>[0]) {
    return this.customerLoadService.createFromCustomerRequest(data);
  }

  /**
   * Get public tracking data by tracking token (no auth)
   */
  async getPublicTracking(token: string) {
    return this.loadTrackingService.getPublicTracking(token);
  }

  /**
   * Generate a tracking token for a load
   */
  async generateTrackingToken(loadNumber: string, tenantId: number, issuedByUserId: number) {
    return this.loadTrackingService.generateTrackingToken(loadNumber, tenantId, issuedByUserId);
  }

  /**
   * Duplicate an existing load
   */
  async duplicate(loadNumber: string, tenantId: number) {
    const original = await this.prisma.load.findFirst({
      where: { loadNumber },
      include: {
        stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
      },
    });
    if (!original) throw new NotFoundException(`Load not found: ${loadNumber}`);

    const newLoadNumber = `${original.loadNumber}-COPY`;

    const newLoad = await this.prisma.load.create({
      data: {
        loadNumber: newLoadNumber,
        status: 'DRAFT',
        weightLbs: original.weightLbs,
        commodityType: original.commodityType,
        specialRequirements: original.specialRequirements,
        customerName: original.customerName,
        requiredEquipmentType: (original as any).requiredEquipmentType ?? null,
        referenceNumber: original.referenceNumber,
        rateCents: original.rateCents,
        pieces: original.pieces,
        intakeSource: 'manual',
        customerId: original.customerId,
        tenantId,
        isActive: true,
      },
    });

    // Copy stops
    for (const loadStop of original.stops) {
      await this.prisma.loadStop.create({
        data: {
          loadId: newLoad.id,
          stopId: loadStop.stopId,
          sequenceOrder: loadStop.sequenceOrder,
          actionType: loadStop.actionType,
          estimatedDockHours: loadStop.estimatedDockHours,
        },
      });
    }

    // Copy relay structure if original is relay
    if (original.isRelay) {
      await this.prisma.load.update({
        where: { id: newLoad.id },
        data: { isRelay: true },
      });

      // Re-create legs from exchange stops (drivers/vehicles NOT copied — need fresh assignment)
      const exchangeStops = await this.prisma.loadStop.findMany({
        where: { loadId: newLoad.id, actionType: 'exchange' },
        select: { id: true },
      });

      if (exchangeStops.length > 0) {
        await this.loadLegService.createLegsFromExchangePoints(
          newLoad.id,
          exchangeStops.map((s) => s.id),
          tenantId,
        );
      }
    }

    const result = await this.prisma.load.findUnique({
      where: { id: newLoad.id },
      include: {
        stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
        trip: { select: { tripId: true, loadCount: true } },
      },
    });

    this.logger.log(`Load duplicated: ${loadNumber} -> ${newLoadNumber}`);

    // Emit domain event for duplicated load creation
    await this.events.emit(SALLY_EVENTS.LOAD_CREATED, newLoad.tenantId, {
      entityId: newLoad.loadNumber,
      entityType: 'load',
      loadNumber: newLoad.loadNumber,
    });

    return formatLoadResponse(result);
  }

  /**
   * Update stop status (ARRIVED → IN_PROGRESS → COMPLETED).
   * Drivers can update their own stops; dispatchers/admin/owners can update any.
   */
  async updateStopStatus(
    loadId: string,
    stopId: number,
    status: Exclude<LoadStopStatus, 'PENDING'>,
    userId: string,
    tenantId: number,
  ) {
    return this.stopStatusService.updateStopStatus(loadId, stopId, status, userId, tenantId);
  }

  // ---------------------------------------------------------------------------
  // Desk fan-out queries
  //
  // Narrow read queries used by Sally's Desk to find loads that a
  // responsibility should act on today. Also consumed by the corresponding
  // MCP tools (`get-in-flight-loads`, `get-delivered-loads-awaiting-closeout`)
  // so the Prisma query is defined in one place. MCP tools format for the
  // model, fan-out adapters map to {type, id}.
  // ---------------------------------------------------------------------------

  /**
   * Loads currently ASSIGNED or IN_TRANSIT — the "in-flight" surface for
   * `eta_monitoring`. Includes the next pending stop so callers can assess
   * ETA risk without a second query.
   */
  async findInFlightAtEtaRisk(tenantId: number, options: { limit?: number } = {}): Promise<InFlightLoadRow[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
      select: {
        loadNumber: true,
        referenceNumber: true,
        status: true,
        customerId: true,
        customerName: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
        pickupDate: true,
        deliveryDate: true,
        driver: { select: { driverId: true, name: true } },
        vehicle: { select: { vehicleId: true, unitNumber: true } },
        stops: {
          where: { status: 'PENDING' },
          orderBy: { sequenceOrder: 'asc' },
          take: 1,
          select: {
            sequenceOrder: true,
            actionType: true,
            appointmentDate: true,
            status: true,
          },
        },
      },
      orderBy: [{ deliveryDate: { sort: 'asc', nulls: 'last' } }, { pickupDate: { sort: 'asc', nulls: 'last' } }],
      take: options.limit ?? 200,
    });
    return loads.map((l) => {
      const nextStop = l.stops[0] ?? null;
      return {
        loadNumber: l.loadNumber,
        referenceNumber: l.referenceNumber,
        status: l.status,
        driverId: l.driver?.driverId ?? null,
        driverName: l.driver?.name ?? null,
        vehicleId: l.vehicle?.vehicleId ?? null,
        vehicleUnit: l.vehicle?.unitNumber ?? null,
        customerId: l.customerId,
        customerName: l.customerName,
        originCity: l.originCity,
        originState: l.originState,
        destinationCity: l.destinationCity,
        destinationState: l.destinationState,
        pickupDate: l.pickupDate ? toUtcCalendarDate(l.pickupDate) : null,
        deliveryDate: l.deliveryDate ? toUtcCalendarDate(l.deliveryDate) : null,
        nextStopSequence: nextStop?.sequenceOrder ?? null,
        nextStopAction: nextStop?.actionType ?? null,
        nextStopAppointmentDate: nextStop?.appointmentDate ? toUtcCalendarDate(nextStop.appointmentDate) : null,
        nextStopStatus: nextStop?.status ?? null,
      };
    });
  }

  /**
   * Loads marked DELIVERED within the window but not yet invoiced — the
   * "stall between delivered and invoiced" surface for `closeout_review`.
   */
  async findAwaitingCloseout(
    tenantId: number,
    options: { withinDays: number; limit?: number } = { withinDays: 7 },
  ): Promise<AwaitingCloseoutLoadRow[]> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - options.withinDays);

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
        status: 'DELIVERED',
        deliveredAt: { gte: since },
        invoices: { none: {} },
      },
      select: {
        loadNumber: true,
        referenceNumber: true,
        customerId: true,
        customerName: true,
        driver: { select: { driverId: true, name: true } },
        deliveredAt: true,
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
        rateCents: true,
        actualMiles: true,
      },
      orderBy: [{ deliveredAt: 'asc' }, { id: 'asc' }],
      take: options.limit ?? 100,
    });
    const now = Date.now();
    return loads
      .filter((l): l is typeof l & { deliveredAt: Date } => l.deliveredAt !== null)
      .map((l) => ({
        loadNumber: l.loadNumber,
        referenceNumber: l.referenceNumber,
        customerId: l.customerId,
        customerName: l.customerName,
        driverId: l.driver?.driverId ?? null,
        driverName: l.driver?.name ?? null,
        deliveredAt: l.deliveredAt.toISOString(),
        hoursSinceDelivered: Math.max(0, Math.round((now - l.deliveredAt.getTime()) / 3_600_000)),
        originCity: l.originCity,
        originState: l.originState,
        destinationCity: l.destinationCity,
        destinationState: l.destinationState,
        rateCents: l.rateCents,
        actualMiles: l.actualMiles,
      }));
  }
}

/** Row shape for `LoadsService.findInFlightAtEtaRisk`. */
export interface InFlightLoadRow {
  loadNumber: string;
  referenceNumber: string | null;
  status: LoadStatus;
  driverId: string | null;
  driverName: string | null;
  vehicleId: string | null;
  vehicleUnit: string | null;
  customerId: number;
  customerName: string;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  pickupDate: string | null;
  deliveryDate: string | null;
  nextStopSequence: number | null;
  nextStopAction: string | null;
  nextStopAppointmentDate: string | null;
  nextStopStatus: string | null;
}

/** Row shape for `LoadsService.findAwaitingCloseout`. */
export interface AwaitingCloseoutLoadRow {
  loadNumber: string;
  referenceNumber: string | null;
  customerId: number;
  customerName: string;
  driverId: string | null;
  driverName: string | null;
  deliveredAt: string;
  hoursSinceDelivered: number;
  originCity: string | null;
  originState: string | null;
  destinationCity: string | null;
  destinationState: string | null;
  rateCents: number | null;
  actualMiles: number | null;
}
