/**
 * API Contracts for the Desk core domain (Phase 6 Group 6e).
 *
 * Hand-written Zod schemas pinned against the live response shapes on
 * `apps/backend/src/domains/desk/core/{approval,episode,memory}/*.ts`,
 * probed against `demo-northstar-2026` (backend :8011, 2026-04-27).
 *
 * Group 6e covers:
 *
 *   - DeskApprovalRowSchema           — bare DeskApproval row from claim/decide
 *   - DeskApprovalListItemSchema      — approval row + nested episode (queue view)
 *   - DeskApprovalListSchema          — z.array(DeskApprovalListItemSchema)
 *
 *   - DeskEpisodeStepSchema           — single step row in episode detail
 *   - DeskEpisodeRowSchema            — bare episode row (list-item shape)
 *   - DeskEpisodeListSchema           — { rows, nextCursor } cursor envelope
 *   - DeskEpisodeDetailSchema         — episode + nested steps[] + approvals[]
 *
 *   - DeskMemoryRowSchema             — single memory row from list
 *   - DeskMemoryListSchema            — { rows: [...] } envelope
 *   - DeskMemoryUpdateResponseSchema  — { id } only (controller line 79)
 *
 * Source-of-truth pointers:
 *   - apps/backend/src/domains/desk/core/approval/approval.controller.ts
 *   - apps/backend/src/domains/desk/core/approval/approval.service.ts
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.controller.ts
 *   - apps/backend/src/domains/desk/core/episode/desk-episode.service.ts
 *   - apps/backend/src/domains/desk/core/memory/memory.controller.ts
 *   - apps/backend/src/domains/desk/core/memory/desk-memory.service.ts
 *   - apps/backend/prisma/schema.prisma — DeskApproval, DeskEpisode, DeskEpisodeStep, DeskMemory
 *   - packages/shared-types/src/desk/{approval,episode,memory,step,enums}.ts
 *     (mirrors many of these schemas; we re-pin under .strict() with the
 *     test-utils convention so a server-side type drift trips contract).
 */
import { z } from 'zod';
import { isoDateString } from './helpers.js';

// ── ENUMS ─────────────────────────────────────────────────────────────

const ApprovalDecisionEnum = z.enum(['APPROVED', 'EDITED', 'REJECTED']);
const PriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);
const TrustLevelEnum = z.enum(['SUPERVISED', 'ASSISTED', 'AUTONOMOUS']);
const TriggerKindEnum = z.enum(['SCHEDULED', 'DOMAIN_EVENT', 'WEBHOOK', 'MANUAL']);
const EpisodeStatusEnum = z.enum([
  'running',
  'waiting_approval',
  'resolved',
  'escalated',
  'failed',
  'rejected_by_operator',
  'cancelled',
  'expired',
]);
const StepKindEnum = z.enum(['hydrate', 'perceive', 'decide', 'draft', 'gate', 'execute', 'close']);
const StepStatusEnum = z.enum(['running', 'succeeded', 'failed', 'gated', 'skipped']);
const ToolTierEnum = z.enum(['read', 'standard', 'sensitive']);

// ── DESK APPROVAL ─────────────────────────────────────────────────────

/**
 * Bare DeskApproval row — what `claim()` and `decide()` return
 * (approval.service.ts lines 83-86 and 128-138). Prisma serializes
 * timestamps as ISO strings, JSON columns as plain records, and the
 * Decimal-less integer columns as numbers.
 *
 * `decision` is null until the row is decided. `claimedByUserId` is
 * null until claimed. `terminateEpisode` always serialises as a bool
 * (default false).
 */
export const DeskApprovalRowSchema = z
  .object({
    id: z.string().uuid(),
    episodeId: z.string().uuid(),
    stepId: z.string().uuid(),
    requestedAt: isoDateString,
    expiresAt: isoDateString,
    proposedAction: z.record(z.unknown()),
    claimedByUserId: z.number().int().positive().nullable(),
    claimedAt: isoDateString.nullable(),
    decision: ApprovalDecisionEnum.nullable(),
    decidedByUserId: z.number().int().positive().nullable(),
    decidedAt: isoDateString.nullable(),
    editedAction: z.record(z.unknown()).nullable(),
    rejectionReason: z.string().nullable(),
    terminateEpisode: z.boolean(),
  })
  .strict();
export type DeskApprovalRow = z.infer<typeof DeskApprovalRowSchema>;

/**
 * Queue view item — `listPending()` includes the parent episode + its
 * responsibility (approval.service.ts lines 196-217). Schema extends the
 * raw row with the nested `episode` object and re-strict()s.
 */
