/**
 * API Contracts for the super-admin platform-infrastructure surface
 * (Phase 7).
 *
 * Hand-written Zod schemas pinned against the live response shapes on
 * `apps/backend/src/domains/admin/admin-{cache,events,schedules}.controller.ts`,
 * probed against `demo-northstar-2026` (backend :8001, 2026-05-15).
 *
 * Group 7a covers admin/* core (cache, events, schedules). Group 7b
 * (admin-jobs, platform-health) and 7c (billing-admin) extend this
 * file in subsequent commits.
 *
 * Source-of-truth pointers (Group 7a):
 *   - apps/backend/src/domains/admin/admin-cache.controller.ts
 *   - apps/backend/src/domains/admin/admin-events.controller.ts
 *   - apps/backend/src/domains/admin/admin-events.service.ts
 *   - apps/backend/src/domains/admin/admin-schedules.controller.ts
 *   - apps/backend/src/domains/admin/dto/update-schedule.dto.ts
 *   - apps/backend/src/constants/cache.constants.ts (CACHE_NAMESPACES)
 *
 * No `@app/shared-types` coverage exists for these surfaces today —
 * the admin/* response shapes are not exported. Phase 9 follow-up:
 * promote the stable ones to shared-types once admin UI stabilises.
 */
import { z } from 'zod';
import { isoDateString } from './helpers.js';

// ── admin/cache ──────────────────────────────────────────────────────

/**
 * `GET /admin/cache/health` — admin-cache.controller.ts:14-30.
 *
 * Two shapes depending on whether Redis is reachable. When unreachable
 * the service returns `{ status: 'unavailable', message }`. When
 * connected the service returns a wider envelope. Discriminated union
 * on `status`.
 *
 * Live probe shape (connected) on dev 2026-05-15:
 *   uptime, memoryUsed, memoryPeak, connectedClients, totalKeys,
 *   redisVersion — all string-typed. `totalKeys` is a raw INFO-line
 *   blob (e.g. "keys=9249,expires=15,..."), not a number.
 */
const CacheHealthConnectedSchema = z
  .object({
    status: z.literal('connected'),
    uptime: z.string(),
    memoryUsed: z.string(),
    memoryPeak: z.string(),
    connectedClients: z.string(),
    totalKeys: z.string(),
    redisVersion: z.string(),
  })
  .strict();

const CacheHealthUnavailableSchema = z
  .object({
    status: z.literal('unavailable'),
    message: z.string(),
  })
  .strict();

export const AdminCacheHealthSchema = z.discriminatedUnion('status', [
  CacheHealthConnectedSchema,
  CacheHealthUnavailableSchema,
]);

/**
 * `GET /admin/cache/stats` — admin-cache.controller.ts:32-46.
 *
 * `namespaces` is `CACHE_NAMESPACES` (constant from cache.constants.ts,
 * 28 entries today). `metrics` is keyed by namespace; each entry has
 * `hits` + `misses` integers. `keyCounts` is keyed by namespace; value
 * is a non-negative integer.
 *
 * Note: `metrics` only includes namespaces that have been touched
 * since process start. We use `z.record` to accept any subset of the
 * namespace list with the right value shape.
 */
const NamespaceMetricSchema = z
  .object({
    hits: z.number().int().nonnegative(),
    misses: z.number().int().nonnegative(),
  })
  .strict();

