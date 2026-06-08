import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { RecurringLaneStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { LoadsService } from '../../loads/services/loads.service';
import { TimezoneService } from '../../../../shared/services/timezone.service';

const RECURRING_LANE_STATUS = RecurringLaneStatusSchema.enum;

const INCLUDE_STOPS = {
  stops: {
    include: { stop: true },
    orderBy: { sequenceOrder: 'asc' as const },
  },
};

@Injectable()
export class RecurringLanesService {
  private readonly logger = new Logger(RecurringLanesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly loadsService: LoadsService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async create(data: {
    tenantId: number;
    name: string;
    customerId?: number;
    customerName: string;
    requiredEquipmentType?: string;
    commodityType: string;
    weightLbs: number;
    rateCents?: number;
    pieces?: number;
    specialRequirements?: string;
    referenceNumber?: string;
    scheduleType: string;
    scheduleDays?: number[];
    scheduleCustomCron?: string;
    autoCreate?: boolean;
    autoAssignDriverId?: number;
    autoAssignVehicleId?: number;
    effectiveFrom?: string;
    effectiveUntil?: string;
    stops: Array<{
      stopId: number;
      sequenceOrder: number;
      actionType: string;
      earliestArrival?: string;
      latestArrival?: string;
      estimatedDockHours: number;
      dayOffset?: number;
      facilityNotes?: string;
    }>;
  }) {
    const seq = await this.counterService.nextValue(data.tenantId, 'lane');
    const laneId = `LANE-${String(seq).padStart(3, '0')}`;

    const lane = await this.prisma.recurringLane.create({
      data: {
        laneId,
        name: data.name,
        customerId: data.customerId ?? null,
        customerName: data.customerName,
        requiredEquipmentType: data.requiredEquipmentType ? (data.requiredEquipmentType as any) : null,
        commodityType: data.commodityType,
        weightLbs: data.weightLbs,
        rateCents: data.rateCents ?? null,
        pieces: data.pieces ?? null,
        specialRequirements: data.specialRequirements ?? null,
        referenceNumber: data.referenceNumber ?? null,
        scheduleType: data.scheduleType,
        scheduleDays: data.scheduleDays ?? null,
        scheduleCustomCron: data.scheduleCustomCron ?? null,
        autoCreate: data.autoCreate ?? false,
        autoAssignDriverId: data.autoAssignDriverId ?? null,
        autoAssignVehicleId: data.autoAssignVehicleId ?? null,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : null,
        effectiveUntil: data.effectiveUntil ? new Date(data.effectiveUntil) : null,
        status: RECURRING_LANE_STATUS.DRAFT,
        tenantId: data.tenantId,
        stops: {
          create: data.stops.map((s) => ({
            stopId: s.stopId,
            sequenceOrder: s.sequenceOrder,
            actionType: s.actionType,
            earliestArrival: s.earliestArrival ?? null,
            latestArrival: s.latestArrival ?? null,
            estimatedDockHours: s.estimatedDockHours,
            dayOffset: s.dayOffset ?? 0,
            facilityNotes: s.facilityNotes ?? null,
          })),
        },
      },
      include: INCLUDE_STOPS,
    });

    this.logger.log(`Created recurring lane ${laneId}`);
    return this.formatLaneResponse(lane);
  }

  async findAll(
    tenantId: number,
    params?: {
      search?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId, deletedAt: null };

    if (params?.status) {
      where.status = params.status;
    }

    if (params?.search) {
      where.OR = [
        { name: { contains: params.search, mode: 'insensitive' } },
        { customerName: { contains: params.search, mode: 'insensitive' } },
        { laneId: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const limit = params?.limit ?? 50;
    const offset = params?.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.recurringLane.findMany({
        where,
        include: INCLUDE_STOPS,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.recurringLane.count({ where }),
    ]);

    return {
      data: data.map((l) => this.formatLaneResponse(l)),
      total,
      limit,
      offset,
    };
  }

  async findById(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);
    return this.formatLaneResponse(lane);
  }

  private async findRawById(id: number, tenantId: number) {
    const lane = await this.prisma.recurringLane.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: INCLUDE_STOPS,
    });

    if (!lane) {
      throw new NotFoundException(`Recurring lane ${id} not found`);
    }

    return lane;
  }

  async update(
    id: number,
    tenantId: number,
    data: {
      name?: string;
      customerId?: number;
      customerName?: string;
      requiredEquipmentType?: string;
      commodityType?: string;
      weightLbs?: number;
      rateCents?: number;
      pieces?: number;
      specialRequirements?: string;
      referenceNumber?: string;
      scheduleType?: string;
      scheduleDays?: number[];
      scheduleCustomCron?: string;
      autoCreate?: boolean;
      autoAssignDriverId?: number;
      autoAssignVehicleId?: number;
      effectiveFrom?: string;
      effectiveUntil?: string;
      stops?: {
        stopId: number;
        sequenceOrder: number;
        actionType: 'pickup' | 'delivery' | 'both';
        earliestArrival?: string;
        latestArrival?: string;
        estimatedDockHours: number;
        dayOffset: number;
        facilityNotes?: string;
      }[];
    },
  ) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status === RECURRING_LANE_STATUS.EXPIRED) {
      throw new BadRequestException('Cannot update an expired lane');
    }

    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.requiredEquipmentType !== undefined) {
      updateData.requiredEquipmentType = data.requiredEquipmentType ? (data.requiredEquipmentType as any) : null;
    }
    if (data.commodityType !== undefined) updateData.commodityType = data.commodityType;
    if (data.weightLbs !== undefined) updateData.weightLbs = data.weightLbs;
    if (data.rateCents !== undefined) updateData.rateCents = data.rateCents;
    if (data.pieces !== undefined) updateData.pieces = data.pieces;
    if (data.specialRequirements !== undefined) updateData.specialRequirements = data.specialRequirements;
    if (data.referenceNumber !== undefined) updateData.referenceNumber = data.referenceNumber;
    if (data.scheduleType !== undefined) updateData.scheduleType = data.scheduleType;
    if (data.scheduleDays !== undefined) updateData.scheduleDays = data.scheduleDays;
    if (data.scheduleCustomCron !== undefined) updateData.scheduleCustomCron = data.scheduleCustomCron;
    if (data.autoCreate !== undefined) updateData.autoCreate = data.autoCreate;
    if (data.autoAssignDriverId !== undefined) updateData.autoAssignDriverId = data.autoAssignDriverId;
    if (data.autoAssignVehicleId !== undefined) updateData.autoAssignVehicleId = data.autoAssignVehicleId;
    if (data.effectiveFrom !== undefined)
      updateData.effectiveFrom = data.effectiveFrom ? new Date(data.effectiveFrom) : null;
    if (data.effectiveUntil !== undefined)
      updateData.effectiveUntil = data.effectiveUntil ? new Date(data.effectiveUntil) : null;

    // If stops are provided, delete-and-recreate (replace strategy)
    if (data.stops !== undefined) {
      updateData.stops = {
        deleteMany: {},
        create: data.stops.map((s) => ({
          stopId: s.stopId,
          sequenceOrder: s.sequenceOrder,
          actionType: s.actionType,
          earliestArrival: s.earliestArrival ?? null,
          latestArrival: s.latestArrival ?? null,
          estimatedDockHours: s.estimatedDockHours,
          dayOffset: s.dayOffset ?? 0,
          facilityNotes: s.facilityNotes ?? null,
        })),
      };
    }

    const updated = await this.prisma.recurringLane.update({
      where: { id },
      data: updateData,
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(updated);
  }

  async activate(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status !== RECURRING_LANE_STATUS.DRAFT && lane.status !== RECURRING_LANE_STATUS.PAUSED) {
      throw new BadRequestException(`Cannot activate lane in "${lane.status}" status`);
    }

    const nextRunDate = this.computeNextRunDate(lane.scheduleType, lane.scheduleDays as number[] | null, null);
    const nextGenDate = await this.deriveGenerationDate(nextRunDate, lane.tenantId);

    const activated = await this.prisma.recurringLane.update({
      where: { id },
      data: {
        status: RECURRING_LANE_STATUS.ACTIVE,
        nextScheduledRunDate: nextRunDate,
        nextGenerationDate: nextGenDate,
      },
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(activated);
  }

  async pause(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status !== RECURRING_LANE_STATUS.ACTIVE) {
      throw new BadRequestException(`Cannot pause lane in "${lane.status}" status`);
    }

    const paused = await this.prisma.recurringLane.update({
      where: { id },
      data: { status: RECURRING_LANE_STATUS.PAUSED },
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(paused);
  }

  async resume(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status !== RECURRING_LANE_STATUS.PAUSED) {
      throw new BadRequestException(`Cannot resume lane in "${lane.status}" status`);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let nextRunDate = lane.nextScheduledRunDate;
    if (!nextRunDate || nextRunDate < today) {
      nextRunDate = this.computeNextRunDate(lane.scheduleType, lane.scheduleDays as number[] | null, null);
    }
    const nextGenDate = await this.deriveGenerationDate(nextRunDate, lane.tenantId);

    const resumed = await this.prisma.recurringLane.update({
      where: { id },
      data: {
        status: RECURRING_LANE_STATUS.ACTIVE,
        nextScheduledRunDate: nextRunDate,
        nextGenerationDate: nextGenDate,
      },
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(resumed);
  }

  async expire(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status === RECURRING_LANE_STATUS.EXPIRED) {
      throw new BadRequestException('Lane is already expired');
    }

    const expired = await this.prisma.recurringLane.update({
      where: { id },
      data: {
        status: RECURRING_LANE_STATUS.EXPIRED,
        nextGenerationDate: null,
        nextScheduledRunDate: null,
      },
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(expired);
  }

  async softDelete(id: number, tenantId: number) {
    const lane = await this.prisma.recurringLane.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!lane) throw new NotFoundException('Lane not found');

    await this.prisma.recurringLane.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: RECURRING_LANE_STATUS.EXPIRED,
        nextGenerationDate: null,
        nextScheduledRunDate: null,
      },
    });

    return { message: 'Lane deleted' };
  }

  async skip(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status !== RECURRING_LANE_STATUS.ACTIVE) {
      throw new BadRequestException(`Cannot skip generation for lane in "${lane.status}" status`);
    }

    const skipped = await this.prisma.recurringLane.update({
      where: { id },
      data: { skipNextGeneration: true },
      include: INCLUDE_STOPS,
    });
    return this.formatLaneResponse(skipped);
  }

  async getUpcoming(tenantId: number) {
    const settings = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId },
      select: { laneGenerationLookaheadDays: true },
    });
    const lookaheadDays = settings?.laneGenerationLookaheadDays ?? 3;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const windowEnd = new Date(today);
    windowEnd.setDate(windowEnd.getDate() + lookaheadDays);

    const floor = new Date(today);
    floor.setDate(floor.getDate() - 30);

    const lanes = await this.prisma.recurringLane.findMany({
      where: {
        tenantId,
        status: RECURRING_LANE_STATUS.ACTIVE,
        deletedAt: null,
        nextGenerationDate: { gte: floor, lte: windowEnd },
      },
      include: INCLUDE_STOPS,
      orderBy: { nextGenerationDate: 'asc' },
    });

    return {
      data: lanes.map((l) => this.formatLaneResponse(l)),
      lookaheadDays,
    };
  }

  async preview(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    return {
      laneId: lane.laneId,
      laneName: lane.name,
      customerName: lane.customerName,
      commodityType: lane.commodityType,
      weightLbs: lane.weightLbs,
      requiredEquipmentType: lane.requiredEquipmentType ?? null,
      rateCents: lane.rateCents,
      pieces: lane.pieces,
      specialRequirements: lane.specialRequirements,
      referenceNumber: lane.referenceNumber,
      stops: lane.stops.map((s: any) => ({
        stopId: s.stopId,
        stopName: s.stop?.name,
        stopCity: s.stop?.city,
        stopState: s.stop?.state,
        sequenceOrder: s.sequenceOrder,
        actionType: s.actionType,
        earliestArrival: s.earliestArrival,
        latestArrival: s.latestArrival,
        estimatedDockHours: s.estimatedDockHours,
        dayOffset: s.dayOffset,
      })),
      autoAssignDriverId: lane.autoAssignDriverId,
      autoAssignVehicleId: lane.autoAssignVehicleId,
      nextGenerationDate: lane.nextGenerationDate,
    };
  }

  async generateLoad(id: number, tenantId: number) {
    const lane = await this.findRawById(id, tenantId);

    if (lane.status !== RECURRING_LANE_STATUS.ACTIVE) {
      throw new BadRequestException(`Cannot generate load for lane in "${lane.status}" status`);
    }

    const stops = lane.stops.map((s: any) => ({
      stopId: s.stop.stopId,
      name: s.stop.name,
      address: s.stop.address ?? undefined,
      city: s.stop.city ?? undefined,
      state: s.stop.state ?? undefined,
      zipCode: s.stop.zipCode ?? undefined,
      sequenceOrder: s.sequenceOrder,
      actionType: s.actionType,
      earliestArrival: s.earliestArrival ?? undefined,
      latestArrival: s.latestArrival ?? undefined,
      estimatedDockHours: s.estimatedDockHours,
    }));

    const load = await this.loadsService.create({
      tenantId,
      weightLbs: lane.weightLbs,
      commodityType: lane.commodityType,
      specialRequirements: lane.specialRequirements ?? undefined,
      customerName: lane.customerName,
      referenceNumber: lane.referenceNumber ?? undefined,
      rateCents: lane.rateCents ?? undefined,
      pieces: lane.pieces ?? undefined,
      customerId: lane.customerId ?? undefined,
      intakeSource: 'recurring_lane',
      intakeMetadata: { recurring_lane_id: lane.id, lane_id: lane.laneId },
      stops,
    });

    const nextRunDate = this.computeNextRunDate(
      lane.scheduleType,
      lane.scheduleDays as number[] | null,
      lane.nextScheduledRunDate,
    );
    const nextGenDate = await this.deriveGenerationDate(nextRunDate, lane.tenantId);

    await this.prisma.recurringLane.update({
      where: { id },
      data: {
        lastGeneratedAt: new Date(),
        totalLoadsGenerated: { increment: 1 },
        nextScheduledRunDate: nextRunDate,
        nextGenerationDate: nextGenDate,
        skipNextGeneration: false,
      },
    });

    this.logger.log(`Generated load from lane ${lane.laneId}: ${load.loadNumber}`);
    return load;
  }

  /**
   * Compute the next scheduled run date (when freight moves).
   * If currentRunDate is provided, compute the next occurrence AFTER it.
   * If null (first activation), compute the next occurrence after today.
   */
  computeNextRunDate(scheduleType: string, scheduleDays: number[] | null, currentRunDate: Date | null): Date {
    const anchor = currentRunDate
      ? new Date(currentRunDate.getFullYear(), currentRunDate.getMonth(), currentRunDate.getDate())
      : new Date();
    if (!currentRunDate) anchor.setHours(0, 0, 0, 0);

    switch (scheduleType) {
      case 'daily': {
        const next = new Date(anchor);
        next.setDate(next.getDate() + 1);
        return next;
      }
      case 'weekly': {
        if (!scheduleDays || scheduleDays.length === 0) {
          const next = new Date(anchor);
          next.setDate(next.getDate() + 7);
          return next;
        }
        const sorted = [...scheduleDays].sort((a, b) => a - b);
        const anchorDay = anchor.getDay();

        for (const day of sorted) {
          if (day > anchorDay) {
            const next = new Date(anchor);
            next.setDate(next.getDate() + (day - anchorDay));
            return next;
          }
        }
        const firstDay = sorted[0];
        const daysUntil = 7 - anchorDay + firstDay;
        const next = new Date(anchor);
        next.setDate(next.getDate() + daysUntil);
        return next;
      }
      case 'biweekly': {
        const next = new Date(anchor);
        next.setDate(next.getDate() + 14);
        return next;
      }
      case 'monthly': {
        const next = new Date(anchor);
        const targetMonth = next.getMonth() + 1;
        next.setMonth(targetMonth);
        // Clamp overflow (e.g., Jan 31 → Mar 3 should be Feb 28)
        if (next.getMonth() !== targetMonth % 12) {
          next.setDate(0); // last day of the intended target month
        }
        return next;
      }
      default: {
        const next = new Date(anchor);
        next.setDate(next.getDate() + 7);
        return next;
      }
    }
  }

  /**
   * Derive when the load record should be created (generation date).
   * genDate = runDate - lookaheadDays (from global setting), floored to the
   * tenant's LOCAL today (not server/UTC midnight) so a tenant ahead of/behind
   * UTC never floors to the wrong civil day.
   */
  async deriveGenerationDate(runDate: Date, tenantId: number): Promise<Date> {
    const settings = await this.prisma.fleetOperationsSettings.findFirst({
      where: { tenantId },
      select: { laneGenerationLookaheadDays: true },
    });
    const createDaysBefore = settings?.laneGenerationLookaheadDays ?? 3;
    const genDate = new Date(runDate);
    genDate.setDate(genDate.getDate() - createDaysBefore);

    const tz = await this.timezoneService.resolveTenantTimezone(tenantId);
    // Full ISO datetime with explicit T00:00:00.000Z — NOT the bare
    // `new Date('YYYY-MM-DD')` off-by-one trap.
    const tenantToday = new Date(`${this.timezoneService.localDate(tz)}T00:00:00.000Z`);
    return genDate < tenantToday ? tenantToday : genDate;
  }

  private formatLaneResponse(lane: any) {
    return {
      id: lane.id,
      laneId: lane.laneId,
      name: lane.name,
      customerId: lane.customerId ?? null,
      customerName: lane.customerName,
      requiredEquipmentType: lane.requiredEquipmentType ?? null,
      commodityType: lane.commodityType,
      weightLbs: lane.weightLbs,
      rateCents: lane.rateCents ?? null,
      pieces: lane.pieces ?? null,
      specialRequirements: lane.specialRequirements ?? null,
      referenceNumber: lane.referenceNumber ?? null,
      scheduleType: lane.scheduleType,
      scheduleDays: lane.scheduleDays ?? null,
      scheduleCustomCron: lane.scheduleCustomCron ?? null,
      autoCreate: lane.autoCreate,
      autoAssignDriverId: lane.autoAssignDriverId ?? null,
      autoAssignVehicleId: lane.autoAssignVehicleId ?? null,
      originCity: lane.originCity ?? null,
      originState: lane.originState ?? null,
      destinationCity: lane.destinationCity ?? null,
      destinationState: lane.destinationState ?? null,
      estimatedMiles: lane.estimatedMiles ?? null,
      status: lane.status,
      effectiveFrom: lane.effectiveFrom ? lane.effectiveFrom.toISOString().split('T')[0] : null,
      effectiveUntil: lane.effectiveUntil ? lane.effectiveUntil.toISOString().split('T')[0] : null,
      lastGeneratedAt: lane.lastGeneratedAt?.toISOString?.() ?? null,
      nextGenerationDate: lane.nextGenerationDate ? lane.nextGenerationDate.toISOString().split('T')[0] : null,
      nextScheduledRunDate: lane.nextScheduledRunDate ? lane.nextScheduledRunDate.toISOString().split('T')[0] : null,
      skipNextGeneration: lane.skipNextGeneration,
      totalLoadsGenerated: lane.totalLoadsGenerated,
      deletedAt: lane.deletedAt?.toISOString?.() ?? null,
      createdAt: lane.createdAt?.toISOString?.() ?? lane.createdAt,
      updatedAt: lane.updatedAt?.toISOString?.() ?? lane.updatedAt,
      stops:
        lane.stops?.map((s: any) => ({
          id: s.id,
          laneId: s.laneId,
          stopId: s.stopId,
          sequenceOrder: s.sequenceOrder,
          actionType: s.actionType,
          earliestArrival: s.earliestArrival ?? null,
          latestArrival: s.latestArrival ?? null,
          estimatedDockHours: s.estimatedDockHours,
          dayOffset: s.dayOffset,
          facilityNotes: s.facilityNotes ?? null,
          stopName: s.stop?.name ?? null,
          stopCity: s.stop?.city ?? null,
          stopState: s.stop?.state ?? null,
          stopAddress: s.stop?.address ?? null,
          stop: s.stop
            ? {
                id: s.stop.id,
                stopId: s.stop.stopId,
                name: s.stop.name,
                address: s.stop.address,
                city: s.stop.city,
                state: s.stop.state,
                zipCode: s.stop.zipCode,
                lat: s.stop.lat,
                lon: s.stop.lon,
              }
            : null,
        })) ?? [],
    };
  }
}
