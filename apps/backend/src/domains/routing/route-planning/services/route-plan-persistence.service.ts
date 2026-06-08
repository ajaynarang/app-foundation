import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import { LoadLegStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { buildDateRangeFilter } from '../../../../shared/utils/date-range';
import { LoadLegService } from '../../../fleet/loads/services/load-leg.service';

const LOAD_LEG_STATUS = LoadLegStatusSchema.enum;

// ============================================================================
// INTERFACES
// ============================================================================

export interface CreateSegmentData {
  segmentId: string;
  sequenceOrder: number;
  fromLocation?: string;
  toLocation?: string;
  segmentType: string; // 'drive' | 'rest' | 'fuel' | 'dock'
  distanceMiles?: number;
  driveTimeHours?: number;
  restType?: string;
  restDurationHours?: number;
  restReason?: string;
  fuelGallons?: number;
  fuelCostEstimate?: number;
  fuelStationName?: string;
  dockDurationHours?: number;
  customerName?: string;
  hosStateAfter?: any;
  estimatedArrival?: Date;
  estimatedDeparture?: Date;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  timezone?: string;
  actionType?: string;
  appointmentWindow?: any;
  fuelPricePerGallon?: number;
  detourMiles?: number;
  isDocktimeConverted?: boolean;
  weatherAlerts?: any;
  decisionReason?: any;
  arrivalBufferMinutes?: number;
  routeGeometry?: string;
  fuelStateAfter?: any;
  stopId?: number;
}

export interface CreatePlanData {
  planId: string;
  driverId: number;
  vehicleId: number;
  tenantId: number;
  status?: RoutePlanStatus;
  optimizationPriority?: string;
  totalDistanceMiles: number;
  totalDriveTimeHours: number;
  totalOnDutyTimeHours: number;
  totalCostEstimate: number;
  totalTripTimeHours: number;
  totalDrivingDays: number;
  isFeasible: boolean;
  feasibilityIssues?: any;
  complianceReport?: any;
  departureTime?: Date;
  estimatedArrival?: Date;
  dispatcherParams?: any;
  dailyBreakdown?: any;
  costBreakdown?: any;
  initialFuelPercent?: number;
  segments: CreateSegmentData[];
  loadIds: number[];
}

export interface PlanFilters {
  tenantId?: number;
  driverId?: number;
  status?: string;
  isActive?: boolean;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}

// ============================================================================
// HELPERS — dollar ↔ cent conversion
// ============================================================================

/** Convert a dollar amount to integer cents for DB storage. */
function dollarsToCents(dollars: number | undefined | null): number | undefined {
  if (dollars == null) return undefined;
  return Math.round(dollars * 100);
}

/** Convert integer cents from DB back to dollars for API responses. */
function centsToDollars(cents: number | null): number | null {
  if (cents == null) return null;
  return cents / 100;
}

/**
 * Convert cents fields on a plan row (and its segments) back to dollars.
 * Mutates in-place for convenience; works on any plan-shaped object.
 */
function convertPlanCentsToDollars<
  T extends { totalCostEstimate: number | null; segments?: S[] },
  S extends { fuelCostEstimate?: number | null },
>(plan: T): T {
  (plan as any).totalCostEstimate = centsToDollars(plan.totalCostEstimate);
  if (plan.segments) {
    for (const seg of plan.segments) {
      (seg as any).fuelCostEstimate = centsToDollars(seg.fuelCostEstimate ?? null);
    }
  }
  return plan;
}

// ============================================================================
// SERVICE
// ============================================================================

/**
 * RoutePlanPersistenceService handles all database operations for route plans.
 *
 * Responsible for creating, reading, updating, and querying RoutePlan records
 * along with their associated RouteSegments and RoutePlanLoad join records.
 * All multi-step writes use Prisma transactions to ensure data consistency.
 */
@Injectable()
export class RoutePlanPersistenceService {
  private readonly logger = new Logger(RoutePlanPersistenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LoadLegService))
    private readonly loadLegService: LoadLegService,
  ) {}

  /**
   * Create a route plan with all segments and load associations in a single transaction.
   *
   * Creates the RoutePlan record, all RouteSegment records (ordered by sequenceOrder),
   * and RoutePlanLoad join records linking the plan to its loads.
   *
   * @param data - The plan data including segments and load IDs
   * @returns The created plan with segments and loads included
   */
  async createPlan(data: CreatePlanData) {
    const { segments, loadIds, ...planFields } = data;

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the route plan
      const plan = await tx.routePlan.create({
        data: {
          planId: planFields.planId,
          driverId: planFields.driverId,
          vehicleId: planFields.vehicleId,
          tenantId: planFields.tenantId,
          status: planFields.status ?? RoutePlanStatus.DRAFT,
          optimizationPriority: planFields.optimizationPriority ?? 'minimize_time',
          totalDistanceMiles: planFields.totalDistanceMiles,
          totalDriveTimeHours: planFields.totalDriveTimeHours,
          totalOnDutyTimeHours: planFields.totalOnDutyTimeHours,
          totalCostEstimate: dollarsToCents(planFields.totalCostEstimate) ?? 0,
          totalTripTimeHours: planFields.totalTripTimeHours,
          totalDrivingDays: planFields.totalDrivingDays,
          isFeasible: planFields.isFeasible,
          feasibilityIssues: planFields.feasibilityIssues ?? undefined,
          complianceReport: planFields.complianceReport ?? undefined,
          departureTime: planFields.departureTime ?? undefined,
          estimatedArrival: planFields.estimatedArrival ?? undefined,
          dispatcherParams: planFields.dispatcherParams ?? undefined,
          dailyBreakdown: planFields.dailyBreakdown ?? undefined,
          costBreakdown: planFields.costBreakdown ?? undefined,
          initialFuelPercent: planFields.initialFuelPercent ?? undefined,
        },
      });

      // 2. Create all segments
      for (const segment of segments) {
        await tx.routeSegment.create({
          data: {
            segmentId: segment.segmentId,
            planId: plan.id,
            sequenceOrder: segment.sequenceOrder,
            fromLocation: segment.fromLocation ?? undefined,
            toLocation: segment.toLocation ?? undefined,
            segmentType: segment.segmentType,
            distanceMiles: segment.distanceMiles ?? undefined,
            driveTimeHours: segment.driveTimeHours ?? undefined,
            restType: segment.restType ?? undefined,
            restDurationHours: segment.restDurationHours ?? undefined,
            restReason: segment.restReason ?? undefined,
            fuelGallons: segment.fuelGallons ?? undefined,
            fuelCostEstimate: dollarsToCents(segment.fuelCostEstimate),
            fuelStationName: segment.fuelStationName ?? undefined,
            dockDurationHours: segment.dockDurationHours ?? undefined,
            customerName: segment.customerName ?? undefined,
            hosStateAfter: segment.hosStateAfter ?? undefined,
            estimatedArrival: segment.estimatedArrival ?? undefined,
            estimatedDeparture: segment.estimatedDeparture ?? undefined,
            fromLat: segment.fromLat ?? undefined,
            fromLon: segment.fromLon ?? undefined,
            toLat: segment.toLat ?? undefined,
            toLon: segment.toLon ?? undefined,
            timezone: segment.timezone ?? undefined,
            actionType: segment.actionType ?? undefined,
            appointmentWindow: segment.appointmentWindow ?? undefined,
            fuelPricePerGallon: segment.fuelPricePerGallon ?? undefined,
            detourMiles: segment.detourMiles ?? undefined,
            isDocktimeConverted: segment.isDocktimeConverted ?? false,
            weatherAlerts: segment.weatherAlerts ?? undefined,
            decisionReason: segment.decisionReason ?? undefined,
            arrivalBufferMinutes: segment.arrivalBufferMinutes ?? undefined,
            routeGeometry: segment.routeGeometry ?? undefined,
            fuelStateAfter: segment.fuelStateAfter ?? undefined,
            stopId: segment.stopId ?? undefined,
          },
        });
      }

      // 3. Create load associations
      for (const loadId of loadIds) {
        await tx.routePlanLoad.create({
          data: {
            planId: plan.id,
            loadId,
          },
        });
      }

      // 4. Return the full plan with relations
      return tx.routePlan.findUnique({
        where: { id: plan.id },
        include: {
          segments: {
            orderBy: { sequenceOrder: 'asc' },
          },
          loads: {
            include: { load: true },
          },
        },
      });
    });

    this.logger.log(`Route plan created: ${data.planId} with ${segments.length} segments and ${loadIds.length} loads`);

    if (result) convertPlanCentsToDollars(result);
    return result;
  }

  /**
   * Retrieve a route plan by its string planId.
   *
   * Includes segments (ordered by sequenceOrder) and loads (through RoutePlanLoad).
   *
   * @param planId - The unique string plan identifier (e.g. "RP-20260206-ABC123")
   * @returns The plan with segments and loads
   * @throws NotFoundException if the plan does not exist
   */
  async getPlanById(planId: string) {
    const plan = await this.prisma.routePlan.findUnique({
      where: { planId },
      include: {
        segments: {
          orderBy: { sequenceOrder: 'asc' },
        },
        loads: {
          include: { load: true },
        },
        driver: true,
        vehicle: true,
      },
    });

    if (!plan) {
      throw new NotFoundException(`Route plan not found: ${planId}`);
    }

    // Check if this is a relay leg plan by looking for a LoadLeg that references this plan
    const relayLeg = await this.prisma.loadLeg.findFirst({
      where: { routePlanId: plan.id },
      include: { load: true },
    });

    if (relayLeg && relayLeg.load.isRelay) {
      // Fetch all sibling leg plans for this relay load
      const allLegs = await this.prisma.loadLeg.findMany({
        where: { loadId: relayLeg.loadId },
        orderBy: { sequence: 'asc' },
        include: {
          driver: { select: { name: true, driverId: true } },
          vehicle: { select: { unitNumber: true, vehicleId: true } },
          originStop: { include: { stop: true } },
          destStop: { include: { stop: true } },
        },
      });

      // Fetch plans for each leg
      const legPlans = await Promise.all(
        allLegs.map(async (leg) => {
          if (!leg.routePlanId) return null;
          const legPlan = await this.prisma.routePlan.findUnique({
            where: { id: leg.routePlanId },
            include: {
              segments: { orderBy: { sequenceOrder: 'asc' } },
              driver: true,
              vehicle: true,
            },
          });
          return {
            legSequence: leg.sequence,
            legId: leg.legId,
            driverName: leg.driver?.name ?? 'Unassigned',
            vehicleName: leg.vehicle?.unitNumber,
            miles: legPlan?.totalDistanceMiles ?? leg.actualMiles ?? 0,
            schedule:
              legPlan?.departureTime && legPlan.estimatedArrival
                ? `${legPlan.departureTime.toISOString()} → ${legPlan.estimatedArrival.toISOString()}`
                : undefined,
            plan: legPlan,
          };
        }),
      );

      convertPlanCentsToDollars(plan);
      for (const leg of legPlans) {
        if (leg?.plan) convertPlanCentsToDollars(leg.plan);
      }
      return {
        ...plan,
        routeType: 'relay' as const,
        relayLegs: legPlans.filter(Boolean),
        currentLegId: relayLeg.legId,
        currentLegSequence: relayLeg.sequence,
      };
    }

    convertPlanCentsToDollars(plan);
    return plan;
  }

  /**
   * Find the currently active route plan for a given driver.
   *
   * At most one plan should be active per driver at any time (enforced by activatePlan).
   *
   * @param driverId - The driver's numeric ID
   * @returns The active plan with segments, or null if none is active
   */
  async getActivePlanForDriver(driverId: number) {
    const plan = await this.prisma.routePlan.findFirst({
      where: {
        driverId,
        isActive: true,
      },
      include: {
        segments: {
          orderBy: { sequenceOrder: 'asc' },
        },
        loads: {
          include: { load: true },
        },
        driver: true,
        vehicle: true,
      },
    });

    if (plan) convertPlanCentsToDollars(plan);
    return plan;
  }

  /**
   * Activate a route plan.
   *
   * Within a transaction:
   * 1. Deactivates any existing active plan for the same driver
   * 2. Sets the target plan to isActive=true, status='active', activatedAt=now()
   *
   * @param planId - The string planId to activate
   * @returns The activated plan with segments
   * @throws NotFoundException if the plan does not exist
   */
  async activatePlan(planId: string) {
    const existingPlan = await this.prisma.routePlan.findUnique({
      where: { planId },
      include: { loads: { include: { load: true } } },
    });

    if (!existingPlan) {
      throw new NotFoundException(`Route plan not found: ${planId}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Double-booking validation (inside transaction to prevent TOCTOU race)
      for (const rpl of existingPlan.loads) {
        if (rpl.load.status !== 'PENDING') {
          const otherAssignment = await tx.routePlanLoad.findFirst({
            where: {
              loadId: rpl.load.id,
              plan: { isActive: true, status: RoutePlanStatus.ACTIVE },
              planId: { not: existingPlan.id },
            },
            include: { plan: { select: { planId: true } } },
          });
          if (otherAssignment) {
            throw new BadRequestException(
              `Load ${rpl.load.loadNumber} is already assigned to active route ${otherAssignment.plan.planId}`,
            );
          }
        }
      }

      // 2. Deactivate any existing active plan for the same driver
      const previousActivePlans = await tx.routePlan.findMany({
        where: { driverId: existingPlan.driverId, isActive: true },
        include: { loads: { include: { load: true } } },
      });

      for (const prevPlan of previousActivePlans) {
        await tx.routePlan.update({
          where: { id: prevPlan.id },
          data: { isActive: false, status: RoutePlanStatus.SUPERSEDED },
        });
        // Revert assigned loads to pending (but NOT in_transit loads)
        for (const rpl of prevPlan.loads) {
          if (rpl.load.status === 'ASSIGNED') {
            await tx.load.update({
              where: { id: rpl.load.id },
              data: { status: 'PENDING' },
            });
          }
        }
      }

      // 3. Activate the target plan
      const activated = await tx.routePlan.update({
        where: { planId },
        data: {
          isActive: true,
          status: RoutePlanStatus.ACTIVE,
          activatedAt: new Date(),
        },
        include: {
          segments: { orderBy: { sequenceOrder: 'asc' } },
          loads: { include: { load: true } },
          driver: true,
          vehicle: true,
        },
      });

      // 4. Check if this plan is linked to a relay leg
      const linkedLeg = await tx.loadLeg.findFirst({
        where: { routePlanId: activated.id },
      });

      if (linkedLeg) {
        // This is a relay leg plan — update leg status, not load assignment directly.
        // The LoadLegService.syncLoadFromLegs handles Load.driverId/vehicleId.
        await tx.loadLeg.update({
          where: { id: linkedLeg.id },
          data: { status: LOAD_LEG_STATUS.ASSIGNED, assignedAt: new Date() },
        });

        // Sync Load.driverId/vehicleId/status from legs
        await this.loadLegService.syncLoadFromLegs(linkedLeg.loadId, tx);

        this.logger.log(`Relay leg ${linkedLeg.legId} assigned via plan activation (skipping direct load assignment)`);
      } else {
        // Standard (non-relay) auto-assign loads: set driverId + vehicleId + status
        for (const rpl of activated.loads) {
          const load = rpl.load;
          if (load.status === 'PENDING' || !load.driverId) {
            await tx.load.update({
              where: { id: load.id },
              data: {
                status: 'ASSIGNED',
                assignedAt: new Date(),
                driverId: activated.driverId,
                vehicleId: activated.vehicleId,
              },
            });
          }
        }
      }

      return activated;
    });

    this.logger.log(`Route plan activated: ${planId} for driver ${existingPlan.driverId}`);

    convertPlanCentsToDollars(result);
    return result;
  }

  /**
   * List route plans with optional filters and pagination.
   *
   * Returns plans ordered by createdAt descending. Includes a segment count
   * (via _count) but does not include full segment data for performance.
   *
   * @param filters - Optional filtering and pagination parameters
   * @returns Array of plans with segment counts
   */
  async listPlans(filters: PlanFilters = {}) {
    const { tenantId, driverId, status, isActive, dateFrom, dateTo, limit = 50, offset = 0 } = filters;

    const where: any = {};
    if (tenantId !== undefined) where.tenantId = tenantId;
    if (driverId !== undefined) where.driverId = driverId;
    if (status !== undefined) {
      where.status = status.includes(',') ? { in: status.split(',') } : status;
    }
    if (isActive !== undefined) where.isActive = isActive;
    const dateFilter = buildDateRangeFilter(dateFrom, dateTo);
    if (dateFilter) where.createdAt = dateFilter;

    const [plans, total] = await Promise.all([
      this.prisma.routePlan.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          driver: {
            select: { driverId: true, name: true },
          },
          vehicle: {
            select: { vehicleId: true, unitNumber: true },
          },
          loads: {
            include: {
              load: {
                select: {
                  loadNumber: true,
                  referenceNumber: true,
                  customerName: true,
                },
              },
            },
          },
          segments: {
            where: { segmentType: 'dock' },
            orderBy: { sequenceOrder: 'asc' },
            select: {
              sequenceOrder: true,
              toLocation: true,
              actionType: true,
            },
          },
          _count: {
            select: { segments: true, loads: true },
          },
        },
      }),
      this.prisma.routePlan.count({ where }),
    ]);

    for (const plan of plans) {
      convertPlanCentsToDollars(plan as any);
    }

    return {
      plans,
      total,
      limit,
      offset,
    };
  }

  /**
   * Cancel a route plan.
   *
   * Sets status to 'cancelled', records cancelledAt timestamp, and deactivates the plan.
   *
   * @param planId - The string planId to cancel
   * @returns The cancelled plan
   * @throws NotFoundException if the plan does not exist
   */
  async cancelPlan(planId: string) {
    const existingPlan = await this.prisma.routePlan.findUnique({
      where: { planId },
      include: { loads: { include: { load: true } } },
    });

    if (!existingPlan) {
      throw new NotFoundException(`Route plan not found: ${planId}`);
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const plan = await tx.routePlan.update({
        where: { planId },
        data: {
          status: RoutePlanStatus.CANCELLED,
          cancelledAt: new Date(),
          isActive: false,
        },
        include: {
          segments: { orderBy: { sequenceOrder: 'asc' } },
          loads: { include: { load: true } },
        },
      });

      // Revert assigned loads to pending (NOT in_transit loads)
      for (const rpl of existingPlan.loads) {
        if (rpl.load.status === 'ASSIGNED') {
          await tx.load.update({
            where: { id: rpl.load.id },
            data: {
              status: 'PENDING',
              assignedAt: null,
              driverId: null,
              vehicleId: null,
            },
          });
        }
      }

      return plan;
    });

    this.logger.log(`Route plan cancelled: ${planId}`);

    convertPlanCentsToDollars(cancelled);
    return cancelled;
  }

  /**
   * Update a segment's status and optional actual times.
   *
   * Valid transitions: planned → in_progress, in_progress → completed, planned → skipped
   */
  async updateSegmentStatus(
    planId: string,
    segmentId: string,
    data: {
      status: string;
      actualArrival?: string;
      actualDeparture?: string;
    },
    tenantId: number,
  ) {
    const plan = await this.prisma.routePlan.findUnique({
      where: { planId },
      select: { id: true, tenantId: true },
    });

    if (!plan) {
      throw new NotFoundException(`Route plan not found: ${planId}`);
    }

    if (plan.tenantId !== tenantId) {
      throw new BadRequestException('Access denied');
    }

    const segment = await this.prisma.routeSegment.findFirst({
      where: { segmentId, planId: plan.id },
    });

    if (!segment) {
      throw new NotFoundException(`Segment ${segmentId} not found in plan ${planId}`);
    }

    // Validate status transition
    const currentStatus = (segment as any).status ?? RouteSegmentStatus.PLANNED;
    const validTransitions: Record<string, string[]> = {
      [RouteSegmentStatus.PLANNED]: [
        RouteSegmentStatus.IN_PROGRESS,
        RouteSegmentStatus.COMPLETED,
        RouteSegmentStatus.SKIPPED,
      ],
      [RouteSegmentStatus.IN_PROGRESS]: [RouteSegmentStatus.COMPLETED],
    };

    if (!validTransitions[currentStatus]?.includes(data.status)) {
      throw new BadRequestException(`Invalid status transition: ${currentStatus} → ${data.status}`);
    }

    const updateData: any = { status: data.status };
    if (data.actualArrival) {
      updateData.actualArrival = new Date(data.actualArrival);
    }
    if (data.actualDeparture) {
      updateData.actualDeparture = new Date(data.actualDeparture);
    }

    const updated = await this.prisma.routeSegment.update({
      where: { id: segment.id },
      data: updateData,
    });

    this.logger.log(`Segment ${segmentId} status updated: ${currentStatus} → ${data.status}`);

    (updated as any).fuelCostEstimate = centsToDollars(updated.fuelCostEstimate);
    return updated;
  }

  /**
   * Supersede a plan (mark as superseded, link to new plan).
   */
  async supersedePlan(oldPlanId: string, newPlanId: number) {
    const oldPlan = await this.prisma.routePlan.findUnique({
      where: { planId: oldPlanId },
    });

    if (!oldPlan) {
      throw new NotFoundException(`Route plan not found: ${oldPlanId}`);
    }

    await this.prisma.routePlan.update({
      where: { planId: oldPlanId },
      data: {
        status: RoutePlanStatus.SUPERSEDED,
        isActive: false,
        supersededById: newPlanId,
      },
    });

    this.logger.log(`Plan ${oldPlanId} superseded by plan ID ${newPlanId}`);
  }

  /**
   * Auto-activate the next leg's route plan when a relay leg completes delivery.
   *
   * Called by LoadLegService when a leg transitions to 'delivered'.
   * Finds the next leg in sequence and, if it has a draft plan, activates it.
   *
   * @param currentLegId - The numeric ID of the leg that just completed
   * @param tx - Optional Prisma transaction client
   */
  async activateNextLegPlan(currentLegId: number, tx?: any) {
    const client = tx || this.prisma;

    const currentLeg = await client.loadLeg.findUnique({
      where: { id: currentLegId },
      select: { id: true, loadId: true, sequence: true, legId: true },
    });
    if (!currentLeg) return;

    const nextLeg = await client.loadLeg.findFirst({
      where: {
        loadId: currentLeg.loadId,
        sequence: currentLeg.sequence + 1,
      },
      select: { id: true, legId: true, routePlanId: true },
    });
    if (!nextLeg?.routePlanId) return;

    const plan = await client.routePlan.findUnique({
      where: { id: nextLeg.routePlanId },
      select: { id: true, planId: true, status: true, isActive: true },
    });

    if (plan && plan.status === RoutePlanStatus.DRAFT) {
      await client.routePlan.update({
        where: { id: plan.id },
        data: {
          isActive: true,
          status: RoutePlanStatus.ACTIVE,
          activatedAt: new Date(),
        },
      });

      // Also mark the next leg as assigned
      await client.loadLeg.update({
        where: { id: nextLeg.id },
        data: { status: LOAD_LEG_STATUS.ASSIGNED, assignedAt: new Date() },
      });

      this.logger.log(
        `Auto-activated plan ${plan.planId} for next leg ${nextLeg.legId} (after leg ${currentLeg.legId} delivered)`,
      );
    }
  }
}
