import { z } from 'zod';
import {
  AgentKeySchema,
  ApprovalDecisionSchema,
  EpisodeStatusSchema,
  PrioritySchema,
  ResponsibilityKeySchema,
  TriggerKindSchema,
  TrustLevelSchema,
} from './enums';
import { StepRecordSchema } from './step';
import { ApprovalRecordSchema } from './approval';

/**
 * DeskEpisode REST shape.
 * The list view (`DeskEpisodeListItem`) is lean; the detail view includes steps + approvals.
 */

export const DeskEpisodeListItemSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.number().int().positive(),
  responsibilityKey: ResponsibilityKeySchema,
  ownerAgentKey: z.string(),

  trustLevelSnapshot: TrustLevelSchema,

  triggerKind: TriggerKindSchema,
  triggerLabel: z.string(),
  triggerFiredAt: z.string().datetime(),

  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  entityLabel: z.string().nullable(),

  status: EpisodeStatusSchema,
  priority: PrioritySchema,
  dedupeKey: z.string(),

  outcome: z.string().nullable(),
  outcomeNote: z.string().nullable(),

  temporalWorkflowId: z.string(),
  temporalRunId: z.string().nullable(),

  openedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type DeskEpisodeListItem = z.infer<typeof DeskEpisodeListItemSchema>;

export const DeskEpisodeDetailSchema = DeskEpisodeListItemSchema.extend({
  /**
   * Human-facing agent name ("Autumn", "Mike"). Distinct from the
   * `ownerAgentKey` on the list shape which is the machine key
   * (`sally-billing`). Surfaces in the sheet's title row so dispatchers
   * know which agent is asking / already decided at a glance.
   */
  ownerAgentName: z.string().nullable(),

  /**
   * Human-facing responsibility title ("Nudge customers on overdue
   * invoices"). Anchors the sheet header's agent+responsibility row so
   * the dispatcher reads the WHY of this episode before the specific
   * entity. Distinct from `responsibilityKey` (machine code).
   */
  responsibilityTitle: z.string(),

  conditionsSnapshot: z.record(z.unknown()),
  triggerSource: z.string().nullable(),
  triggerPayload: z.record(z.unknown()).nullable(),
  expiresAt: z.string().datetime().nullable(),
  steps: z.array(StepRecordSchema),
  approvals: z.array(ApprovalRecordSchema),

  /**
   * Most-recent decided approval — picked in-memory from `approvals` for
   * convenience. Enables Handled-mode sheet to render the decision diff
   * (proposed vs edited) without re-scanning the array. Null when no
   * approval has been decided yet (pure-autonomous episodes or still
   * pending).
   */
  mostRecentDecidedApproval: ApprovalRecordSchema.nullable(),

  /**
   * Populated when a live entity-suppression targets this episode's
   * entity. Deferred to Task 10 (suppression relation) / Task 12 (UI
   * wiring). Backend always returns `null` for now so the contract is
   * forward-compatible.
   */
  activeSuppression: z
    .object({
      id: z.string().uuid(),
      suppressUntil: z.string().nullable(), // null = forever
    })
    .nullable(),

  /**
   * IDs of the DeskMemory rows that hydrate retrieved for this episode.
   * Persisted onto the episode at hydrate time so the reinforcer can
   * walk the same set at close time without re-querying. Surfaced to the
   * UI to power the "Memories that influenced this episode" card on the
   * episode sheet (both Needs You and Handled modes).
   */
  retrievedMemoryIds: z.array(z.string().uuid()).default([]),
});
export type DeskEpisodeDetail = z.infer<typeof DeskEpisodeDetailSchema>;

// ─── List query params ──────────────────────────────────────────────────

export const ListDeskEpisodesQuerySchema = z.object({
  status: EpisodeStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
  scope: z.enum(['mine', 'all']).optional(),
});
export type ListDeskEpisodesQuery = z.infer<typeof ListDeskEpisodesQuerySchema>;

export const ListDeskEpisodesResponseSchema = z.object({
  rows: z.array(DeskEpisodeListItemSchema),
  nextCursor: z.string().nullable(),
});
export type ListDeskEpisodesResponse = z.infer<typeof ListDeskEpisodesResponseSchema>;

