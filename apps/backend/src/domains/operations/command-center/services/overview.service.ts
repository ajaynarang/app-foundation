import { Injectable } from '@nestjs/common';
import { AlertPriority, RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import { AlertStatusSchema, LoadStopStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../../../constants/cache.constants';
import { RouteProgressTrackerService } from '../../monitoring/services/route-progress-tracker.service';
import type { CommandCenterOverviewDto, ActiveLoadDto, LoadCardTier, DriverHOSChipDto } from '../command-center.types';

const ALERT_STATUS = AlertStatusSchema.enum;
const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

@Injectable()
export class OverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly progressTracker: RouteProgressTrackerService,
  ) {}

  async getOverview(tenantId: number): Promise<CommandCenterOverviewDto> {
    return this.cache.getOrSet<CommandCenterOverviewDto>(
      buildKey('sally:cmdcenter', 'overview', tenantId),
      () => this.computeOverview(tenantId),
      CACHE_TTL_HOT_30S,
    );
  }

  private async computeOverview(tenantId: number): Promise<CommandCenterOverviewDto> {
    // Parallel queries: loads, ELD config, alert counts, drivers, pending loads
    const [loads, eldConfig, activeAlertCount, drivers, pendingLoads] = await Promise.all([
      this.prisma.load.findMany({
        where: {
          tenantId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          isActive: true,
        },
        include: {
          driver: {
            select: {
              id: true,
              driverId: true,
              name: true,
              hosData: true,
              hosDataSyncedAt: true,
            },
          },
          vehicle: {
            select: { id: true, vehicleId: true, unitNumber: true },
          },
          stops: {
            select: {
              status: true,
              sequenceOrder: true,
              actionType: true,
            },
            orderBy: { sequenceOrder: 'asc' },
          },
          routePlanLoads: {
            where: { plan: { isActive: true, status: RoutePlanStatus.ACTIVE } },
            include: {
              plan: {
                include: {
                  segments: { orderBy: { sequenceOrder: 'asc' } },
                },
              },
            },
            take: 1,
          },
        },
      }),
      this.prisma.integrationConfig.findFirst({
        where: { tenantId, integrationType: 'ELD', isEnabled: true },
      }),
      this.prisma.alert.count({
        where: { tenantId, status: ALERT_STATUS.ACTIVE },
      }),
      this.prisma.driver.findMany({
        where: { tenantId, status: { in: ['PENDING_ACTIVATION', 'ACTIVE'] } },
      }),
      this.prisma.load.count({
        where: { tenantId, status: 'PENDING', isActive: true },
      }),
    ]);

    const tenantHasEld = !!eldConfig;

    // Phase 2 Task 10 — alert.driverId/loadId are now Int FKs, not business
    // slugs. Group by the Int FK and then translate back to the public slug
    // for the response maps (still keyed by loadNumber / driver slug, which
    // the frontend already consumes).
    const loadDbIds = loads.map((l) => l.id);
    const loadDbIdToNumber = new Map<number, string>(loads.map((l) => [l.id, l.loadNumber] as const));
    const driverDbIds = loads.filter((l) => l.driver).map((l) => l.driver.id);
    const driverDbIdToSlug = new Map<number, string>(
      loads.filter((l) => l.driver).map((l) => [l.driver.id, l.driver.driverId] as const),
    );

    const [alertsByLoad, alertsByDriver, alertPriorityByLoad, alertPriorityByDriver] = await Promise.all([
      loadDbIds.length > 0
        ? this.prisma.alert.groupBy({
            by: ['loadId'],
            where: {
              tenantId,
              status: ALERT_STATUS.ACTIVE,
              loadId: { in: loadDbIds },
            },
            _count: true,
          })
        : [],
      driverDbIds.length > 0
        ? this.prisma.alert.groupBy({
            by: ['driverId'],
            where: {
              tenantId,
              status: ALERT_STATUS.ACTIVE,
              loadId: null,
              driverId: { in: driverDbIds },
            },
            _count: true,
          })
        : [],
      // Distinct priorities per load for monitoring dot (groupBy load+priority)
      loadDbIds.length > 0
        ? this.prisma.alert.groupBy({
            by: ['loadId', 'priority'],
            where: {
              tenantId,
              status: ALERT_STATUS.ACTIVE,
              loadId: { in: loadDbIds },
            },
            _count: true,
          })
        : [],
      // Distinct priorities per driver (driver-scoped alerts without loadId)
      driverDbIds.length > 0
        ? this.prisma.alert.groupBy({
            by: ['driverId', 'priority'],
            where: {
              tenantId,
              status: ALERT_STATUS.ACTIVE,
              loadId: null,
              driverId: { in: driverDbIds },
            },
            _count: true,
          })
        : [],
    ]);

    // Translate Int FK groupings back to public-slug-keyed maps so the rest
    // of the function (and the response shape) is unchanged.
    const alertByLoadMap = new Map<string, number>(
      alertsByLoad
        .filter((a): a is { loadId: number; _count: number } => a.loadId != null)
        .map((a) => [loadDbIdToNumber.get(a.loadId) ?? '', a._count] as const)
        .filter(([k]) => k !== ''),
    );
    const alertByDriverMap = new Map<string, number>(
      alertsByDriver
        .filter((a): a is { driverId: number; _count: number } => a.driverId != null)
        .map((a) => [driverDbIdToSlug.get(a.driverId) ?? '', a._count] as const)
        .filter(([k]) => k !== ''),
    );

    // Severity rank: lower = worse. Keyed by AlertPriority enum so a future
    // member addition (or casing drift) becomes a tsc error, not a silent
    // fallback to 'ok'. (Issue #707 — pre-fix this map was lowercase-keyed
    // while DB values were UPPER, so every lookup missed.)
    const PRIORITY_RANK: Record<AlertPriority, number> = {
      [AlertPriority.CRITICAL]: 0,
      [AlertPriority.HIGH]: 1,
      [AlertPriority.MEDIUM]: 2,
      [AlertPriority.LOW]: 3,
    };

    const worstPriority = (priorities: AlertPriority[]): 'ok' | 'warning' | 'critical' => {
      let worst = 4; // higher than any defined rank = 'ok'
      for (const p of priorities) {
        const rank = PRIORITY_RANK[p];
        if (rank < worst) worst = rank;
      }
      if (worst <= 1) return 'critical'; // critical or high
      if (worst === 2) return 'warning'; // medium
      return 'ok'; // low or unknown
    };

    // Collect distinct priorities per load — keyed by loadNumber (public slug)
    // after translating the Int FK from the groupBy result.
    const prioritiesByLoad = new Map<string, AlertPriority[]>();
    for (const row of alertPriorityByLoad) {
      if (!row.loadId || !row.priority) continue;
      const loadNumber = loadDbIdToNumber.get(row.loadId);
      if (!loadNumber) continue;
      const existing = prioritiesByLoad.get(loadNumber) ?? [];
      existing.push(row.priority);
      prioritiesByLoad.set(loadNumber, existing);
    }
    const monitoringByLoadMap = new Map<string, 'ok' | 'warning' | 'critical'>(
      [...prioritiesByLoad.entries()].map(([loadNumber, priorities]) => [loadNumber, worstPriority(priorities)]),
    );

    // Collect distinct priorities per driver — keyed by driver slug.
    const prioritiesByDriver = new Map<string, AlertPriority[]>();
    for (const row of alertPriorityByDriver) {
      if (!row.driverId || !row.priority) continue;
      const driverSlug = driverDbIdToSlug.get(row.driverId);
      if (!driverSlug) continue;
      const existing = prioritiesByDriver.get(driverSlug) ?? [];
      existing.push(row.priority);
      prioritiesByDriver.set(driverSlug, existing);
    }
    const monitoringByDriverMap = new Map<string, 'ok' | 'warning' | 'critical'>(
      [...prioritiesByDriver.entries()].map(([driverSlug, priorities]) => [driverSlug, worstPriority(priorities)]),
    );

    // Build ActiveLoadDto[]
    const activeLoads: ActiveLoadDto[] = loads.map((load) => {
      const routePlan = load.routePlanLoads?.[0]?.plan ?? null;
      const hasActiveRoutePlan = !!routePlan;

      // Determine tier
      let tier: LoadCardTier = 'basic';
      if (hasActiveRoutePlan) {
        tier = 'planned';
      } else if (tenantHasEld) {
        tier = 'tracked';
      }

      // Stop progress
      const completedStops = load.stops.filter((s) => s.status === LOAD_STOP_STATUS.COMPLETED).length;
      const totalStops = load.stops.length;

      // Alert count: try loadNumber first, fallback to driverId
      const alertCount =
        alertByLoadMap.get(load.loadNumber) ?? (load.driver ? (alertByDriverMap.get(load.driver.driverId) ?? 0) : 0);

      // HOS data (tracked + planned tiers)
      let hos: ActiveLoadDto['hos'] = null;
      let hosDataSyncedAt: string | null = null;

      if (tier === 'planned' && hasActiveRoutePlan) {
        // For planned: extract HOS from route plan segments
        const segments = routePlan.segments;
        const currentSegment = this.progressTracker.determineCurrentSegment(segments);
        const hosState = currentSegment?.hosStateAfter;

        hos = {
          driveHoursRemaining:
            hosState?.driveTimeRemainingHours ??
            (hosState?.driveTimeRemainingMs ? hosState.driveTimeRemainingMs / 3600000 : 11),
          dutyHoursRemaining:
            hosState?.dutyTimeRemainingHours ??
            (hosState?.shiftTimeRemainingMs ? hosState.shiftTimeRemainingMs / 3600000 : 14),
          cycleHoursRemaining:
            hosState?.cycleTimeRemainingHours ??
            (hosState?.cycleTimeRemainingMs ? hosState.cycleTimeRemainingMs / 3600000 : 70),
          breakHoursRemaining:
            hosState?.timeUntilBreakHours ?? (hosState?.timeUntilBreakMs ? hosState.timeUntilBreakMs / 3600000 : 8),
          status: (hosState?.currentDutyStatus ?? 'off_duty') as 'driving' | 'on_duty' | 'sleeper' | 'off_duty',
        };
        hosDataSyncedAt = load.driver?.hosDataSyncedAt?.toISOString() ?? null;
      } else if (tier === 'tracked') {
        // For tracked tier: read HOS from driver record (populated by batch sync)
        const driverHos = load.driver?.hosData as Record<string, any> | null;
        if (driverHos) {
          hos = {
            driveHoursRemaining: (driverHos.driveTimeRemainingMs ?? 0) / 3600000,
            dutyHoursRemaining: (driverHos.shiftTimeRemainingMs ?? 0) / 3600000,
            cycleHoursRemaining: (driverHos.cycleTimeRemainingMs ?? 0) / 3600000,
            breakHoursRemaining: (driverHos.timeUntilBreakMs ?? 0) / 3600000,
            status: (driverHos.currentDutyStatus ?? 'off_duty') as 'driving' | 'on_duty' | 'sleeper' | 'off_duty',
          };
        }
        hosDataSyncedAt = load.driver?.hosDataSyncedAt?.toISOString() ?? null;
      }

      // Route data (planned tier only)
      let route: ActiveLoadDto['route'] = null;

      if (tier === 'planned' && hasActiveRoutePlan) {
        const segments = routePlan.segments;
        const dockSegments = segments.filter((s) => s.segmentType === 'dock');
        const nextDock = dockSegments.find((s) => s.status !== RouteSegmentStatus.COMPLETED);
        const completedMiles = segments
          .filter((s) => s.status === RouteSegmentStatus.COMPLETED && s.distanceMiles)
          .reduce((sum, s) => sum + (s.distanceMiles ?? 0), 0);
        const totalMiles = routePlan.totalDistanceMiles;

        // ETA status
        let etaStatus: 'on_time' | 'at_risk' | 'late' = 'on_time';
        if (nextDock?.appointmentWindow && nextDock?.estimatedArrival) {
          const appointment = nextDock.appointmentWindow;
          const eta = new Date(nextDock.estimatedArrival);
          const appt = appointment as Record<string, any>;
          const appointmentEnd = appt?.end ? new Date(appt.end) : null;
          const appointmentStart = appt?.start ? new Date(appt.start) : null;
          if (appointmentEnd && eta > appointmentEnd) {
            etaStatus = 'late';
          } else if (appointmentStart && eta > new Date(appointmentStart.getTime() - 30 * 60000)) {
            etaStatus = 'at_risk';
          }
        }

        route = {
          planId: routePlan.planId,
          eta: routePlan.estimatedArrival?.toISOString() ?? null,
          etaStatus: etaStatus,
          nextStop: nextDock
            ? {
                name: nextDock.toLocation ?? 'Unknown',
                location: nextDock.toLocation ?? '',
                eta: nextDock.estimatedArrival?.toISOString() ?? '',
              }
            : null,
          milesCompleted: Math.round(completedMiles),
          milesRemaining: Math.max(0, Math.round(totalMiles - completedMiles)),
          totalDistanceMiles: Math.round(totalMiles),
        };
      }

      return {
        loadNumber: load.loadNumber,
        customerName: load.customerName,
        status: load.status,
        requiredEquipmentType: (load as any).requiredEquipmentType ?? null,
        origin: load.originCity ? { city: load.originCity, state: load.originState } : null,
        destination: load.destinationCity ? { city: load.destinationCity, state: load.destinationState } : null,
        driver: load.driver
          ? {
              driverId: load.driver.driverId,
              name: load.driver.name ?? load.driver.driverId,
            }
          : null,
        vehicle: load.vehicle
          ? {
              vehicleId: load.vehicle.vehicleId,
              identifier: load.vehicle.unitNumber ?? load.vehicle.vehicleId,
            }
          : null,
        stopProgress: { completed: completedStops, total: totalStops },
        pickupDate: load.pickupDate ? load.pickupDate.toISOString().split('T')[0] : null,
        deliveryDate: load.deliveryDate ? load.deliveryDate.toISOString().split('T')[0] : null,
        weightLbs: load.weightLbs,
        rateCents: load.rateCents,
        tier,
        hos,
        hosDataSyncedAt: hosDataSyncedAt,
        route,
        referenceNumber: load.referenceNumber ?? null,
        activeAlertCount: alertCount,
        monitoringStatus:
          monitoringByLoadMap.get(load.loadNumber) ??
          (load.driver ? (monitoringByDriverMap.get(load.driver.driverId) ?? null) : null),
        updatedAt: load.updatedAt.toISOString(),
      };
    });

    // Sort by urgency: late > at_risk+alerts > at_risk > low HOS > alerts > normal
    activeLoads.sort((a, b) => {
      const urgency = (l: ActiveLoadDto) => {
        if (l.route?.etaStatus === 'late') return 0;
        if (l.route?.etaStatus === 'at_risk' && l.activeAlertCount > 0) return 1;
        if (l.route?.etaStatus === 'at_risk') return 2;
        if (l.hos && l.hos.driveHoursRemaining < 2) return 3;
        if (l.activeAlertCount > 0) return 4;
        return 5;
      };
      return urgency(a) - urgency(b);
    });

    // KPIs
    const plannedLoads = activeLoads.filter((l) => l.tier === 'planned');
    const onTimeCount = plannedLoads.filter((l) => l.route?.etaStatus === 'on_time').length;
    const onTimePercentage = plannedLoads.length > 0 ? Math.round((onTimeCount / plannedLoads.length) * 100) : 100;

    const availableDrivers = drivers.filter((d) => d.status === 'ACTIVE').length;

    const kpis = {
      activeLoads: activeLoads.length,
      inTransit: activeLoads.filter((l) => l.status === 'IN_TRANSIT').length,
      onTimePercentage: onTimePercentage,
      activeAlerts: activeAlertCount,
      unassigned: pendingLoads,
    };

    // Driver HOS strip from loads with HOS data
    const driverHosStrip: DriverHOSChipDto[] = activeLoads
      .filter((l) => l.hos && l.driver)
      .map((l) => ({
        driverId: l.driver.driverId,
        name: l.driver.name,
        initials: l.driver.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2),
        driveHoursRemaining: l.hos.driveHoursRemaining,
        dutyHoursRemaining: l.hos.dutyHoursRemaining,
        status: l.hos.status,
        vehicleId: l.vehicle?.vehicleId ?? null,
        activeLoadId: l.loadNumber,
      }));

    // Sort HOS strip by drive hours remaining ascending (most urgent first)
    driverHosStrip.sort((a, b) => a.driveHoursRemaining - b.driveHoursRemaining);

    const result: CommandCenterOverviewDto = {
      kpis,
      activeLoads: activeLoads,
      quickActionCounts: {
        unassignedLoads: pendingLoads,
        availableDrivers: availableDrivers,
      },
      driverHosStrip: driverHosStrip,
    };

    return result;
  }
}
