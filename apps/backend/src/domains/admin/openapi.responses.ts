import { z } from 'zod';
import {
  AiBudgetSchema,
  AiCostVsQuotaSchema,
  AiSpendInvocationListSchema,
  AiSpendSummarySchema,
  AiSpendSurfaceRowSchema,
  AiSpendTenantSummarySchema,
  DeadlineListItemSchema,
  DurabilityHealthSchema,
  JobMetricsSchema,
  JobStatusSchema,
  TypeSummarySchema,
} from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

/** The super-admin routes' response bodies, each named once. */

// ─── AI spend ────────────────────────────────────────────────────────────────

export const AdminAiSpendTenantListResponse = defineCursorListSchema(
  'AdminAiSpendTenantList',
  AiSpendTenantSummarySchema,
);
export const AdminAiSpendSummaryResponse = defineResponseSchema('AdminAiSpendSummary', AiSpendSummarySchema);
export const AdminAiSpendSurfaceRowResponse = defineResponseSchema('AdminAiSpendSurfaceRow', AiSpendSurfaceRowSchema);
export const AdminAiSpendInvocationListResponse = defineResponseSchema(
  'AdminAiSpendInvocationList',
  AiSpendInvocationListSchema,
);
export const AdminAiBudgetResponse = defineResponseSchema('AdminAiBudget', AiBudgetSchema);
export const AdminAiCostVsQuotaResponse = defineResponseSchema('AdminAiCostVsQuota', AiCostVsQuotaSchema);

// ─── Deadlines ───────────────────────────────────────────────────────────────

export const AdminDeadlineListResponse = defineCursorListSchema('AdminDeadlineList', DeadlineListItemSchema);
export const AdminDeadlineKindResponse = defineResponseSchema('AdminDeadlineKind', z.string());
export const AdminDurabilityHealthResponse = defineResponseSchema('AdminDurabilityHealth', DurabilityHealthSchema);

// ─── Cache ───────────────────────────────────────────────────────────────────

/** `GET /admin/cache/health` — Redis INFO fields (strings as Redis prints them), or `unavailable` with a message. */
export const AdminCacheHealthResponse = defineResponseSchema(
  'AdminCacheHealth',
  z.object({
    status: z.enum(['connected', 'unavailable']),
    backend: z.literal('redis'),
    message: z.string().optional().describe('Only when unavailable'),
    uptime: z.string().optional().describe('e.g. "3600s", or "unknown"'),
    memoryUsed: z.string().optional(),
    memoryPeak: z.string().optional(),
    connectedClients: z.string().optional(),
    totalKeys: z.string().optional().describe('The raw db0 keyspace line, or "none"'),
    redisVersion: z.string().optional(),
  }),
);

/** `GET /admin/cache/stats` — per-namespace hit/miss counters (this process) and key counts. */
export const AdminCacheStatsResponse = defineResponseSchema(
  'AdminCacheStats',
  z.object({
    namespaces: z.array(z.string()),
    metrics: z.record(z.string(), z.object({ hits: z.number().int(), misses: z.number().int() })),
    keyCounts: z.record(z.string(), z.number().int()),
  }),
);

/** `POST /admin/cache/flush[/:namespace]` — how many keys went, and from where (`all` or the namespace). */
export const AdminCacheFlushResponse = defineResponseSchema(
  'AdminCacheFlush',
  z.object({ flushed: z.number().int(), scope: z.string() }),
);

// ─── Domain events ───────────────────────────────────────────────────────────

export const AdminEventListResponse = defineCursorListSchema(
  'AdminEventList',
  z.object({
    id: z.string(),
    event: z.string(),
    aggregateType: z.string(),
    aggregateId: z.string().nullable(),
    actorId: z.string().nullable(),
    actorType: z.string().nullable(),
    actorLabel: z.string().nullable(),
    correlationId: z.string().nullable(),
    version: z.number().int(),
    data: z.unknown(),
    createdAt: z.string(),
    tenantId: z.string().describe('The tenant’s public slug'),
    visibility: z.enum(['external', 'internal']),
  }),
);