export const AdminCacheStatsSchema = z
  .object({
    namespaces: z.array(z.string().regex(/^app:/)).min(1),
    metrics: z.record(z.string(), NamespaceMetricSchema),
    keyCounts: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

/**
 * `POST /admin/cache/flush[/:namespace]` — admin-cache.controller.ts:48-68.
 *
 * Both flush paths return the same envelope. `scope` is `'all'` for the
 * unconditional flush, or the namespace string (e.g. `'app:health'`)
 * for the parameterised form. `flushed` is non-negative (Redis SCAN+DEL
 * returns the count actually removed; an empty namespace returns 0).
 */
export const AdminCacheFlushResponseSchema = z
  .object({
    flushed: z.number().int().nonnegative(),
    scope: z.string().min(1),
  })
  .strict();

// ── admin/events ─────────────────────────────────────────────────────

/**
 * Single DomainEventLog row as projected by `admin-events.service.listEvents`.
 *
 * `data` is the event payload, which varies per event type — we only
 * assert it's a JSON object (`z.record`) so the contract doesn't pin
 * to one event's payload shape. `correlationId` is null for events
 * with no upstream trace. `tenantId` is the tenant slug (string) or
 * null for system-wide events.
 *
 * `visibility` is a string enum on the Prisma side
 * (DomainEventVisibility) — observed values: 'internal', 'public',
 * 'partner'. We use `z.string()` rather than `z.enum` to absorb new
 * values without breaking contract.
 */
export const AdminEventRowSchema = z
  .object({
    id: z.string().min(1),
    event: z.string().min(1),
    aggregateType: z.string(),
    aggregateId: z.string(),
    actorId: z.string().nullable(),
    actorType: z.string(),
    actorLabel: z.string().nullable(),
    correlationId: z.string().nullable(),
    version: z.number().int().positive(),
    data: z.record(z.string(), z.unknown()),
    createdAt: isoDateString,
    tenantId: z.string().nullable(),
    visibility: z.string(),
  })
  .strict();

/**
 * `GET /admin/events` — admin-events.controller.ts:16-39.
 *
 * Pagination envelope: `{ items, total, limit, offset }`. `limit` is
 * clamped 1..100 (default 50). `total` is the unfiltered count after
 * any query filters but before pagination.
 */
export const AdminEventListSchema = z
  .object({
    items: z.array(AdminEventRowSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict();

/**
 * `GET /admin/events/stats` — admin-events.controller.ts:41-45.
 *
 * Window is last 24h (`since` ISO timestamp ~24h before now).
 * `eventCounts` is sorted desc by count; `totalEvents` is sum of all
 * event counts in the window.
 */
const EventCountRowSchema = z
  .object({
    event: z.string().min(1),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const AdminEventStatsSchema = z
  .object({
    since: isoDateString,
    eventCounts: z.array(EventCountRowSchema),
    totalEvents: z.number().int().nonnegative(),
  })
  .strict();

/**
 * `GET /admin/events/volume` — admin-events.controller.ts:47-51.
 *
 * Returns an ARRAY (bare, not envelope-wrapped) of hourly buckets,
 * one row per (hour, event) pair. NOT 24 rows — only hours that had
 * events appear, and each event-type within an hour gets its own row.
 *
 * Live probe 2026-05-15: 21 rows for a 24h window. The plan's earlier
 * "array length = 24" assertion was wrong — corrected here.
 */
const EventVolumeRowSchema = z
  .object({
    hour: isoDateString,
    event: z.string().min(1),
    count: z.number().int().nonnegative(),
  })
  .strict();

export const AdminEventVolumeSchema = z.array(EventVolumeRowSchema);

/**
 * `GET /admin/events/webhooks/health` — admin-events.controller.ts:53-57.
 *
 * `tenants` is an array of per-tenant delivery aggregates; empty array
 * when no tenant has tenant-level webhook deliveries. `summary` is the
 * cross-tenant rollup. We keep the per-tenant row shape permissive
 * (`z.record`) because that table is mid-evolution (Phase 5 webhook
 * dashboard work) — the summary is the stable part.
 */
const WebhookDeliverySummarySchema = z
  .object({
    totalDeliveries: z.number().int().nonnegative(),
    totalDelivered: z.number().int().nonnegative(),
    totalFailed: z.number().int().nonnegative(),
  })
  .strict();

export const AdminWebhookHealthSchema = z
  .object({
    since: isoDateString,
    tenants: z.array(z.record(z.string(), z.unknown())),
    summary: WebhookDeliverySummarySchema,
  })
  .strict();

// ── admin/schedules ──────────────────────────────────────────────────

/**
 * Single BullMQ schedule row as projected by
 * `ScheduleManagerService.listSchedules`.
 *
 * `scheduleType` is 'cron' | 'interval' — we use `z.string()` for
 * forward-compat. Either `pattern` (cron) OR `intervalMs` is set, the
 * other null. `updatedBy` is the User dbId (Int, nullable) of the
 * last super-admin who patched the row — null for rows that were
 * last touched by the system bootstrap (Prisma JobSchedule
 * .updatedBy: Int?, apps/backend/prisma/schema.prisma:3566).
 *
 * Probe 2026-05-15 on dev: 31 rows.
 */
export const AdminScheduleRowSchema = z
  .object({
    id: z.number().int().positive(),
    category: z.string().min(1),
    jobType: z.string().min(1),
    scheduleType: z.string(),
    pattern: z.string().nullable(),
    intervalMs: z.number().int().positive().nullable(),
    isEnabled: z.boolean(),
    updatedAt: isoDateString,
    updatedBy: z.number().int().positive().nullable(),
  })
  .strict();

export const AdminScheduleListSchema = z.array(AdminScheduleRowSchema);

// ── Common error envelope (shared across all 400 guards) ─────────────

/**
 * The platform's standard error envelope thrown by NestJS exception filters
 * — verified shape from `POST /admin/cache/flush` (no `confirm`) and
 * `POST /admin/cache/flush/:invalid-namespace` (2026-05-15).
 *
 * `detail` and `message` are usually the same string; `detail` is the
 * structured field. Permissive enough to absorb upstream filter
 * tweaks without breaking unrelated tests.
 */
export const AppErrorEnvelopeSchema = z
  .object({
    statusCode: z.number().int().positive(),
    timestamp: isoDateString,
    path: z.string(),
    method: z.string(),
    detail: z.string(),
    message: z.string(),
    error: z.string(),
  })
  .strict();
