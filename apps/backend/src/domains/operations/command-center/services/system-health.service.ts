import { Injectable } from '@nestjs/common';
import { JobStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_60S } from '../../../../constants/cache.constants';
import { MonitoringEngineService } from '../../monitoring/services/monitoring-engine.service';
import type { SystemHealthDto, SystemHealthIntegrationDto, PipelineSyncStatus } from '../command-center.types';
import type { JobCategory } from '../../../../infrastructure/queue/job.types';

const JOB_STATUS = JobStatusSchema.enum;

@Injectable()
export class SystemHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly monitoringEngine: MonitoringEngineService,
  ) {}

  private static readonly MONITORING_CHECKS: {
    category: string;
    checks: { name: string; type: string }[];
  }[] = [
    {
      category: 'HOS Compliance',
      checks: [
        { name: 'Drive Limit Approaching', type: 'HOS_APPROACHING_LIMIT' },
        { name: 'Duty Limit Approaching', type: 'DUTY_APPROACHING_LIMIT' },
        { name: 'Break Required', type: 'BREAK_REQUIRED' },
        { name: 'Cycle Approaching Limit', type: 'CYCLE_APPROACHING_LIMIT' },
        { name: 'HOS Violation', type: 'HOS_VIOLATION' },
      ],
    },
    {
      category: 'Route Progress',
      checks: [
        { name: 'Appointment At Risk', type: 'APPOINTMENT_AT_RISK' },
        { name: 'Missed Appointment', type: 'MISSED_APPOINTMENT' },
        { name: 'Dock Time Exceeded', type: 'DOCK_TIME_EXCEEDED' },
        { name: 'Route Delay', type: 'ROUTE_DELAY' },
      ],
    },
    {
      category: 'Driver Behavior',
      checks: [{ name: 'Driver Not Moving', type: 'DRIVER_NOT_MOVING' }],
    },
    {
      category: 'Vehicle State',
      checks: [{ name: 'Fuel Low', type: 'FUEL_LOW' }],
    },
    {
      category: 'Lifecycle',
      checks: [
        { name: 'Unconfirmed Pickup', type: 'UNCONFIRMED_PICKUP' },
        { name: 'Unconfirmed Delivery', type: 'UNCONFIRMED_DELIVERY' },
      ],
    },
  ];

  private static readonly INTEGRATION_DISPLAY: {
    type: string;
    name: string;
  }[] = [
    { type: 'ELD', name: 'Samsara HOS' },
    { type: 'ELD', name: 'GPS Tracking' },
    { type: 'WEATHER', name: 'Weather API' },
    { type: 'FUEL_PRICE', name: 'Fuel Prices' },
  ];

  async getSystemHealth(tenantId: number): Promise<SystemHealthDto> {
    const cacheKey = buildKey('sally:cmdcenter', 'health', tenantId);
    const cached = await this.cache.get<SystemHealthDto>(cacheKey);
    if (cached) return cached;

    // Read from monitoring engine cache
    const cycleResult = await this.monitoringEngine.getCachedResult(tenantId);

    // Build monitoring status from cycle result
    let monitoringStatus: SystemHealthDto['monitoring']['status'] = 'inactive';
    let loadsMonitored = 0;
    let driversMonitored = 0;
    let triggersLastCycle = 0;
    let lastCycleAt: string | null = null;

    if (cycleResult) {
      monitoringStatus = cycleResult.status;
      loadsMonitored = cycleResult.loadsMonitored;
      driversMonitored = cycleResult.driversMonitored;
      triggersLastCycle = cycleResult.triggersThisCycle;
      lastCycleAt = cycleResult.lastCycleAt;
    }

    // Build checks from cycle result or use defaults
    let checks: SystemHealthDto['checks'];
    if (cycleResult) {
      // Group active checks by category
      const categoryMap = new Map<
        string,
        {
          name: string;
          type: string;
          enabled: boolean;
          lastFiredAt: string | null;
        }[]
      >();

      for (const check of cycleResult.checks.active) {
        const catName = this.formatCategoryName(check.category);
        if (!categoryMap.has(catName)) categoryMap.set(catName, []);
        categoryMap.get(catName).push({
          name: check.displayName,
          type: check.id,
          enabled: true,
          lastFiredAt: check.issueCount > 0 ? cycleResult.lastCycleAt : null,
        });
      }

      // Add inactive checks
      for (const check of cycleResult.checks.inactive) {
        const catName = this.formatCategoryName(check.category);
        if (!categoryMap.has(catName)) categoryMap.set(catName, []);
        categoryMap.get(catName).push({
          name: check.displayName,
          type: check.id,
          enabled: false,
          lastFiredAt: null,
        });
      }

      checks = Array.from(categoryMap.entries()).map(([category, checkList]) => ({
        category,
        checks: checkList,
      }));
    } else {
      checks = SystemHealthService.MONITORING_CHECKS.map((cat) => ({
        category: cat.category,
        checks: cat.checks.map((c) => ({
          name: c.name,
          type: c.type,
          enabled: true,
          lastFiredAt: null,
        })),
      }));
    }

    // Get integration configs for this tenant
    const integrations = await this.prisma.integrationConfig.findMany({
      where: { tenantId },
      select: {
        integrationType: true,
        vendor: true,
        displayName: true,
        isEnabled: true,
        status: true,
        lastSuccessAt: true,
      },
    });

    const integrationHealth: SystemHealthIntegrationDto[] = SystemHealthService.INTEGRATION_DISPLAY.map((display) => {
      const config = integrations.find((i) => i.integrationType === display.type);

      if (!config) {
        return {
          name: display.name,
          type: display.type,
          source: 'mock' as const,
          status: 'not_configured' as const,
          lastSuccessAt: null,
        };
      }

      const isLive = config.isEnabled && (config.status === 'ACTIVE' || config.status === 'CONFIGURED');

      return {
        name: display.name,
        type: display.type,
        source: isLive ? ('live' as const) : ('mock' as const),
        status:
          config.status === 'ACTIVE'
            ? ('connected' as const)
            : config.status === 'ERROR'
              ? ('disconnected' as const)
              : ('not_configured' as const),
        lastSuccessAt: config.lastSuccessAt?.toISOString() ?? null,
      };
    });

    // Build pipeline from cycle result data sources or query directly
    let pipeline: PipelineSyncStatus[];
    if (cycleResult) {
      pipeline = cycleResult.dataSources
        .filter((ds) => ds.available || ds.status !== 'not_configured')
        .map((ds) => ({
          syncType: ds.definition.id,
          displayName: ds.definition.displayName,
          expectedIntervalSeconds: 60,
          lastSuccessAt: ds.lastSyncAge !== null ? new Date(Date.now() - ds.lastSyncAge * 1000).toISOString() : null,
          lastFailureAt: null,
          lastError: null,
          status:
            ds.status === 'healthy'
              ? ('active' as const)
              : ds.status === 'delayed'
                ? ('delayed' as const)
                : ds.status === 'stale'
                  ? ('stale' as const)
                  : ('never' as const),
          consecutiveFailures: 0,
        }));
    } else {
      pipeline = await this.buildPipelineFromJobs(tenantId);
    }

    const result: SystemHealthDto = {
      monitoring: {
        status: monitoringStatus,
        lastCycleAt,
        loadsMonitored,
        driversMonitored,
        triggersLastCycle,
        cycleIntervalSeconds: cycleResult?.cycleIntervalSeconds ?? 120,
      },
      checks,
      integrations: integrationHealth,
      pipeline,
    };

    await this.cache.set(cacheKey, result, CACHE_TTL_HOT_60S);
    return result;
  }

  private formatCategoryName(category: string): string {
    const map: Record<string, string> = {
      hos_compliance: 'HOS Compliance',
      load_progress: 'Load Progress',
      driver_behavior: 'Driver Behavior',
      vehicle_state: 'Vehicle State',
      lifecycle: 'Lifecycle',
    };
    return map[category] ?? category;
  }

  private async buildPipelineFromJobs(tenantId: number): Promise<PipelineSyncStatus[]> {
    const SYNC_TYPES: Array<{ type: string; category: JobCategory; displayName: string; expectedInterval: number }> = [
      {
        type: 'hos',
        category: 'telemetry',
        displayName: 'HOS Sync',
        expectedInterval: 60,
      },
      {
        type: 'gps',
        category: 'telemetry',
        displayName: 'GPS Sync',
        expectedInterval: 30,
      },
      {
        type: 'drivers',
        category: 'vendor',
        displayName: 'Fleet Sync',
        expectedInterval: 900,
      },
      {
        type: 'loads',
        category: 'vendor',
        displayName: 'Loads Sync',
        expectedInterval: 900,
      },
    ];

    return Promise.all(
      SYNC_TYPES.map(async ({ type, category, displayName, expectedInterval }) => {
        const [lastSuccess, lastFailure] = await Promise.all([
          this.prisma.job.findFirst({
            where: {
              category,
              type,
              tenantId,
              status: JOB_STATUS.COMPLETED,
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true },
          }),
          this.prisma.job.findFirst({
            where: {
              category,
              type,
              tenantId,
              status: JOB_STATUS.FAILED,
            },
            orderBy: { completedAt: 'desc' },
            select: { completedAt: true, errorMessage: true },
          }),
        ]);

        const failCount = lastSuccess?.completedAt
          ? await this.prisma.job.count({
              where: {
                category,
                type,
                tenantId,
                status: JOB_STATUS.FAILED,
                completedAt: { gte: lastSuccess.completedAt },
              },
            })
          : 0;

        const lastSuccessAt = lastSuccess?.completedAt;
        let status: PipelineSyncStatus['status'] = 'never';

        if (lastSuccessAt) {
          const ageSeconds = (Date.now() - lastSuccessAt.getTime()) / 1000;
          if (ageSeconds <= expectedInterval * 2) status = 'active';
          else if (ageSeconds <= expectedInterval * 3) status = 'delayed';
          else status = 'stale';
        }

        return {
          syncType: type,
          displayName,
          expectedIntervalSeconds: expectedInterval,
          lastSuccessAt: lastSuccessAt?.toISOString() ?? null,
          lastFailureAt: lastFailure?.completedAt?.toISOString() ?? null,
          lastError: lastFailure?.errorMessage ?? null,
          status,
          consecutiveFailures: failCount,
        };
      }),
    );
  }
}
