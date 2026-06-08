import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { JobStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { buildDateRangeFilter } from '../../shared/utils/date-range';
import {
  CategorySummary,
  ScheduledTypeInfo,
  JobMetrics,
  PaginatedJobs,
  JOB_CATEGORIES,
  JobCategory,
  TYPE_DISPLAY_NAMES,
  TENANT_VISIBLE_CATEGORIES,
  MANUAL_CATEGORY_TYPES,
  cronToHuman,
} from './job.types';
import { QUEUE_NAMES } from './queue.constants';
import { JobStatusSchema } from '@sally/shared-types';

const JOB_STATUS = JobStatusSchema.enum;

/** Grace period before a scheduled job is considered overdue */
const SCHEDULE_OVERDUE_GRACE_MS = 5 * 60 * 1000; // 5 minutes
/** Threshold after which an overdue job is critical */
const SCHEDULE_OVERDUE_CRITICAL_MS = 30 * 60 * 1000; // 30 minutes

interface CreateJobParams {
  tenantId: number;
  submittedBy: number | null;
  /** Must be a key of `JOB_CATEGORIES` — no magic strings. */
  category: JobCategory;
  type: string;
  inputData: Record<string, any>;
  inputHash?: string;
  priority?: number;
  maxAttempts?: number;
}

@Injectable()
export class JobService {
  private readonly logger = new Logger(JobService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findCompletedByHash(tenantId: number, category: string, type: string, inputHash: string) {
    return this.prisma.job.findFirst({
      where: {
        tenantId,
        category,
        type,
        inputHash,
        status: JOB_STATUS.COMPLETED,
      },
      orderBy: { completedAt: 'desc' },
    });
  }

  async findActiveLoadByHash(
    tenantId: number,
    category: string,
    type: string,
    inputHash: string,
  ): Promise<{ loadNumber: string } | null> {
    const job = await this.prisma.job.findFirst({
      where: { tenantId, category, type, inputHash, status: JOB_STATUS.COMPLETED },
      orderBy: { completedAt: 'desc' },
    });

    if (!job?.resultData) return null;

    const result = job.resultData as Record<string, any>;
    if (!result.loadNumber) return null;

    // Check if the load still exists and isn't cancelled
    const load = await this.prisma.load.findFirst({
      where: {
        loadNumber: result.loadNumber,
        status: { notIn: ['CANCELLED'] },
        isActive: true,
      },
    });

    if (!load) return null;
    return { loadNumber: result.loadNumber };
  }

  async createJob(params: CreateJobParams) {
    const job = await this.prisma.job.create({
      data: {
        tenantId: params.tenantId,
        submittedBy: params.submittedBy,
        category: params.category,
        type: params.type,
        status: JOB_STATUS.QUEUED,
        priority: params.priority ?? 0,
        inputData: params.inputData,
        inputHash: params.inputHash,
        maxAttempts: params.maxAttempts ?? 3,
      },
    });

    this.logger.log(`Job created: ${job.id} (${params.category}/${params.type})`);
    return job;
  }

  async markProcessing(jobId: number) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.PROCESSING,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  }

  async markCompleted(jobId: number, resultData: Record<string, any>) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.COMPLETED,
        resultData,
        completedAt: new Date(),
      },
    });
  }

  async markFailed(jobId: number, errorMessage: string, errorDetails?: Record<string, any>) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.FAILED,
        errorMessage,
        errorDetails: errorDetails ?? undefined,
        completedAt: new Date(),
      },
    });
  }

  async markQueued(jobId: number) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JOB_STATUS.QUEUED },
    });
  }

  async updateInputData(jobId: number, inputData: Record<string, any>) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { inputData },
    });
  }

  async getJob(jobId: number) {
    return this.prisma.job.findUnique({
      where: { id: jobId },
    });
  }

  async listJobs(
    tenantId: number,
    filters?: {
      category?: string;
      type?: string;
      status?: JobStatus[];
      limit?: number;
      dismissed?: boolean;
    },
  ) {
    return this.prisma.job.findMany({
      where: {
        tenantId,
        ...(filters?.category && { category: filters.category }),
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status !== undefined && { status: { in: filters.status } }),
        ...(filters?.dismissed === false && { dismissedAt: null }),
        ...(filters?.dismissed === true && { dismissedAt: { not: null } }),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 20,
    });
  }

  async listJobsPaginated(
    tenantId: number,
    filters?: {
      category?: string;
      type?: string;
      status?: JobStatus[];
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
      dismissed?: boolean;
    },
  ): Promise<PaginatedJobs> {
    const where: any = { tenantId };
    if (filters?.category) where.category = filters.category;
    if (filters?.type) where.type = filters.type;
    if (filters?.status !== undefined) where.status = { in: filters.status };
    if (filters?.dismissed === false) where.dismissedAt = null;
    if (filters?.dismissed === true) where.dismissedAt = { not: null };
    const dateFilter = buildDateRangeFilter(filters?.dateFrom, filters?.dateTo);
    if (dateFilter) where.createdAt = dateFilter;

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit ?? 20,
        skip: filters?.offset ?? 0,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items,
      total,
      limit: filters?.limit ?? 20,
      offset: filters?.offset ?? 0,
    };
  }

  async listAllJobsPaginated(filters?: {
    tenantId?: number;
    category?: string;
    type?: string;
    status?: JobStatus[];
    limit?: number;
    offset?: number;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<PaginatedJobs> {
    const where: any = {};
    if (filters?.tenantId) where.tenantId = filters.tenantId;
    if (filters?.category) where.category = filters.category;
    if (filters?.type) where.type = filters.type;
    if (filters?.status !== undefined) where.status = { in: filters.status };
    const dateFilter = buildDateRangeFilter(filters?.dateFrom, filters?.dateTo);
    if (dateFilter) where.createdAt = dateFilter;

    const [items, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters?.limit ?? 20,
        skip: filters?.offset ?? 0,
        include: { tenant: { select: { id: true, companyName: true } } },
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      items,
      total,
      limit: filters?.limit ?? 20,
      offset: filters?.offset ?? 0,
    };
  }

  /**
   * Query BullMQ repeatable jobs across all queues and return a map of
   * category → scheduled type info (schedule frequency + next run).
   */
  async getScheduledTypes(queues: Record<string, Queue>, tenantId?: number): Promise<Map<string, ScheduledTypeInfo[]>> {
    const result = new Map<string, ScheduledTypeInfo[]>();

    for (const [queueName, queue] of Object.entries(queues)) {
      const repeatables = await queue.getRepeatableJobs();

      if (queueName === QUEUE_NAMES.TELEMETRY || queueName === QUEUE_NAMES.VENDOR_DATA) {
        // Both integration-sync queues map onto a single Job category each:
        //   telemetry   → JOB_CATEGORIES.telemetry  (hos, gps, dvir, fleet-sync)
        //   vendor-data → JOB_CATEGORIES.vendor     (drivers, vehicles, loads + other vendor data)
        // The repeatable job-name is the BullMQ job name (e.g. 'hos',
        // 'tms-drivers') — we strip the 'tms-' prefix so the UI sees the
        // bare sync type, matching the old fleet-pipeline behaviour.
        const category: JobCategory = queueName === QUEUE_NAMES.TELEMETRY ? 'telemetry' : 'vendor';
        const typeMap = new Map<string, { schedule: string; nextRun: string | null }>();

        for (const job of repeatables) {
          const rawType = job.name;
          if (!rawType) continue;

          // Tenant filtering: parse jobId from the key if available
          if (tenantId !== undefined && job.id) {
            const match = job.id.match(/tenant-(\d+)/);
            if (match && parseInt(match[1], 10) !== tenantId) continue;
          }

          const type = rawType.startsWith('tms-') ? rawType.slice('tms-'.length) : rawType;

          // Keep first match per type (all instances share the same schedule)
          if (!typeMap.has(type)) {
            const schedule = cronToHuman(job.pattern, job.every ? Number(job.every) : null);
            typeMap.set(type, {
              schedule,
              nextRun: job.next ? new Date(job.next).toISOString() : null,
            });
          }
        }

        const entries: ScheduledTypeInfo[] = [];
        for (const [type, info] of typeMap) {
          entries.push({
            type,
            schedule: info.schedule,
            nextRun: info.nextRun,
          });
        }
        if (entries.length) {
          // Multiple queues may roll up into the same category (none today,
          // but be defensive): merge entries instead of overwriting.
          const existing = result.get(category) ?? [];
          result.set(category, existing.concat(entries));
        }
      } else {
        // Non-sync queues: system-wide, show to all tenants
        const category = queueName; // queue name = category key
        const entries: ScheduledTypeInfo[] = [];

        for (const job of repeatables) {
          const type = job.name;
          const schedule = cronToHuman(job.pattern, job.every ? Number(job.every) : null);
          entries.push({
            type,
            schedule,
            nextRun: job.next ? new Date(job.next).toISOString() : null,
          });
        }

        if (entries.length) result.set(category, entries);
      }
    }

    // Add manual-only types (always shown, even if category already has scheduled types)
    for (const [category, types] of Object.entries(MANUAL_CATEGORY_TYPES)) {
      const existing = result.get(category) ?? [];
      const existingTypes = new Set(existing.map((e) => e.type));
      for (const type of types) {
        if (!existingTypes.has(type)) {
          existing.push({ type, schedule: 'Manual', nextRun: null });
        }
      }
      result.set(category, existing);
    }

    return result;
  }

  async getVisibleCategories(tenantId: number): Promise<JobCategory[]> {
    const activeIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId,
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { integrationType: true },
      distinct: ['integrationType'],
    });
    const activeTypes = new Set(activeIntegrations.map((i) => i.integrationType));

    return Object.entries(JOB_CATEGORIES)
      .filter(([_, meta]) => meta.tenantVisible)
      .filter(([_, meta]) => !meta.requiredIntegration || activeTypes.has(meta.requiredIntegration))
      .map(([key]) => key as JobCategory);
  }

  async getCategorySummary(
    tenantId: number,
    categories: string[] = TENANT_VISIBLE_CATEGORIES,
    queues?: Record<string, Queue>,
  ): Promise<CategorySummary[]> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Fetch schedule info from BullMQ (if queues provided) and DB stats in parallel
    const [todayStats, lastRuns, scheduledTypes, latestStatuses] = await Promise.all([
      // Today's counts grouped by category, type, status
      this.prisma.job.groupBy({
        by: ['category', 'type', 'status'],
        where: {
          tenantId,
          category: { in: categories },
          createdAt: { gte: todayStart },
        },
        _count: true,
      }),
      // Last run per category+type (all time)
      this.prisma.job.groupBy({
        by: ['category', 'type'],
        where: {
          tenantId,
          category: { in: categories },
        },
        _max: { createdAt: true },
      }),
      queues ? this.getScheduledTypes(queues, tenantId) : Promise.resolve(new Map<string, ScheduledTypeInfo[]>()),
      // Latest job status per category+type (most recent run's terminal status)
      this.prisma.$queryRaw<{ category: string; type: string; status: string }[]>`
        SELECT DISTINCT ON (category, type) category, type, status
        FROM jobs
        WHERE tenant_id = ${tenantId}
          AND category = ANY(${categories})
          AND status IN ('COMPLETED', 'FAILED', 'CANCELLED')
        ORDER BY category, type, created_at DESC
      `,
    ]);

    // Build lookup: "category:type" → last run status
    const lastRunStatusMap = new Map<string, string>(latestStatuses.map((r) => [`${r.category}:${r.type}`, r.status]));

    // Build lookup maps from aggregate results
    const lastRunMap = new Map<string, Date>();
    for (const lr of lastRuns) {
      if (lr._max.createdAt) {
        lastRunMap.set(`${lr.category}:${lr.type}`, lr._max.createdAt);
      }
    }

    // Build today's stats lookup: category:type -> { total, succeeded, failed }
    const statsMap = new Map<string, { total: number; succeeded: number; failed: number }>();
    for (const row of todayStats) {
      const key = `${row.category}:${row.type}`;
      const entry = statsMap.get(key) ?? { total: 0, succeeded: 0, failed: 0 };
      entry.total += row._count;
      if (row.status === JOB_STATUS.COMPLETED) entry.succeeded += row._count;
      if (row.status === JOB_STATUS.FAILED) entry.failed += row._count;
      statsMap.set(key, entry);
    }

    // Build schedule lookup: category:type -> { schedule, nextRun }
    const scheduleMap = new Map<string, { schedule: string; nextRun: string | null }>();
    for (const [category, infos] of scheduledTypes) {
      for (const info of infos) {
        scheduleMap.set(`${category}:${info.type}`, {
          schedule: info.schedule,
          nextRun: info.nextRun,
        });
      }
    }

    return categories.map((category) => {
      // Scheduled types are the base set — DB types are overlaid on top
      const types = new Set<string>();

      // Add scheduled types first (always shown, even with 0 runs)
      const scheduled = scheduledTypes.get(category);
      if (scheduled) {
        for (const s of scheduled) types.add(s.type);
      }

      // Add types discovered from DB stats
      for (const key of statsMap.keys()) {
        if (key.startsWith(`${category}:`)) types.add(key.split(':')[1]);
      }
      for (const key of lastRunMap.keys()) {
        if (key.startsWith(`${category}:`)) types.add(key.split(':')[1]);
      }

      // Aggregate category-level totals from the per-type stats
      let todayTotal = 0;
      let todaySucceeded = 0;
      let todayFailed = 0;
      for (const type of types) {
        const stats = statsMap.get(`${category}:${type}`);
        if (stats) {
          todayTotal += stats.total;
          todaySucceeded += stats.succeeded;
          todayFailed += stats.failed;
        }
      }

      const categoryLastRuns = [...lastRunMap.entries()]
        .filter(([key]) => key.startsWith(`${category}:`))
        .map(([, date]) => date);
      const lastRunAt = categoryLastRuns.length
        ? new Date(Math.max(...categoryLastRuns.map((d) => d.getTime()))).toISOString()
        : null;

      // Find the earliest nextRun across all types in this category
      const categoryNextRuns = [...scheduleMap.entries()]
        .filter(([key]) => key.startsWith(`${category}:`))
        .map(([, info]) => info.nextRun)
        .filter((nr): nr is string => !!nr);
      const earliestNextRun = categoryNextRuns.length
        ? new Date(Math.min(...categoryNextRuns.map((d) => new Date(d).getTime()))).toISOString()
        : null;

      const health = this.calculateHealth(todayFailed, lastRunAt, earliestNextRun);

      return {
        category,
        displayName: JOB_CATEGORIES[category as JobCategory]?.display ?? category,
        lastRunAt,
        todayTotal,
        todaySucceeded,
        todayFailed,
        health,
        types: [...types].map((type) => {
          const stats = statsMap.get(`${category}:${type}`);
          const typeLastRun = lastRunMap.get(`${category}:${type}`);
          const scheduleInfo = scheduleMap.get(`${category}:${type}`);
          return {
            type,
            displayName: TYPE_DISPLAY_NAMES[type] ?? type,
            lastRunAt: typeLastRun?.toISOString() ?? null,
            lastRunStatus:
              (lastRunStatusMap.get(`${category}:${type}`) as 'COMPLETED' | 'FAILED' | 'CANCELLED') ?? null,
            todayTotal: stats?.total ?? 0,
            todaySucceeded: stats?.succeeded ?? 0,
            todayFailed: stats?.failed ?? 0,
            schedule: scheduleInfo?.schedule ?? null,
            nextRun: scheduleInfo?.nextRun ?? null,
          };
        }),
      };
    });
  }

  private calculateHealth(
    todayFailed: number,
    lastRunAt: string | null,
    earliestNextRun: string | null,
  ): 'healthy' | 'warning' | 'critical' {
    if (todayFailed >= 3) return 'critical';
    if (todayFailed >= 1) return 'warning';
    if (!lastRunAt) return 'healthy'; // No history = no failures

    // Use actual schedule to determine staleness instead of hardcoded thresholds
    if (earliestNextRun) {
      const overdueMs = Date.now() - new Date(earliestNextRun).getTime();
      if (overdueMs > SCHEDULE_OVERDUE_CRITICAL_MS) return 'critical';
      if (overdueMs > SCHEDULE_OVERDUE_GRACE_MS) return 'warning';
    }

    return 'healthy';
  }

  async getMetrics(tenantId?: number): Promise<JobMetrics> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const where: any = { createdAt: { gte: todayStart } };
    if (tenantId) where.tenantId = tenantId;

    // Use SQL aggregates instead of fetching all rows into memory
    const [statusCounts, durationResult] = await Promise.all([
      this.prisma.job.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      // Compute avg duration from timestamps using raw SQL
      tenantId
        ? this.prisma.$queryRaw<[{ avg_ms: number | null }]>`
            SELECT AVG(EXTRACT(EPOCH FROM ("completed_at" - "started_at")) * 1000)::int as avg_ms
            FROM jobs
            WHERE "created_at" >= ${todayStart}
              AND "started_at" IS NOT NULL
              AND "completed_at" IS NOT NULL
              AND "tenant_id" = ${tenantId}
          `
        : this.prisma.$queryRaw<[{ avg_ms: number | null }]>`
            SELECT AVG(EXTRACT(EPOCH FROM ("completed_at" - "started_at")) * 1000)::int as avg_ms
            FROM jobs
            WHERE "created_at" >= ${todayStart}
              AND "started_at" IS NOT NULL
              AND "completed_at" IS NOT NULL
          `,
    ]);

    let totalToday = 0;
    let completed = 0;
    let failedCount = 0;
    for (const row of statusCounts) {
      totalToday += row._count;
      if (row.status === JOB_STATUS.COMPLETED) completed = row._count;
      if (row.status === JOB_STATUS.FAILED) failedCount = row._count;
    }

    const successRate = totalToday > 0 ? Math.round((completed / totalToday) * 100) : 100;
    const avgDurationMs = durationResult[0]?.avg_ms ?? 0;

    return { totalToday, successRate, failedCount, avgDurationMs };
  }

  async resetForRetry(jobId: number) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: {
        status: JOB_STATUS.QUEUED,
        errorMessage: null,
        errorDetails: null,
        startedAt: null,
        completedAt: null,
        dismissedAt: null,
      },
    });
  }

  async dismissJob(jobId: number, tenantId: number) {
    return this.prisma.job.update({
      where: { id: jobId, tenantId },
      data: { dismissedAt: new Date() },
    });
  }

  async cancelJob(jobId: number) {
    return this.prisma.job.update({
      where: { id: jobId },
      data: { status: JOB_STATUS.CANCELLED, completedAt: new Date() },
    });
  }
}