export const AdminEventStatsResponse = defineResponseSchema(
  'AdminEventStats',
  z.object({
    since: z.string(),
    eventCounts: z.array(z.object({ event: z.string(), count: z.number().int() })),
    totalEvents: z.number().int(),
  }),
);

/** One hour × event bucket of the last 24h. */
export const AdminEventVolumeBucketResponse = defineResponseSchema(
  'AdminEventVolumeBucket',
  z.object({ hour: z.string(), event: z.string(), count: z.number().int() }),
);

export const AdminWebhookHealthResponse = defineResponseSchema(
  'AdminWebhookHealth',
  z.object({
    since: z.string(),
    tenants: z.array(
      z.object({
        tenantId: z.string().describe('The tenant’s public slug'),
        total: z.number().int(),
        delivered: z.number().int(),
        failed: z.number().int(),
        successRate: z.number().describe('Percent, two decimals'),
      }),
    ),
    summary: z.object({
      totalDeliveries: z.number().int(),
      totalDelivered: z.number().int(),
      totalFailed: z.number().int(),
    }),
  }),
);

// ─── Jobs ────────────────────────────────────────────────────────────────────

/** A `jobs` row as the admin console reads it. */
const AdminJobSchema = z.object({
  id: z.number().int(),
  publicId: z.string(),
  tenantId: z.number().int(),
  submittedBy: z.number().int().nullable(),
  category: z.string(),
  type: z.string(),
  status: JobStatusSchema,
  priority: z.number().int(),
  inputData: z.unknown(),
  resultData: z.unknown().nullable(),
  errorMessage: z.string().nullable(),
  errorDetails: z.unknown().nullable(),
  attempts: z.number().int(),
  maxAttempts: z.number().int(),
  progress: z.number().int().nullable(),
  inputHash: z.string().nullable(),
  queuedAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  dismissedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const AdminJobResponse = defineResponseSchema('AdminJob', AdminJobSchema);
export const AdminJobListResponse = defineCursorListSchema(
  'AdminJobList',
  AdminJobSchema.extend({
    tenant: z.object({ id: z.number().int(), companyName: z.string() }),
  }),
);
export const AdminJobMetricsResponse = defineResponseSchema('AdminJobMetrics', JobMetricsSchema);

/** Mirrors the kernel's `CategorySummary` (health is lower-case there, unlike shared-types' CategorySummarySchema). */
const AdminJobCategorySummarySchema = z.object({
  category: z.string(),
  displayName: z.string(),
  lastRunAt: z.string().nullable(),
  todayTotal: z.number().int(),
  todaySucceeded: z.number().int(),
  todayFailed: z.number().int(),
  health: z.enum(['healthy', 'warning', 'critical']),
  types: z.array(TypeSummarySchema),
});
export const AdminJobCategorySummaryResponse = defineResponseSchema(
  'AdminJobCategorySummary',
  AdminJobCategorySummarySchema,
);

/** `POST /admin/jobs/:job_id/retry` (202) — the job, queued again. */
export const AdminJobRetryResponse = defineResponseSchema(
  'AdminJobRetry',
  z.object({ jobId: z.number().int(), status: z.literal('QUEUED') }),
);

/** A tenant's job-pause state, named by its public slug. */
export const AdminJobsPauseStateResponse = defineResponseSchema(
  'AdminJobsPauseState',
  z.object({
    tenantId: z.string().describe('The tenant’s public slug'),
    companyName: z.string(),
    jobsPaused: z.boolean(),
    jobsPausedAt: z.string().nullable(),
  }),
);

// ─── Schedules ───────────────────────────────────────────────────────────────

export const AdminJobScheduleResponse = defineResponseSchema(
  'AdminJobSchedule',
  z.object({
    id: z.number().int(),
    category: z.string(),
    jobType: z.string(),
    scheduleType: z.string().describe('cron | interval'),
    pattern: z.string().nullable(),
    intervalMs: z.number().int().nullable(),
    isEnabled: z.boolean(),
    updatedAt: z.string(),
    updatedBy: z.number().int().nullable(),
  }),
);