// ─── Slim list-row contract (row = episode) ─────────────────────────────
//
// Shared shape for every row in the Handoffs list (both pending-approval
// and escalated episodes). Kept deliberately slim — enrichment happens on
// the detail endpoint, not the list path. See design spec §2 (list/detail
// split): target payload ≈ 300 bytes per row vs ~2KB previously.

export const EpisodeListItemSchema = z.object({
  /** Approval id for waiting-approval rows; episode id for escalation rows. */
  id: z.string().uuid(),
  /** Always the parent episode id — used for detail prefetch + sheet routing. */
  episodeId: z.string().uuid(),

  decisionTitle: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  entitySubtitle: z.string().nullable(),

  agentKey: AgentKeySchema,
  agentName: z.string(),
  responsibilityKey: ResponsibilityKeySchema,
  responsibilityTitle: z.string(),

  priority: PrioritySchema,
  status: EpisodeStatusSchema,

  openedAt: z.string(),

  requestedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  escalationReason: z.string().nullable(),
});
export type EpisodeListItem = z.infer<typeof EpisodeListItemSchema>;

// ─── Handled list row (extends EpisodeListItem) ─────────────────────────
//
// Row shape for the Handled tab. Terminal-state episodes (resolved,
// rejected_by_operator, expired, escalated — terminal for this window)
// with outcome metadata, duration, and the most-recent human decision.
// `activeSuppression` lets the row render a "Snoozed" pill + unsnooze
// affordance when a suppression is live. See design spec §2.

export const HandledListItemSchema = EpisodeListItemSchema.extend({
  /** ISO timestamp — always present for terminal episodes. */
  closedAt: z.string(),
  /** Domain outcome string (e.g. followup_sent | promise_recorded | approval_expired). */
  outcome: z.string(),
  /** openedAt → closedAt in ms. */
  durationMs: z.number().int(),
  /** Most-recent decided approval's decision; null if episode was autonomous. */
  humanDecision: ApprovalDecisionSchema.nullable(),
  decidedByUserId: z.number().int().nullable(),
  decidedByName: z.string().nullable(),

  /** Populated when a live suppression targets this episode's entity. */
  activeSuppression: z
    .object({
      id: z.string().uuid(),
      suppressUntil: z.string().nullable(), // null = forever
    })
    .nullable(),
});
export type HandledListItem = z.infer<typeof HandledListItemSchema>;

// ─── Handled window presets ─────────────────────────────────────────────
// Backend maps these + optional { from, to } to a concrete { from, to }
// via Luxon using the tenant's timezone. Midnight boundaries are
// tenant-local, never UTC.

export const HandledWindowSchema = z.enum(['today', '7d', '30d', 'this_month', 'custom']);
export type HandledWindow = z.infer<typeof HandledWindowSchema>;

export const ListHandledEpisodesQuerySchema = z.object({
  scope: z.enum(['mine', 'all']).optional(),
  window: HandledWindowSchema.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  agent: z.string().optional(),
  outcome: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type ListHandledEpisodesQuery = z.infer<typeof ListHandledEpisodesQuerySchema>;

export const ListHandledEpisodesResponseSchema = z.object({
  rows: z.array(HandledListItemSchema),
  nextCursor: z.string().nullable(),
  summary: z.object({
    total: z.number().int(),
    byOutcome: z.record(z.string(), z.number().int()),
    autonomousPct: z.number().min(0).max(1),
  }),
});
export type ListHandledEpisodesResponse = z.infer<typeof ListHandledEpisodesResponseSchema>;

// ─── Resolve escalated episode (request body) ───────────────────────────
// An operator clears an escalated episode off the Needs-you tab: ESCALATED →
// RESOLVED. The optional note is appended to the episode's outcomeNote so the
// Handled-tab history records why the human signed off. Optional by design —
// lower friction; the human dealing with it is the signal that matters.
export const ResolveEpisodeRequestSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ResolveEpisodeRequest = z.infer<typeof ResolveEpisodeRequestSchema>;
