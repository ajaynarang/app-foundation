import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import { AlertStatusSchema, LoadLegStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_2M } from '../../../../constants/cache.constants';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { AlertTriggersService } from '../../alerts/services/alert-triggers.service';
import { AlertCacheService } from '../../alerts/services/alert-cache.service';
import { DataSourceResolverService } from './data-source-resolver.service';
import { EtaCalculatorService } from './eta-calculator.service';
import { CheckRegistry } from '../checks/check.registry';
import {
  MonitoringCycleResult,
  MonitoringStatus,
  ActiveCheckResult,
  InactiveCheckResult,
  DriverCheckContext,
  LoadCheckContext,
  LoadWithStops,
  LoadStopWithCoords,
  HOSData,
  TelematicsData,
  MonitoringTrigger,
  MonitoringCheck,
  ActivePlanContext,
  DriverActivePlanContext,
  DEFAULT_THRESHOLDS,
} from '../monitoring.types';

const ALERT_STATUS = AlertStatusSchema.enum;
const LOAD_LEG_STATUS = LoadLegStatusSchema.enum;

@Injectable()
export class MonitoringEngineService {
  private readonly logger = new Logger(MonitoringEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dataSourceResolver: DataSourceResolverService,
    private readonly checkRegistry: CheckRegistry,
    private readonly integrationData: IntegrationDataService,
    private readonly etaCalculator: EtaCalculatorService,
    private readonly alertTriggers: AlertTriggersService,
    private readonly eventEmitter: EventEmitter2,
    private readonly cache: SallyCacheService,
    private readonly alertCache: AlertCacheService,
  ) {}