export const DeskApprovalListItemSchema = DeskApprovalRowSchema.extend({
  episode: z
    .object({
      id: z.string().uuid(),
      entityType: z.string().nullable(),
      entityId: z.string().nullable(),
      entityLabel: z.string().nullable(),
      priority: PriorityEnum,
      responsibility: z
        .object({
          key: z.string(),
          title: z.string(),
        })
        .strict(),
    })
    .strict(),
}).strict();
export type DeskApprovalListItem = z.infer<typeof DeskApprovalListItemSchema>;

/**
 * `GET /desk/approvals` returns a bare array (NOT envelope-wrapped).
 * Pagination is via `?limit=` only — the `take: limit` slice is the
 * only pagination signal returned. May be empty on tenants with no
 * pending approvals.
 */
export const DeskApprovalListSchema = z.array(DeskApprovalListItemSchema);
export type DeskApprovalList = z.infer<typeof DeskApprovalListSchema>;

// ── DESK EPISODE STEP ─────────────────────────────────────────────────

/**
 * Step row inside `DeskEpisodeDetailSchema.steps[]`. Mirrors
 * `StepRecordSchema` from packages/shared-types/src/desk/step.ts but
 * pinned under `.strict()` here.
 *
 * `costUsd` is a Decimal serialised to string (toListItem mapper line 171).
 * Most metadata fields are nullable for steps that didn't hit an LLM /
 * tool / gate.
 */
export const DeskEpisodeStepSchema = z
  .object({
    id: z.string().uuid(),
    episodeId: z.string().uuid(),
    agentId: z.number().int().positive().nullable(),
    sequence: z.number().int().nonnegative(),
    kind: StepKindEnum,
    status: StepStatusEnum,
    model: z.string().nullable(),
    promptKey: z.string().nullable(),
    tokensInput: z.number().int().nonnegative().nullable(),
    tokensOutput: z.number().int().nonnegative().nullable(),
    costUsd: z.string().nullable(),
    toolName: z.string().nullable(),
    toolScope: z.string().nullable(),
    toolTier: ToolTierEnum.nullable(),
    toolArgs: z.record(z.unknown()).nullable(),
    toolResult: z.record(z.unknown()).nullable(),
    gateDecision: z.record(z.unknown()).nullable(),
    output: z.record(z.unknown()).nullable(),
    confidence: z.number().nullable(),
    errorMessage: z.string().nullable(),
    durationMs: z.number().int().nonnegative().nullable(),
    startedAt: isoDateString,
    finishedAt: isoDateString.nullable(),
  })
  .strict();
export type DeskEpisodeStep = z.infer<typeof DeskEpisodeStepSchema>;

// ── DESK EPISODE ──────────────────────────────────────────────────────

/**
 * Episode list item — `desk-episode.service.ts::toListItem` (lines 109-133).
 * Drops the conditionsSnapshot / triggerSource / triggerPayload /
 * expiresAt fields that the detail view adds.
 */
export const DeskEpisodeRowSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.number().int().positive(),
    responsibilityKey: z.string(),
    ownerAgentKey: z.string(),
    trustLevelSnapshot: TrustLevelEnum,
    triggerKind: TriggerKindEnum,
    triggerLabel: z.string(),
    triggerFiredAt: isoDateString,
    entityType: z.string().nullable(),
    entityId: z.string().nullable(),
    entityLabel: z.string().nullable(),
    status: EpisodeStatusEnum,
    priority: PriorityEnum,
    dedupeKey: z.string(),
    outcome: z.string().nullable(),
    outcomeNote: z.string().nullable(),
    temporalWorkflowId: z.string(),
    temporalRunId: z.string().nullable(),
    openedAt: isoDateString,
    updatedAt: isoDateString,
    closedAt: isoDateString.nullable(),
  })
  .strict();
export type DeskEpisodeRow = z.infer<typeof DeskEpisodeRowSchema>;

/**
 * `GET /desk/episodes` — `{ rows, nextCursor }` cursor envelope
 * (service line 53-56). nextCursor is null on the final page.
 */
