import { z } from 'zod';
import type { CursorList } from './cursor-list';

// ─── Deadlines (ADR "Outbox and deadlines") — every timer is a row ──────────────────────────

/**
 * A deadline's state, derived from its stamps (never a column): PENDING waits for its due time,
 * FAILING is pending but its last handler run threw (retrying with backoff, never given up),
 * FIRED and CANCELLED are terminal. The four are disjoint and cover every row.
 */
export const DeadlineStateSchema = z.enum(['PENDING', 'FAILING', 'FIRED', 'CANCELLED']);
export type DeadlineState = z.infer<typeof DeadlineStateSchema>;
export const DEADLINE_STATES = DeadlineStateSchema.options;

/** Named sorts `GET /admin/deadlines` accepts: due time, soonest first (default) or latest first. */
export const DEADLINE_LIST_SORTS = ['soonest', 'latest'] as const;
export type DeadlineListSort = (typeof DEADLINE_LIST_SORTS)[number];
export const DEFAULT_DEADLINE_LIST_SORT: DeadlineListSort = 'soonest';

/** One row of the super-admin Timers list. `tenant.tenantId` is the tenant's public slug, never its Int key. */
export const DeadlineListItemSchema = z.object({
  id: z.string(),
  tenant: z.object({ tenantId: z.string(), companyName: z.string() }),
  kind: z.string(),
  subjectType: z.string(),
  subjectId: z.string(),
  dedupeKey: z.string(),
  state: DeadlineStateSchema,
  dueAt: z.string(),
  firedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  attempts: z.number().int(),
  lockedUntilAt: z.string().nullable(),
  lastError: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DeadlineListItem = z.infer<typeof DeadlineListItemSchema>;

/** `GET /admin/deadlines` — one page, with per-state counts for the pivot. */
export type DeadlineListResponse = CursorList<DeadlineListItem, DeadlineState>;

/** The sweeper's health: what is waiting, what is late, what keeps failing. */
export const DeadlineHealthSchema = z.object({
  pending: z.number().int(),
  failing: z.number().int(),
  /** Pending (or failing) rows more than a few minutes past their due time — the sweeper is behind or stuck. */
  overdue: z.number().int(),
  oldestOverdueDueAt: z.string().nullable(),
});
export type DeadlineHealth = z.infer<typeof DeadlineHealthSchema>;

/** The transactional outbox's health: events committed but not yet published. */
export const OutboxHealthSchema = z.object({
  unpublished: z.number().int(),
  oldestAgeSeconds: z.number().nullable(),
});
export type OutboxHealth = z.infer<typeof OutboxHealthSchema>;

/** `GET /admin/deadlines/health` — `outbox` is null only when no outbox health reader is bound. */
export const DurabilityHealthSchema = z.object({
  deadlines: DeadlineHealthSchema,
  outbox: OutboxHealthSchema.nullable(),
});
export type DurabilityHealth = z.infer<typeof DurabilityHealthSchema>;
