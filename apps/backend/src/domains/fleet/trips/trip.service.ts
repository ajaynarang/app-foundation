import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { RoutePlanStatus, TripStatus, LoadStatus, DriverStatus, VehicleStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { clampPagination } from '../../../shared/utils/pagination';
import { validateTripManualTransition } from './utils/trip-status-machine';
import type { CreateTripDto } from './dto/create-trip.dto';
import type { AssignTripDto } from './dto/assign-trip.dto';
import type { UpdateTripDto } from './dto/update-trip.dto';
import type { TripListQueryDto } from './dto/trip-list-query.dto';

// Eligible-status sets for trip/load/vehicle rules. Typed as the full enum array so
// `.includes(entity.status)` accepts any enum value (a bare literal array would narrow
// to just its elements and reject the broader enum — TS2345).
const LOAD_ELIGIBLE_FOR_TRIP: readonly LoadStatus[] = [LoadStatus.DRAFT, LoadStatus.PENDING];
const LOAD_ELIGIBLE_FOR_ADD: readonly LoadStatus[] = [LoadStatus.DRAFT, LoadStatus.PENDING, LoadStatus.ASSIGNED];
const TRIP_ASSIGNABLE: readonly TripStatus[] = [TripStatus.DRAFT, TripStatus.ASSIGNED];
const TRIP_TERMINAL: readonly TripStatus[] = [TripStatus.COMPLETED, TripStatus.CANCELLED];
const VEHICLE_USABLE: readonly VehicleStatus[] = [VehicleStatus.AVAILABLE, VehicleStatus.ASSIGNED];

@Injectable()
export class TripService {
  private readonly logger = new Logger(TripService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly events: DomainEventService,
    private readonly cache: SallyCacheService,
  ) {}

  // ─── CREATE ────────────────────────────────────────────────────────

  async create(tenantId: number, dto: CreateTripDto, userId: number) {
    // Validate loads exist, same tenant, eligible status, not in another trip
    const loads = await this.prisma.load.findMany({
      where: {
        loadNumber: { in: dto.loadIds },
        tenantId,
      },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        tripId: true,
        isRelay: true,
        pickupDate: true,
        tenantId: true,
        rateCents: true,
        estimatedMiles: true,
      },
      orderBy: { pickupDate: 'asc' },
    });

    // Rule #2: all loads must exist in this tenant
    if (loads.length !== dto.loadIds.length) {
      const foundIds = loads.map((l) => l.loadNumber);
      const missing = dto.loadIds.filter((id) => !foundIds.includes(id));
      throw new BadRequestException(`Loads not found: ${missing.join(', ')}`);
    }

    for (const load of loads) {
      // Rule #3: only draft or pending loads
      if (!LOAD_ELIGIBLE_FOR_TRIP.includes(load.status)) {
        throw new BadRequestException(
          `Load ${load.loadNumber} has status '${load.status}'. Only draft or pending loads can be added to a trip.`,
        );
      }
      // Rule #4: not in another trip
      if (load.tripId) {
        throw new BadRequestException(`Load ${load.loadNumber} is already in a trip.`);
      }
      // Rule #5: no relay loads
      if (load.isRelay) {
        throw new BadRequestException(`Load ${load.loadNumber} is a relay load. Relay loads cannot be part of a trip.`);
      }
    }

    // Generate trip ID
    const dateStr = new Date().toISOString().slice(0, 10);
    const seq = await this.counterService.nextValue(tenantId, `trip:${dateStr}`);
    const tripId = `TRIP-${dateStr.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;

    // Resolve optional driver/vehicle
    let driverDbId: number | null = null;
    let vehicleDbId: number | null = null;
    let initialStatus: TripStatus = TripStatus.DRAFT;

    if (dto.driverId && dto.vehicleId) {
      const driver = await this.resolveDriver(dto.driverId, tenantId);
      const vehicle = await this.resolveVehicle(dto.vehicleId, tenantId);
      driverDbId = driver.id;
      vehicleDbId = vehicle.id;
      initialStatus = TripStatus.ASSIGNED;
    } else if (dto.driverId || dto.vehicleId) {
      throw new BadRequestException('Both driverId and vehicleId must be provided together, or neither.');
    }

    // Calculate totals from validated loads
    const totalRevenueCents = loads.reduce((sum, l) => sum + (l.rateCents ?? 0), 0);
    const totalMilesCalc = loads.reduce((sum, l) => sum + (l.estimatedMiles ?? 0), 0);

    // Create trip and update loads in a transaction
    const trip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          tripId,
          tenantId,
          driverId: driverDbId,
          vehicleId: vehicleDbId,
          status: initialStatus,
          loadCount: loads.length,
          totalMiles: totalMilesCalc || null,
          totalRevenueCents: totalRevenueCents || null,
          createdBy: userId,
          assignedAt: initialStatus === TripStatus.ASSIGNED ? new Date() : null,
        },
      });

      // Set tripOrder by pickup date order (already sorted)
      for (let i = 0; i < loads.length; i++) {
        const updateData: any = {
          tripId: created.id,
          tripOrder: i + 1,
        };
        // If assigning driver/vehicle, sync to loads
        if (driverDbId && vehicleDbId) {
          updateData.driverId = driverDbId;
          updateData.vehicleId = vehicleDbId;
          if (loads[i].status === LoadStatus.DRAFT || loads[i].status === LoadStatus.PENDING) {
            updateData.status = LoadStatus.ASSIGNED;
            updateData.assignedAt = new Date();
          }
        }
        await tx.load.update({
          where: { id: loads[i].id },
          data: updateData,
        });
      }

      return created;
    });

    this.logger.log(`Trip created: ${tripId} with ${loads.length} loads`);

    await this.events.emit(SALLY_EVENTS.TRIP_CREATED, tenantId, {
      entityId: trip.tripId,
      entityType: 'trip',
      tripId: trip.tripId,
      loadCount: trip.loadCount,
      status: trip.status,
    });

    return this.findOne(tenantId, tripId);
  }

  // ─── FIND ALL ──────────────────────────────────────────────────────

  async findAll(tenantId: number, query: TripListQueryDto) {
    const where: any = { tenantId };

    if (query.status) {
      // Accept a single status or a comma-separated set (e.g. the By-Trip view
      // requests all active statuses at once). Mirrors the loads list filter.
      const normalized = query.status.toUpperCase();
      where.status = normalized.includes(',') ? { in: normalized.split(',') } : normalized;
    }

    if (query.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { driverId: query.driverId, tenantId },
      });
      if (driver) {
        where.driverId = driver.id;
      } else {
        return {
          data: [],
          total: 0,
          limit: query.limit || 20,
          offset: query.offset || 0,
        };
      }
    }

    if (query.vehicleId) {
      const vehicle = await this.prisma.vehicle.findFirst({
        where: { vehicleId: query.vehicleId, tenantId },
      });
      if (vehicle) {
        where.vehicleId = vehicle.id;
      } else {
        return {
          data: [],
          total: 0,
          limit: query.limit || 20,
          offset: query.offset || 0,
        };
      }
    }

    if (query.dateFrom || query.dateTo) {
      const dateFilter: any = {};
      if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
      if (query.dateTo) {
        const endDate = new Date(query.dateTo);
        endDate.setDate(endDate.getDate() + 1);
        dateFilter.lt = endDate;
      }
      where.createdAt = dateFilter;
    }

    if (query.search) {
      where.OR = [
        { tripId: { contains: query.search, mode: 'insensitive' as const } },
        {
          driver: {
            name: { contains: query.search, mode: 'insensitive' as const },
          },
        },
      ];
    }

    // Sort field mapping
    const sortFieldMap: Record<string, string> = {
      createdAt: 'createdAt',
      assignedAt: 'assignedAt',
      totalRevenueCents: 'totalRevenueCents',
      loadCount: 'loadCount',
    };
    const sortField = sortFieldMap[query.sortBy || ''] || 'createdAt';
    const sortOrder = query.sortOrder || 'desc';

    const [trips, total] = await Promise.all([
      this.prisma.trip.findMany({
        where,
        include: {
          driver: { select: { name: true, driverId: true } },
          vehicle: { select: { unitNumber: true, vehicleId: true } },
        },
        orderBy: { [sortField]: sortOrder },
        ...clampPagination({ limit: query.limit, offset: query.offset }),
      }),
      this.prisma.trip.count({ where }),
    ]);

    const data = trips.map((c) => ({
      id: c.id,
      tripId: c.tripId,
      status: c.status,
      loadCount: c.loadCount,
      totalMiles: c.totalMiles,
      totalRevenueCents: c.totalRevenueCents,
      driverName: c.driver?.name ?? null,
      driverStringId: c.driver?.driverId ?? null,
      vehicleUnitNumber: c.vehicle?.unitNumber ?? null,
      createdAt: c.createdAt.toISOString(),
      assignedAt: c.assignedAt?.toISOString() ?? null,
      startedAt: c.startedAt?.toISOString() ?? null,
      completedAt: c.completedAt?.toISOString() ?? null,
    }));

    return {
      data,
      total,
      limit: query.limit || 20,
      offset: query.offset || 0,
    };
  }

  // ─── FIND ONE ──────────────────────────────────────────────────────

  async findOne(tenantId: number, tripId: string) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: {
        driver: { select: { name: true, driverId: true } },
        vehicle: { select: { unitNumber: true, vehicleId: true } },
        loads: {
          select: {
            id: true,
            loadNumber: true,
            referenceNumber: true,
            status: true,
            tripOrder: true,
            customerName: true,
            originCity: true,
            originState: true,
            destinationCity: true,
            destinationState: true,
            rateCents: true,
            estimatedMiles: true,
            pickupDate: true,
            deliveryDate: true,
          },
          orderBy: { tripOrder: 'asc' },
        },
        routePlans: {
          where: { status: { in: [RoutePlanStatus.ACTIVE, RoutePlanStatus.DRAFT] } },
          select: { planId: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    return {
      id: trip.id,
      tripId: trip.tripId,
      tenantId: trip.tenantId,
      driverId: trip.driverId,
      vehicleId: trip.vehicleId,
      status: trip.status,
      loadCount: trip.loadCount,
      totalMiles: trip.totalMiles,
      totalRevenueCents: trip.totalRevenueCents,
      createdAt: trip.createdAt.toISOString(),
      createdBy: trip.createdBy,
      updatedAt: trip.updatedAt.toISOString(),
      assignedAt: trip.assignedAt?.toISOString() ?? null,
      startedAt: trip.startedAt?.toISOString() ?? null,
      completedAt: trip.completedAt?.toISOString() ?? null,
      cancelledAt: trip.cancelledAt?.toISOString() ?? null,
      driverName: trip.driver?.name ?? null,
      driverStringId: trip.driver?.driverId ?? null,
      vehicleUnitNumber: trip.vehicle?.unitNumber ?? null,
      loads: trip.loads.map((l) => ({
        id: l.id,
        loadNumber: l.loadNumber,
        referenceNumber: l.referenceNumber ?? null,
        status: l.status,
        tripOrder: l.tripOrder,
        customerName: l.customerName,
        originCity: l.originCity,
        originState: l.originState,
        destinationCity: l.destinationCity,
        destinationState: l.destinationState,
        rateCents: l.rateCents,
        estimatedMiles: l.estimatedMiles,
        pickupDate: l.pickupDate ? l.pickupDate.toISOString().slice(0, 10) : null,
        deliveryDate: l.deliveryDate ? l.deliveryDate.toISOString().slice(0, 10) : null,
      })),
      routePlanId: trip.routePlans[0]?.planId ?? null,
    };
  }

  // ─── ASSIGN ────────────────────────────────────────────────────────

  async assign(tenantId: number, tripId: string, dto: AssignTripDto, _userId: number) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: { loads: { select: { id: true, status: true } } },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    // Only draft trips can be assigned (or re-assigned if already assigned)
    if (!TRIP_ASSIGNABLE.includes(trip.status)) {
      throw new BadRequestException(`Cannot assign trip in '${trip.status}' status.`);
    }

    const driver = await this.resolveDriver(dto.driverId, tenantId);
    const vehicle = await this.resolveVehicle(dto.vehicleId, tenantId);

    await this.prisma.$transaction(async (tx) => {
      // Update trip
      const updateData: any = {
        driverId: driver.id,
        vehicleId: vehicle.id,
        status: TripStatus.ASSIGNED,
        assignedAt: trip.assignedAt ?? new Date(),
      };
      await tx.trip.update({
        where: { id: trip.id },
        data: updateData,
      });

      // Sync driver/vehicle to all loads and transition eligible loads
      for (const load of trip.loads) {
        const loadUpdate: any = {
          driverId: driver.id,
          vehicleId: vehicle.id,
        };
        if (LOAD_ELIGIBLE_FOR_TRIP.includes(load.status)) {
          loadUpdate.status = LoadStatus.ASSIGNED;
          loadUpdate.assignedAt = new Date();
        }
        await tx.load.update({
          where: { id: load.id },
          data: loadUpdate,
        });
      }
    });

    this.logger.log(`Trip ${tripId} assigned to driver ${dto.driverId} and vehicle ${dto.vehicleId}`);

    await this.events.emit(SALLY_EVENTS.TRIP_ASSIGNED, tenantId, {
      entityId: tripId,
      entityType: 'trip',
      tripId,
      driverId: driver.driverId,
      vehicleId: vehicle.vehicleId,
    });

    // Check if route plan exists and mark stale
    await this.checkAndEmitRouteStale(trip.id, tenantId, tripId);

    return this.findOne(tenantId, tripId);
  }

  // ─── ADD LOAD ──────────────────────────────────────────────────────

  async addLoad(tenantId: number, tripId: string, loadNumber: string, _userId: number) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: { loads: { select: { id: true } } },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    if (TRIP_TERMINAL.includes(trip.status)) {
      throw new BadRequestException(`Cannot add loads to a ${trip.status} trip.`);
    }

    // Rule #6: max 10 loads
    if (trip.loads.length >= 10) {
      throw new BadRequestException('A trip can have a maximum of 10 loads.');
    }

    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        tripId: true,
        isRelay: true,
        rateCents: true,
        estimatedMiles: true,
      },
    });

    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }
    if (load.tripId) {
      throw new BadRequestException(`Load ${loadNumber} is already in a trip.`);
    }
    if (!LOAD_ELIGIBLE_FOR_ADD.includes(load.status)) {
      throw new BadRequestException(
        `Load ${loadNumber} has status '${load.status}'. Only draft, pending, or assigned loads can be added.`,
      );
    }
    if (load.isRelay) {
      throw new BadRequestException(`Load ${loadNumber} is a relay load and cannot be added to a trip.`);
    }

    const newOrder = trip.loads.length + 1;

    await this.prisma.$transaction(async (tx) => {
      // Sync driver/vehicle to new load if trip is assigned
      const loadUpdate: any = {
        tripId: trip.id,
        tripOrder: newOrder,
      };
      if (trip.driverId && trip.vehicleId) {
        loadUpdate.driverId = trip.driverId;
        loadUpdate.vehicleId = trip.vehicleId;
        if (LOAD_ELIGIBLE_FOR_TRIP.includes(load.status)) {
          loadUpdate.status = LoadStatus.ASSIGNED;
          loadUpdate.assignedAt = new Date();
        }
      }
      await tx.load.update({
        where: { id: load.id },
        data: loadUpdate,
      });

      // Recalc summary
      await this.recalcSummaryInTx(tx, trip.id);
    });

    this.logger.log(`Load ${loadNumber} added to trip ${tripId}`);

    await this.events.emit(SALLY_EVENTS.TRIP_LOAD_ADDED, tenantId, {
      entityId: tripId,
      entityType: 'trip',
      tripId,
      loadNumber,
    });

    await this.checkAndEmitRouteStale(trip.id, tenantId, tripId);

    return this.findOne(tenantId, tripId);
  }

  // ─── REMOVE LOAD ──────────────────────────────────────────────────

  async removeLoad(tenantId: number, tripId: string, loadNumber: string, _userId: number) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: {
        loads: { select: { id: true, loadNumber: true, tripOrder: true } },
      },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    if (TRIP_TERMINAL.includes(trip.status)) {
      throw new BadRequestException(`Cannot remove loads from a ${trip.status} trip.`);
    }

    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId, tripId: trip.id },
    });

    if (!load) {
      throw new NotFoundException(`Load ${loadNumber} is not in trip ${tripId}.`);
    }

    // Must keep at least 2 loads — if removing would leave 1, cancel the trip instead
    if (trip.loads.length <= 2) {
      throw new BadRequestException('A trip must have at least 2 loads. Cancel the trip instead of removing loads.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Release load from trip
      const loadUpdate: any = {
        tripId: null,
        tripOrder: null,
      };
      // If load was assigned via trip, revert to pending
      if (load.status === LoadStatus.ASSIGNED && trip.driverId) {
        loadUpdate.status = LoadStatus.PENDING;
        loadUpdate.assignedAt = null;
        loadUpdate.driverId = null;
        loadUpdate.vehicleId = null;
      }
      await tx.load.update({
        where: { id: load.id },
        data: loadUpdate,
      });

      // Reorder remaining loads by current tripOrder
      const remainingLoads = trip.loads
        .filter((l) => l.id !== load.id)
        .sort((a, b) => (a as any).tripOrder - (b as any).tripOrder);
      for (let i = 0; i < remainingLoads.length; i++) {
        await tx.load.update({
          where: { id: remainingLoads[i].id },
          data: { tripOrder: i + 1 },
        });
      }

      // Recalc summary
      await this.recalcSummaryInTx(tx, trip.id);
    });

    this.logger.log(`Load ${loadNumber} removed from trip ${tripId}`);

    await this.events.emit(SALLY_EVENTS.TRIP_LOAD_REMOVED, tenantId, {
      entityId: tripId,
      entityType: 'trip',
      tripId,
      loadNumber,
    });

    await this.checkAndEmitRouteStale(trip.id, tenantId, tripId);

    return this.findOne(tenantId, tripId);
  }

  // ─── CANCEL ────────────────────────────────────────────────────────

  async cancel(tenantId: number, tripId: string, _userId: number) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: { loads: { select: { id: true, status: true } } },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    validateTripManualTransition(trip.status, TripStatus.CANCELLED);

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.update({
        where: { id: trip.id },
        data: {
          status: TripStatus.CANCELLED,
          cancelledAt: new Date(),
        },
      });

      // Release all loads from trip
      for (const load of trip.loads) {
        const loadUpdate: any = {
          tripId: null,
          tripOrder: null,
        };
        // If load was assigned via trip, revert to pending
        if (load.status === LoadStatus.ASSIGNED) {
          loadUpdate.status = LoadStatus.PENDING;
          loadUpdate.assignedAt = null;
          loadUpdate.driverId = null;
          loadUpdate.vehicleId = null;
        }
        await tx.load.update({
          where: { id: load.id },
          data: loadUpdate,
        });
      }
    });

    this.logger.log(`Trip ${tripId} cancelled`);

    await this.events.emit(SALLY_EVENTS.TRIP_CANCELLED, tenantId, {
      entityId: tripId,
      entityType: 'trip',
      tripId,
    });

    return this.findOne(tenantId, tripId);
  }

  // ─── UPDATE (reorder loads) ────────────────────────────────────────

  async update(tenantId: number, tripId: string, dto: UpdateTripDto) {
    const trip = await this.prisma.trip.findFirst({
      where: { tripId, tenantId },
      include: { loads: { select: { id: true, loadNumber: true } } },
    });

    if (!trip) {
      throw new NotFoundException(`Trip not found: ${tripId}`);
    }

    if (TRIP_TERMINAL.includes(trip.status)) {
      throw new BadRequestException(`Cannot update a ${trip.status} trip.`);
    }

    if (dto.loadOrder) {
      const tripLoadIds = trip.loads.map((l) => l.loadNumber);
      for (const item of dto.loadOrder) {
        if (!tripLoadIds.includes(item.loadId)) {
          throw new BadRequestException(`Load ${item.loadId} is not in this trip.`);
        }
      }

      await this.prisma.$transaction(async (tx) => {
        for (const item of dto.loadOrder) {
          const load = trip.loads.find((l) => l.loadNumber === item.loadId);
          if (load) {
            await tx.load.update({
              where: { id: load.id },
              data: { tripOrder: item.tripOrder },
            });
          }
        }
      });

      await this.checkAndEmitRouteStale(trip.id, tenantId, tripId);
    }

    return this.findOne(tenantId, tripId);
  }

  // ─── SYNC TRIP STATUS FROM LOADS ─────────────────────────────────

  async syncTripStatusFromLoads(tripDbId: number) {
    // Use optimistic concurrency: include current status in WHERE clause
    // to prevent race conditions when multiple load status changes fire concurrently
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripDbId },
      include: {
        loads: { select: { status: true } },
      },
    });

    if (!trip || TRIP_TERMINAL.includes(trip.status)) {
      return;
    }

    const loadStatuses = trip.loads.map((l) => l.status);

    // All loads assigned + trip is draft → assigned
    if (
      loadStatuses.length > 0 &&
      loadStatuses.every((s) => s === LoadStatus.ASSIGNED) &&
      trip.status === TripStatus.DRAFT
    ) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: trip.id, status: TripStatus.DRAFT },
        data: {
          status: TripStatus.ASSIGNED,
          assignedAt: trip.assignedAt ?? new Date(),
        },
      });
      if (updated.count > 0) {
        await this.events.emit(SALLY_EVENTS.TRIP_ASSIGNED, trip.tenantId, {
          tripId: trip.tripId,
        });
      }
      return;
    }

    // Any load in_transit + trip is assigned → in_progress
    if (loadStatuses.some((s) => s === LoadStatus.IN_TRANSIT) && trip.status === TripStatus.ASSIGNED) {
      // Optimistic: only update if status is still ASSIGNED
      const updated = await this.prisma.trip.updateMany({
        where: { id: trip.id, status: TripStatus.ASSIGNED },
        data: {
          status: TripStatus.IN_PROGRESS,
          startedAt: trip.startedAt ?? new Date(),
        },
      });
      if (updated.count > 0) {
        await this.events.emit(SALLY_EVENTS.TRIP_STARTED, trip.tenantId, {
          entityId: trip.tripId,
          entityType: 'trip',
          tripId: trip.tripId,
        });
      }
      return;
    }

    // All loads delivered + trip is in_progress → completed
    if (
      loadStatuses.length > 0 &&
      loadStatuses.every((s) => s === LoadStatus.DELIVERED) &&
      trip.status === TripStatus.IN_PROGRESS
    ) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: trip.id, status: TripStatus.IN_PROGRESS },
        data: { status: TripStatus.COMPLETED, completedAt: new Date() },
      });
      if (updated.count > 0) {
        await this.events.emit(SALLY_EVENTS.TRIP_COMPLETED, trip.tenantId, {
          entityId: trip.tripId,
          entityType: 'trip',
          tripId: trip.tripId,
        });
      }
      return;
    }

    // All loads cancelled → cancel trip
    if (loadStatuses.length > 0 && loadStatuses.every((s) => s === LoadStatus.CANCELLED)) {
      const updated = await this.prisma.trip.updateMany({
        where: { id: trip.id, status: { notIn: [TripStatus.COMPLETED, TripStatus.CANCELLED] } },
        data: { status: TripStatus.CANCELLED, cancelledAt: new Date() },
      });
      if (updated.count > 0) {
        await this.events.emit(SALLY_EVENTS.TRIP_CANCELLED, trip.tenantId, {
          entityId: trip.tripId,
          entityType: 'trip',
          tripId: trip.tripId,
        });
      }
    }
  }

  // ─── HELPERS ───────────────────────────────────────────────────────

  private async resolveDriver(driverId: string, tenantId: number) {
    const driver = await this.prisma.driver.findFirst({
      where: { driverId, tenantId },
      select: { id: true, driverId: true, name: true, status: true },
    });
    if (!driver) {
      throw new NotFoundException(`Driver not found: ${driverId}`);
    }
    if (driver.status !== DriverStatus.ACTIVE) {
      throw new BadRequestException(`Driver ${driverId} is not active (status: ${driver.status}).`);
    }
    return driver;
  }

  private async resolveVehicle(vehicleId: string, tenantId: number) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { vehicleId, tenantId },
      select: { id: true, vehicleId: true, unitNumber: true, status: true },
    });
    if (!vehicle) {
      throw new NotFoundException(`Vehicle not found: ${vehicleId}`);
    }
    if (!VEHICLE_USABLE.includes(vehicle.status)) {
      throw new BadRequestException(`Vehicle ${vehicleId} is not available (status: ${vehicle.status}).`);
    }
    return vehicle;
  }

  private async recalcSummaryInTx(tx: any, tripDbId: number) {
    const loads = await tx.load.findMany({
      where: { tripId: tripDbId },
      select: { rateCents: true, estimatedMiles: true },
    });

    await tx.trip.update({
      where: { id: tripDbId },
      data: {
        loadCount: loads.length,
        totalMiles: loads.reduce((sum: number, l: any) => sum + (l.estimatedMiles ?? 0), 0) || null,
        totalRevenueCents: loads.reduce((sum: number, l: any) => sum + (l.rateCents ?? 0), 0) || null,
      },
    });
  }

  private async checkAndEmitRouteStale(tripDbId: number, tenantId: number, tripId: string) {
    const routePlan = await this.prisma.routePlan.findFirst({
      where: { tripId: tripDbId, status: { in: [RoutePlanStatus.ACTIVE, RoutePlanStatus.DRAFT] } },
      select: { planId: true },
    });
    if (routePlan) {
      await this.events.emit(SALLY_EVENTS.TRIP_ROUTE_STALE, tenantId, {
        entityId: tripId,
        entityType: 'trip',
        tripId,
        routePlanId: routePlan.planId,
      });
    }
  }
}