export const DeskEpisodeListSchema = z
  .object({
    rows: z.array(DeskEpisodeRowSchema),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type DeskEpisodeList = z.infer<typeof DeskEpisodeListSchema>;

/**
 * `GET /desk/episodes/:id` — detail view extends list-item with the
 * nested steps[] + approvals[] arrays + a few episode-specific fields
 * (conditionsSnapshot, triggerSource, triggerPayload, expiresAt).
 *
 * approvals[] uses `DeskApprovalRowSchema` (the bare-row shape WITHOUT
 * the nested `episode` — see `toApprovalRecord` mapper lines 187-219).
 */
export const DeskEpisodeDetailSchema = DeskEpisodeRowSchema.extend({
  conditionsSnapshot: z.record(z.unknown()),
  triggerSource: z.string().nullable(),
  triggerPayload: z.record(z.unknown()).nullable(),
  expiresAt: isoDateString.nullable(),
  steps: z.array(DeskEpisodeStepSchema),
  approvals: z.array(DeskApprovalRowSchema),
}).strict();
export type DeskEpisodeDetail = z.infer<typeof DeskEpisodeDetailSchema>;

// ── DESK MEMORY ───────────────────────────────────────────────────────

/**
 * Memory row from `listForUI` (desk-memory.service.ts lines 192-203).
 * Service explicitly projects `id, agentKey, kind, content,
 * sourceEpisodeId, entityRef, isActive, createdAt, updatedAt, expiresAt`
 * — that 10-key set is what we pin under `.strict()`.
 *
 * NOTE — Finding #53 (Phase 6 Group 6e): the live demo DB carries
 * additional columns (`scope`, `polarity`, `is_pinned`,
 * `entity_predicate`, `authored_by_user_id`) introduced by
 * 20260427120000_desk_memory_scope_polarity_playbook... but the Prisma
 * model in `apps/backend/prisma/schema.prisma` still declares the
 * older `kind` column shape. The service's projection runs through
 * Prisma's typed `select` which MUST match the model — so today every
 * `findMany` against `desk_memories` returns Prisma error P2022 (500
 * envelope at the API layer). Tests 38/39/40 carry the
 * `@requires:data-desk-memory` data tag AND surface this finding as
 * the precondition for any fix.
 */
export const DeskMemoryRowSchema = z
  .object({
    id: z.string().uuid(),
    agentKey: z.string(),
    kind: z.string(),
    content: z.string(),
    sourceEpisodeId: z.string().uuid().nullable(),
    entityRef: z.record(z.unknown()).nullable(),
    isActive: z.boolean(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    expiresAt: isoDateString.nullable(),
  })
  .strict();
export type DeskMemoryRow = z.infer<typeof DeskMemoryRowSchema>;

/**
 * `GET /desk/memories` — controller wraps the projection in `{rows}`
 * (memory.controller.ts line 65). Distinct from the bare-array response
 * of `GET /desk/approvals`.
 */
export const DeskMemoryListSchema = z
  .object({
    rows: z.array(DeskMemoryRowSchema),
  })
  .strict();
export type DeskMemoryList = z.infer<typeof DeskMemoryListSchema>;

/**
 * `PATCH /desk/memories/:id` returns `{ id }` ONLY — see
 * `memory.controller.ts` line 79. The plan's `DeskMemoryRowSchema`
 * pin was a sketch; the live shape is a thin echo. Persistence of the
 * patched fields is verified by a follow-up `GET /desk/memories`.
 */
export const DeskMemoryUpdateResponseSchema = z
  .object({
    id: z.string().uuid(),
  })
  .strict();
export type DeskMemoryUpdateResponse = z.infer<typeof DeskMemoryUpdateResponseSchema>;

// ── DESK RESPONSIBILITY (Group 6f) ────────────────────────────────────

/**
 * List-item row shape — one entry per registry definition (10 today).
 * Service `listForTenant` (responsibility.service.ts lines 86-100)
 * projects exactly these 11 keys. Tenants always see all 10 (one per
 * RESPONSIBILITY_REGISTRY entry); rollup counts are zero when the
 * per-tenant DB row is missing.
 */
export const DeskResponsibilityRowSchema = z
  .object({
    key: z.string(),
    agentKey: z.string(),
    title: z.string(),
    description: z.string(),
    lifecycle: z.enum(['AVAILABLE', 'COMING_SOON']),
    enabled: z.boolean(),
    trustLevel: TrustLevelEnum,
    openEpisodeCount: z.number().int().nonnegative(),
    pendingApprovalCount: z.number().int().nonnegative(),
    lastRunAt: isoDateString.nullable(),
  })
  .strict();
export type DeskResponsibilityRow = z.infer<typeof DeskResponsibilityRowSchema>;

/**
 * `GET /desk/responsibilities` — bare array (NOT envelope-wrapped).
 * Verified live (2026-04-27) on demo-northstar: 10 rows, registry order
 * (ar_followup first, then 9 COMING_SOON stubs).
 */
export const DeskResponsibilityListSchema = z.array(DeskResponsibilityRowSchema);
export type DeskResponsibilityList = z.infer<typeof DeskResponsibilityListSchema>;

// description was missing in service projection on initial pass;
// declare as nullable for the row, optional in detail.
// The list service projects `description: def.description` (always a string
// from the registry). Detail goes through getForTenant — same source.

/**
 * `GET /desk/responsibilities/:key` — detail extends the list-item with
 * 3 per-tenant fields (conditions, notesForAssistant, supervisorUserId).
 * Service `getForTenant` (responsibility.service.ts lines 139-153) projects
 * the union.
 *
 * IMPORTANT — Finding #54 (Phase 6 Group 6f): on demo-northstar today this
 * endpoint returns 500 (Prisma error P2022). The Prisma model in
 * `apps/backend/prisma/schema.prisma::DeskResponsibility` (line ~6800) still
 * declares `notesForAssistant` and `supervisorUserId` columns, but the live
 * `desk_responsibilities` table dropped them. Tests gated on
 * `@requires:data-desk-responsibility` exclude until the schema realigns
 * (same realignment that resolves Finding #53 for desk_memories).
 */
export const DeskResponsibilityDetailSchema = DeskResponsibilityRowSchema.extend({
  conditions: z.record(z.unknown()),
  notesForAssistant: z.string().nullable(),
  supervisorUserId: z.number().int().positive().nullable(),
}).strict();
export type DeskResponsibilityDetail = z.infer<typeof DeskResponsibilityDetailSchema>;

/**
 * `GET /desk/responsibilities/:key/ui-spec` — code-authored UI spec for
 * the settings form. Same for every tenant (no tenant-scoped state —
 * controller line 54-67 reads straight from the registry).
 *
 * `conditionsUI` is a `{fields: ConditionFieldSpec[]}` object OR null for
 * COMING_SOON stubs (their `conditionsUI` is null in definition.types.ts).
 * `defaults.conditions` is the seed-time JSON for the per-tenant row.
 */
const ConditionFieldSpecSchema = z.discriminatedUnion('control', [
  z
    .object({
      key: z.string(),
      label: z.string(),
      control: z.literal('currency'),
      placeholder: z.string().optional(),
      helpText: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict(),
  z
    .object({
      key: z.string(),
      label: z.string(),
      control: z.literal('checkbox'),
      helpText: z.string().optional(),
      default: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      key: z.string(),
      label: z.string(),
      control: z.literal('customer-multiselect'),
      helpText: z.string().optional(),
    })
    .strict(),
  z
    .object({
      key: z.string(),
      label: z.string(),
      control: z.literal('number'),
      helpText: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .strict(),
]);

const TriggerSpecSchema = z.union([
  z.object({ kind: z.literal('scheduled'), cron: z.string(), tz: z.string().optional() }).strict(),
  z.object({ kind: z.literal('manual') }).strict(),
  z
    .object({
      kind: z.literal('domain-event'),
      event: z.string(),
      condition: z.record(z.unknown()).optional(),
    })
    .strict(),
  z.object({ kind: z.literal('webhook'), source: z.string() }).strict(),
]);

export const DeskResponsibilityUiSpecSchema = z
  .object({
    key: z.string(),
    title: z.string(),
    description: z.string(),
    lifecycle: z.enum(['AVAILABLE', 'COMING_SOON']),
    conditionsUI: z
      .object({ fields: z.array(ConditionFieldSpecSchema) })
      .strict()
      .nullable(),
    defaults: z
      .object({
        trustLevel: TrustLevelEnum,
        conditions: z.record(z.unknown()),
      })
      .strict(),
    triggers: z.array(TriggerSpecSchema),
    tools: z.array(z.string()),
  })
  .strict();
export type DeskResponsibilityUiSpec = z.infer<typeof DeskResponsibilityUiSpecSchema>;

/**
 * `POST /desk/responsibilities/:key/run` — 202 ACCEPTED. The service
 * (`TriggerService::runArFollowupForTenant`, trigger.service.ts:49-137)
 * returns one of three shapes:
 *   - `{ episodesOpened: number, episodesReused?: number }` — happy path
 *   - `{ episodesOpened: 0, skipped: 'responsibility_not_seeded' | 'not_available' | 'disabled' }` — short-circuit
 *
 * `episodeId` / `runId` keys mentioned in the plan are NOT returned —
 * Inngest dispatches asynchronously, so the response only confirms how
 * many episodes were opened/reused on this synchronous fan-out.
 */
export const DeskResponsibilityRunResponseSchema = z
  .object({
    episodesOpened: z.number().int().nonnegative(),
    episodesReused: z.number().int().nonnegative().optional(),
    skipped: z.enum(['responsibility_not_seeded', 'not_available', 'disabled']).optional(),
  })
  .strict();
export type DeskResponsibilityRunResponse = z.infer<typeof DeskResponsibilityRunResponseSchema>;

// ── DESK AGENT (Group 6f) ─────────────────────────────────────────────

/**
 * Agent roster row — `DeskAgentService::listForTenant`
 * (agent.service.ts lines 111-121). Projects exactly these 8 keys.
 *
 * Live response on demo-northstar (2026-04-27) returned 6 rows (NOT 12 as
 * the plan suggests) — the service filters via
 * `orderedKeys.filter((k) => agentsByKey.has(k))` so only agents that own
 * a registered responsibility appear. Today the registry references 6
 * unique agents (assistant-billing, assistant-route, assistant-dispatch, assistant-compliance,
 * assistant-maintenance, assistant-payroll). The remaining 6 of the 12 AGENT_KEYS
 * aren't surfaced until they own a responsibility.
 */
export const DeskAgentRowSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    isActive: z.boolean(),
    availableResponsibilityCount: z.number().int().nonnegative(),
    comingSoonResponsibilityCount: z.number().int().nonnegative(),
    openEpisodeCount: z.number().int().nonnegative(),
    pendingApprovalCount: z.number().int().nonnegative(),
    lastRunAt: isoDateString.nullable(),
  })
  .strict();
export type DeskAgentRow = z.infer<typeof DeskAgentRowSchema>;

/** `GET /desk/agents` — bare array (verified live). */
export const DeskAgentListSchema = z.array(DeskAgentRowSchema);
export type DeskAgentList = z.infer<typeof DeskAgentListSchema>;

/**
 * `PATCH /desk/agents/:key` — service `bulkSetEnabled` returns
 * `{ updatedCount }` (agent.service.ts line 144) — count of AVAILABLE
 * responsibilities flipped. COMING_SOON rows are NEVER touched.
 *
 * Plan said `affectedResponsibilityCount`; live shape is `updatedCount`.
 */
export const DeskAgentBulkToggleResponseSchema = z
  .object({
    updatedCount: z.number().int().nonnegative(),
  })
  .strict();
export type DeskAgentBulkToggleResponse = z.infer<typeof DeskAgentBulkToggleResponseSchema>;

// ── INNGEST SERVE (Group 6f) ──────────────────────────────────────────

/**
 * `GET /api/v1/api/inngest` — Inngest's `serve()` introspection response.
 * Inngest catches unsigned GETs and returns a JSON registry of registered
 * functions + framework metadata (used by Inngest Cloud for discovery).
 *
 * IMPORTANT — Finding #55 (Phase 6 Group 6f): on demo-northstar today this
 * endpoint returns HTTP 500 with body `{"code":"internal_server_error"}`
 * because `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` env vars are unset
 * on dev. The serve handler refuses to introspect without a signing key.
 * Test 48 carries `@requires:data-inngest-configured` to collection-exclude
 * cleanly until those env vars are set.
 *
 * Once configured, the response is `{schema_version, function_count,
 * has_event_key, has_signing_key, has_signing_key_fallback, mode, ...}`
 * (per inngest-js v4 source). Schema is permissive — Inngest may add new
 * keys on minor versions. We pin only the discriminator that proves we
 * reached the serve handler (`schema_version`) plus the registered
 * `function_count` matching the assistant's one registered function (ar-followup).
 */
export const InngestServeResponseSchema = z
  .object({
    message: z.string().optional(),
    schema_version: z.string(),
    function_count: z.number().int().nonnegative(),
    has_event_key: z.boolean().optional(),
    has_signing_key: z.boolean().optional(),
    has_signing_key_fallback: z.boolean().optional(),
    mode: z.string().optional(),
    framework: z.string().optional(),
    app_id: z.string().optional(),
    sdk_language: z.string().optional(),
    sdk_version: z.string().optional(),
    extra: z.record(z.unknown()).optional(),
    capabilities: z.record(z.unknown()).optional(),
    env: z.string().nullable().optional(),
    authentication_succeeded: z.boolean().nullable().optional(),
    serve_origin: z.string().nullable().optional(),
    serve_path: z.string().nullable().optional(),
  })
  .strict();
export type InngestServeResponse = z.infer<typeof InngestServeResponseSchema>;