  async runCycleForTenant(tenantId: number): Promise<MonitoringCycleResult> {
    const cycleStart = Date.now();

    // 1. Resolve data sources
    const resolvedSources = await this.dataSourceResolver.resolveForTenant(tenantId);
    const availableCaps = this.dataSourceResolver.getAvailableCapabilitiesFromResolved(resolvedSources);

    // 2. Resolve active checks
    const { active: activeChecks, inactive: inactiveChecks } = this.checkRegistry.resolveChecks(availableCaps);

    // 3. Load drivers with active loads (including relay legs)
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        driverId: { not: null },
      },
      include: {
        driver: {
          select: {
            id: true,
            driverId: true,
            name: true,
            tenantId: true,
            assignedVehicleId: true,
            assignedVehicle: { select: { id: true, vehicleId: true } },
          },
        },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            stop: {
              select: {
                lat: true,
                lon: true,
                name: true,
                city: true,
                state: true,
              },
            },
          },
        },
        legs: {
          where: { status: { in: [LOAD_LEG_STATUS.ASSIGNED, LOAD_LEG_STATUS.IN_TRANSIT] } },
          include: {
            driver: {
              select: {
                id: true,
                driverId: true,
                name: true,
                tenantId: true,
                assignedVehicleId: true,
                assignedVehicle: { select: { id: true, vehicleId: true } },
              },
            },
          },
          orderBy: { sequence: 'asc' },
          take: 1, // Only the active leg
        },
      },
    });

    // 3b. Fetch active route plans for enrichment
    const activePlans = await this.prisma.routePlan.findMany({
      where: { tenantId, isActive: true, status: RoutePlanStatus.ACTIVE },
      include: {
        loads: {
          select: { loadId: true, load: { select: { loadNumber: true } } },
        },
        segments: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            segmentId: true,
            sequenceOrder: true,
            segmentType: true,
            status: true,
            fromLocation: true,
            toLocation: true,
            estimatedArrival: true,
            estimatedDeparture: true,
            distanceMiles: true,
            driveTimeHours: true,
            restDurationHours: true,
            progress: true,
            toLat: true,
            toLon: true,
          },
        },
      },
    });

    const planByLoadId = new Map<string, (typeof activePlans)[0]>();
    for (const plan of activePlans) {
      for (const pl of plan.loads) {
        planByLoadId.set(pl.load.loadNumber, plan);
      }
    }

    if (loads.length === 0) {
      const result = this.buildEmptyResult(tenantId, resolvedSources, inactiveChecks);
      await this.cacheResult(tenantId, result);
      return result;
    }

    // 4. Group loads by driver (relay loads use active leg's driver)
    const driverLoadsMap = new Map<number, { driver: any; vehicle: any; loads: any[] }>();
    for (const load of loads) {
      // For relay loads, use the active leg's driver instead of load-level driver
      const activeLeg = (load as any).legs?.[0];
      const effectiveDriver = activeLeg?.driver ?? load.driver;
      if (!effectiveDriver) continue;

      const driverId = effectiveDriver.id;
      if (!driverLoadsMap.has(driverId)) {
        driverLoadsMap.set(driverId, {
          driver: effectiveDriver,
          vehicle: effectiveDriver.assignedVehicle,
          loads: [],
        });
      }
      driverLoadsMap.get(driverId).loads.push(load);
    }

    // 5. Run checks per driver
    const allTriggers: {
      trigger: MonitoringTrigger;
      driverId: string;
      loadId?: string;
    }[] = [];
    const checkResults = new Map<string, { status: 'ok' | 'warning' | 'critical'; issueCount: number }>();

    // Initialize check results
    for (const check of activeChecks) {
      checkResults.set(check.id, { status: 'ok', issueCount: 0 });
    }

    const perDriverChecks = activeChecks.filter((c) => c.scope === 'per-driver');
    const perLoadChecks = activeChecks.filter((c) => c.scope === 'per-load');

    for (const [, { driver, vehicle, loads: driverLoads }] of driverLoadsMap) {
      // Fetch HOS + GPS data
      const [hosRaw, gpsRaw] = await Promise.all([
        this.integrationData.getDriverHOS(tenantId, driver.driverId).catch(() => null),
        vehicle ? this.integrationData.getVehicleLocation(tenantId, vehicle.vehicleId).catch(() => null) : null,
      ]);

      const hosData: HOSData | null = hosRaw
        ? {
            currentDutyStatus: hosRaw.currentDutyStatus ?? 'unknown',
            driveTimeRemainingMs: hosRaw.driveTimeRemainingMs ?? 0,
            shiftTimeRemainingMs: hosRaw.shiftTimeRemainingMs ?? 0,
            cycleTimeRemainingMs: hosRaw.cycleTimeRemainingMs ?? 0,
            timeUntilBreakMs: hosRaw.timeUntilBreakMs ?? 0,
            lastUpdated: hosRaw.lastUpdated ?? new Date().toISOString(),
            syncedAt: hosRaw.syncedAt ?? new Date().toISOString(),
          }
        : null;

      const gpsData: TelematicsData | null = gpsRaw
        ? {
            latitude: gpsRaw.latitude,
            longitude: gpsRaw.longitude,
            speed: gpsRaw.speed ?? 0,
            heading: gpsRaw.heading ?? 0,
            fuelLevel: gpsRaw.fuelLevel ?? null,
            engineRunning: gpsRaw.engineRunning ?? true,
            odometer: gpsRaw.odometer ?? 0,
            timestamp: gpsRaw.timestamp ?? new Date().toISOString(),
            syncedAt: gpsRaw.syncedAt ?? new Date().toISOString(),
          }
        : null;

      const mappedLoads = driverLoads.map((l: any) => this.mapLoad(l));

      // Build driver active plan context
      const driverPlan = activePlans.find((p) => p.driverId === driver.id);
      let driverActivePlan: DriverActivePlanContext | undefined;
      if (driverPlan) {
        const nextDrive = driverPlan.segments.find(
          (s) =>
            s.segmentType === 'drive' &&
            (s.status === RouteSegmentStatus.PLANNED || s.status === RouteSegmentStatus.IN_PROGRESS),
        );
        driverActivePlan = {
          planId: driverPlan.planId,
          nextDriveSegment: nextDrive
            ? {
                segmentId: nextDrive.segmentId,
                distanceMiles: nextDrive.distanceMiles,
                driveTimeHours: nextDrive.driveTimeHours,
                toLocation: nextDrive.toLocation,
              }
            : undefined,
        };
      }

      const driverCtx: DriverCheckContext = {
        driver: {
          id: driver.id,
          driverId: driver.driverId,
          name: driver.name,
          tenantId: driver.tenantId,
        },
        vehicle: vehicle ? { id: vehicle.id, vehicleId: vehicle.vehicleId } : null,
        loads: mappedLoads,
        hosData,
        gpsData,
        driverActivePlan,
      };

      // Run per-driver checks
      for (const check of perDriverChecks) {
        const trigger = check.run(driverCtx, DEFAULT_THRESHOLDS);
        if (trigger) {
          allTriggers.push({
            trigger,
            driverId: driver.driverId,
          });
          this.recordCheckIssue(checkResults, check, trigger);
        }
      }

      // Run per-load checks
      for (const load of mappedLoads) {
        const nextPendingStop = this.findNextPendingStop(load);
        const driverPosition = gpsData ? { lat: gpsData.latitude, lon: gpsData.longitude } : null;

        const estimatedDriveMinutes =
          nextPendingStop?.stop.lat != null && driverPosition
            ? await this.etaCalculator.getEstimatedDriveMinutes(driverPosition, {
                lat: nextPendingStop.stop.lat,
                lon: nextPendingStop.stop.lon,
              })
            : null;

        // Build active plan context for this load
        const plan = planByLoadId.get(load.loadNumber);
        let activePlanContext: ActivePlanContext | undefined;
        if (plan) {
          const currentSegment = plan.segments.find((s) => s.status === RouteSegmentStatus.IN_PROGRESS);
          const nextSegment = plan.segments.find((s) => s.status === RouteSegmentStatus.PLANNED);
          if (plan.departureTime && plan.estimatedArrival) {
            activePlanContext = {
              planId: plan.planId,
              segments: plan.segments,
              currentSegment,
              nextSegment,
              departureTime: plan.departureTime,
              estimatedArrival: plan.estimatedArrival,
            };
          }
        }

        const loadCtx: LoadCheckContext = {
          load,
          driver: driverCtx.driver,
          nextPendingStop,
          driverPosition,
          estimatedDriveMinutes,
          activePlan: activePlanContext,
        };

        for (const check of perLoadChecks) {
          const trigger = check.run(loadCtx, DEFAULT_THRESHOLDS);
          if (trigger) {
            allTriggers.push({
              trigger,
              driverId: driver.driverId,
              loadId: load.loadNumber,
            });
            this.recordCheckIssue(checkResults, check, trigger);
          }
        }
      }
    }

    // 6. Process triggers → alerts
    const seenTriggers = new Set<string>();
    for (const { trigger, driverId, loadId } of allTriggers) {
      const dedupeKey = `${trigger.type}:${driverId}:${loadId ?? ''}`;
      if (seenTriggers.has(dedupeKey)) continue;
      seenTriggers.add(dedupeKey);

      try {
        await this.alertTriggers.trigger(trigger.type, tenantId, driverId, {
          ...trigger.params,
          loadId,
        });
      } catch (err) {
        this.logger.warn(`Failed to trigger alert ${trigger.type} for driver ${driverId}: ${err}`);
      }
    }

    // 7. Auto-resolve cleared conditions (scoped per driver). Phase 2 Task 10
    // — alerts.driver_id is now the Int FK; build a slug→id map alongside
    // the slug list so autoResolveCleared can intersect with the existing
    // slug-keyed triggeredKeys set and translate to FKs at the write.
    const monitoredDriverIds = [...driverLoadsMap.values()].map((d) => d.driver.driverId);
    const driverSlugToDbId = new Map<string, number>(
      [...driverLoadsMap.values()].map((d) => [d.driver.driverId, d.driver.id] as const),
    );
    await this.autoResolveCleared(tenantId, activeChecks, allTriggers, monitoredDriverIds, driverSlugToDbId);

    // 8. Build result
    const activeCheckResults: ActiveCheckResult[] = activeChecks.map((check) => {
      const result = checkResults.get(check.id) ?? {
        status: 'ok' as const,
        issueCount: 0,
      };
      return {
        id: check.id,
        displayName: check.displayName,
        category: check.category,
        status: result.status,
        issueCount: result.issueCount,
        summary:
          result.issueCount > 0
            ? `${result.issueCount} issue${result.issueCount !== 1 ? 's' : ''} detected`
            : 'All clear',
      };
    });

    const monitoringStatus = this.determineStatus(resolvedSources, activeChecks.length);

    const cycleResult: MonitoringCycleResult = {
      tenantId,
      status: monitoringStatus,
      loadsMonitored: loads.length,
      driversMonitored: driverLoadsMap.size,
      cycleIntervalSeconds: 120,
      lastCycleAt: new Date().toISOString(),
      triggersThisCycle: seenTriggers.size,
      dataSources: resolvedSources,
      checks: {
        active: activeCheckResults,
        inactive: inactiveChecks.map((c) => ({
          id: c.id,
          displayName: c.displayName,
          category: c.category,
          reason: c.reason,
        })),
        skipped: [],
      },
    };

    // 9. Cache + emit SSE
    await this.cacheResult(tenantId, cycleResult);
    this.eventEmitter.emit(
      SALLY_EVENTS.MONITORING_CYCLE_COMPLETED,
      new DomainEvent(SALLY_EVENTS.MONITORING_CYCLE_COMPLETED, String(tenantId), {
        loadsMonitored: cycleResult.loadsMonitored,
        driversMonitored: cycleResult.driversMonitored,
        triggersThisCycle: cycleResult.triggersThisCycle,
        status: cycleResult.status,
        timestamp: cycleResult.lastCycleAt,
      }),
    );

    this.logger.log(
      `Monitoring cycle for tenant ${tenantId}: ${loads.length} loads, ${driverLoadsMap.size} drivers, ${seenTriggers.size} triggers in ${Date.now() - cycleStart}ms`,
    );

    return cycleResult;
  }

  async getCachedResult(tenantId: number): Promise<MonitoringCycleResult | null> {
    try {
      return (await this.cache.get<MonitoringCycleResult>(buildKey('sally:monitoring', 'cycle', tenantId))) ?? null;
    } catch {
      return null;
    }
  }

  private mapLoad(prismaLoad: any): LoadWithStops {
    return {
      id: prismaLoad.id,
      loadNumber: prismaLoad.loadNumber,
      status: prismaLoad.status,
      driverId: prismaLoad.driverId,
      vehicleId: prismaLoad.vehicleId,
      assignedAt: prismaLoad.assignedAt,
      inTransitAt: prismaLoad.inTransitAt,
      loadStops: (prismaLoad.stops ?? []).map(
        (ls: any): LoadStopWithCoords => ({
          id: ls.id,
          sequenceOrder: ls.sequenceOrder,
          actionType: ls.actionType,
          status: ls.status,
          appointmentDate: ls.appointmentDate,
          earliestArrival: ls.earliestArrival,
          latestArrival: ls.latestArrival,
          estimatedDockHours: ls.estimatedDockHours ?? 1,
          arrivedAt: ls.arrivedAt,
          departedAt: ls.departedAt,
          completedAt: ls.completedAt,
          dockInAt: ls.dockInAt,
          stop: {
            lat: ls.stop?.lat ?? null,
            lon: ls.stop?.lon ?? null,
            name: ls.stop?.name ?? 'Unknown',
            city: ls.stop?.city ?? null,
            state: ls.stop?.state ?? null,
          },
        }),
      ),
    };
  }

  private findNextPendingStop(load: LoadWithStops): LoadStopWithCoords | null {
    return load.loadStops.find((s) => s.status !== 'completed' && s.status !== 'skipped') ?? null;
  }

  private recordCheckIssue(
    results: Map<string, { status: 'ok' | 'warning' | 'critical'; issueCount: number }>,
    check: MonitoringCheck,
    trigger: MonitoringTrigger,
  ) {
    const current = results.get(check.id);
    if (!current) return;
    current.issueCount += 1;
    if (trigger.severity === 'critical' || current.status === 'critical') {
      current.status = 'critical';
    } else if (trigger.severity === 'high' || trigger.severity === 'medium') {
      current.status = 'warning';
    }
  }

  private determineStatus(resolvedSources: any[], activeCheckCount: number): MonitoringStatus {
    const availableSources = resolvedSources.filter((s) => s.available);
    const healthySources = availableSources.filter((s) => s.status === 'healthy');

    if (availableSources.length === 0) return 'unavailable';
    if (activeCheckCount === 0) return 'inactive';
    if (healthySources.length === availableSources.length) return 'active';
    if (healthySources.length > 0) return 'limited';
    return 'degraded';
  }

  private async autoResolveCleared(
    tenantId: number,
    activeChecks: MonitoringCheck[],
    allTriggers: {
      trigger: MonitoringTrigger;
      driverId: string;
      loadId?: string;
    }[],
    monitoredDriverIds: string[],
    driverSlugToDbId: Map<string, number>,
  ) {
    const autoResolveTypes = activeChecks
      .filter((c) => c.autoResolve)
      .map((c) => this.checkIdToAlertType(c.id))
      .filter(Boolean);

    if (autoResolveTypes.length === 0 || monitoredDriverIds.length === 0) return;

    // Build set of type:driverId combos that fired this cycle (slug-keyed)
    const triggeredKeys = new Set(allTriggers.map((t) => `${t.trigger.type}:${t.driverId}`));

    // Only resolve alerts for monitored drivers whose conditions cleared.
    // Phase 2 Task 10 — alerts.driver_id is the Int FK, so translate each
    // driver slug to its Int id before grouping for the batch update.
    const resolveConditions: { alertType: string; driverDbId: number }[] = [];
    for (const alertType of autoResolveTypes) {
      for (const driverId of monitoredDriverIds) {
        if (triggeredKeys.has(`${alertType}:${driverId}`)) continue;
        const driverDbId = driverSlugToDbId.get(driverId);
        if (driverDbId === undefined) continue;
        resolveConditions.push({ alertType, driverDbId });
      }
    }

    if (resolveConditions.length === 0) return;

    try {
      // Group by alertType for efficient batch updates
      const byType = new Map<string, number[]>();
      for (const { alertType, driverDbId } of resolveConditions) {
        if (!byType.has(alertType)) byType.set(alertType, []);
        byType.get(alertType).push(driverDbId);
      }

      let anyResolved = false;
      for (const [alertType, driverDbIds] of byType) {
        const result = await this.prisma.alert.updateMany({
          where: {
            tenantId,
            alertType,
            driverId: { in: driverDbIds },
            status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
          },
          data: {
            status: ALERT_STATUS.AUTO_RESOLVED,
            autoResolved: true,
            autoResolveReason: 'Condition cleared during monitoring cycle',
            resolvedAt: new Date(),
          },
        });
        if (result.count > 0) anyResolved = true;
      }

      if (anyResolved) {
        await this.alertCache.bustStatsCache(tenantId);
      }
    } catch (err) {
      this.logger.warn(`Auto-resolve failed: ${err}`);
    }
  }

  private checkIdToAlertType(checkId: string): string {
    const map: Record<string, string> = {
      drive_limit: 'HOS_APPROACHING_LIMIT',
      duty_limit: 'HOS_APPROACHING_LIMIT',
      break_required: 'BREAK_REQUIRED',
      cycle_limit: 'CYCLE_APPROACHING_LIMIT',
      hos_violation: 'HOS_VIOLATION',
      appointment_at_risk: 'APPOINTMENT_AT_RISK',
      missed_appointment: 'MISSED_APPOINTMENT',
      dock_time_exceeded: 'DOCK_TIME_EXCEEDED',
      off_pace: 'OFF_PACE',
      driver_not_moving: 'DRIVER_NOT_MOVING',
      fuel_low: 'FUEL_LOW',
      unconfirmed_pickup: 'UNCONFIRMED_PICKUP',
      unconfirmed_delivery: 'UNCONFIRMED_DELIVERY',
      no_pickup_activity: 'NO_PICKUP_ACTIVITY',
      plan_behind_schedule: 'PLAN_BEHIND_SCHEDULE',
      plan_missed_stop: 'PLAN_MISSED_STOP',
      plan_segment_stalled: 'PLAN_SEGMENT_STALLED',
    };
    return map[checkId] ?? checkId.toUpperCase();
  }

  private buildEmptyResult(
    tenantId: number,
    resolvedSources: any[],
    inactiveChecks: InactiveCheckResult[],
  ): MonitoringCycleResult {
    return {
      tenantId,
      status: 'inactive',
      loadsMonitored: 0,
      driversMonitored: 0,
      cycleIntervalSeconds: 120,
      lastCycleAt: new Date().toISOString(),
      triggersThisCycle: 0,
      dataSources: resolvedSources,
      checks: {
        active: [],
        inactive: inactiveChecks,
        skipped: [],
      },
    };
  }

  private async cacheResult(tenantId: number, result: MonitoringCycleResult) {
    await this.cache.set(buildKey('sally:monitoring', 'cycle', tenantId), result, CACHE_TTL_WARM_2M);
  }
}
