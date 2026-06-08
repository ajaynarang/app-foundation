import { Injectable, Logger } from '@nestjs/common';
import { JobStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DataSourceRegistry } from '../data-sources/data-source.registry';
import { DataSourceDefinition, DataSourceStatus, ResolvedDataSource } from '../monitoring.types';
import type { JobCategory } from '../../../../infrastructure/queue/job.types';

const JOB_STATUS = JobStatusSchema.enum;

// Multipliers for schedule-based freshness
const HEALTHY_MULTIPLIER = 3;
const DELAYED_MULTIPLIER = 5;

/**
 * Map data source id → JobSchedule category (seeded legacy values, NOT updated
 * by the 2026-05-27 redesign) and the matching Job table category (the new
 * JOB_CATEGORIES keys that Job rows are now written with).
 *
 * Both columns are called `category` but live in different tables and were
 * migrated on different timelines:
 *   - JobSchedule.category — seeded historically ('eld', 'tms', …); untouched
 *   - Job.category         — re-keyed to JOB_CATEGORIES keys ('telemetry', 'vendor', …)
 */
const SOURCE_TO_JOB_MAP: Record<string, { scheduleCategory: string; jobCategory: JobCategory; jobType: string }> = {
  hos: { scheduleCategory: 'eld', jobCategory: 'telemetry', jobType: 'hos' },
  gps: { scheduleCategory: 'eld', jobCategory: 'telemetry', jobType: 'gps' },
  fleet: { scheduleCategory: 'tms', jobCategory: 'vendor', jobType: 'drivers' },
  loads: { scheduleCategory: 'tms', jobCategory: 'vendor', jobType: 'loads' },
};

@Injectable()
export class DataSourceResolverService {
  private readonly logger = new Logger(DataSourceResolverService.name);

  constructor(
    private readonly registry: DataSourceRegistry,
    private readonly prisma: PrismaService,
  ) {}

  async resolveForTenant(tenantId: number): Promise<ResolvedDataSource[]> {
    const [integrations, schedules] = await Promise.all([
      this.prisma.integrationConfig.findMany({
        where: { tenantId, isEnabled: true },
        select: {
          integrationType: true,
          status: true,
          isEnabled: true,
        },
      }),
      this.prisma.jobSchedule.findMany({
        select: {
          category: true,
          jobType: true,
          intervalMs: true,
          pattern: true,
          isEnabled: true,
        },
      }),
    ]);

    const activeIntegrationTypes = new Set(
      integrations.filter((i) => ['ACTIVE', 'CONFIGURED'].includes(i.status)).map((i) => i.integrationType),
    );

    const results: ResolvedDataSource[] = [];

    for (const source of this.registry.getAll()) {
      const resolved = await this.resolveSource(source, tenantId, activeIntegrationTypes, schedules);
      results.push(resolved);
    }

    return results;
  }

  async getAvailableCapabilities(tenantId: number): Promise<string[]> {
    const resolved = await this.resolveForTenant(tenantId);
    const caps = new Set<string>();
    for (const r of resolved) {
      if (r.available && (r.status === 'healthy' || r.status === 'delayed')) {
        r.definition.provides.forEach((p) => caps.add(p));
      }
    }
    return Array.from(caps);
  }

  getAvailableCapabilitiesFromResolved(resolved: ResolvedDataSource[]): Set<string> {
    const caps = new Set<string>();
    for (const r of resolved) {
      if (r.available && r.status !== 'stale' && r.status !== 'never') {
        r.definition.provides.forEach((p) => caps.add(p));
      }
    }
    return caps;
  }

  private async resolveSource(
    source: DataSourceDefinition,
    tenantId: number,
    activeIntegrationTypes: Set<string>,
    schedules: any[],
  ): Promise<ResolvedDataSource> {
    if (source.sourceType === 'integration' && source.integrationRequirement) {
      const hasIntegration = activeIntegrationTypes.has(source.integrationRequirement.type);
      if (!hasIntegration) {
        return {
          definition: source,
          available: false,
          status: 'not_configured',
          lastSyncAge: null,
        };
      }
    }

    // Platform services (e.g. route_plan) are always available — they're internal
    if (source.sourceType === 'platform_service') {
      return {
        definition: source,
        available: true,
        status: 'healthy',
        lastSyncAge: null,
      };
    }

    const status = await this.checkFreshness(source, tenantId, schedules);
    return {
      definition: source,
      available: true,
      ...status,
    };
  }

  private async checkFreshness(
    source: DataSourceDefinition,
    tenantId: number,
    schedules: any[],
  ): Promise<{ status: DataSourceStatus; lastSyncAge: number | null }> {
    if (source.freshnessStrategy === 'ttl') {
      return { status: 'healthy', lastSyncAge: null };
    }

    const jobMapping = SOURCE_TO_JOB_MAP[source.id];
    if (!jobMapping) {
      return { status: 'healthy', lastSyncAge: null };
    }

    const schedule = schedules.find(
      (s) => s.category === jobMapping.scheduleCategory && s.jobType === jobMapping.jobType,
    );

    const lastJob = await this.prisma.job.findFirst({
      where: {
        category: jobMapping.jobCategory,
        type: jobMapping.jobType,
        tenantId,
        status: JOB_STATUS.COMPLETED,
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });

    if (!lastJob?.completedAt) {
      return { status: 'never', lastSyncAge: null };
    }

    const ageMs = Date.now() - lastJob.completedAt.getTime();
    const ageSeconds = Math.round(ageMs / 1000);

    const intervalMs = schedule?.intervalMs || this.cronToMs(schedule?.pattern) || 600000;

    if (ageMs <= intervalMs * HEALTHY_MULTIPLIER) {
      return { status: 'healthy', lastSyncAge: ageSeconds };
    }
    if (ageMs <= intervalMs * DELAYED_MULTIPLIER) {
      return { status: 'delayed', lastSyncAge: ageSeconds };
    }
    return { status: 'stale', lastSyncAge: ageSeconds };
  }

  private cronToMs(pattern: string | null): number | null {
    if (!pattern) return null;
    const match = pattern.match(/^\*\/(\d+)\s/);
    if (match) return parseInt(match[1]) * 60 * 1000;
    return null;
  }
}
