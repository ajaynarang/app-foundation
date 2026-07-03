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
 * DeskEpisode REST shapes.
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

  workflowId: z.string(),
  workflowRunId: z.string().nullable(),

  openedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type DeskEpisodeListItem = z.infer<typeof DeskEpisodeListItemSchema>;

export const DeskEpisodeDetailSchema = DeskEpisodeListItemSchema.extend({
  ownerAgentName: z.string().nullable(),
  responsibilityTitle: z.string(),

  conditionsSnapshot: z.record(z.unknown()),
  triggerSource: z.string().nullable(),
  triggerPayload: z.record(z.unknown()).nullable(),
  expiresAt: z.string().datetime().nullable(),
  steps: z.array(StepRecordSchema),
  approvals: z.array(ApprovalRecordSchema),

  mostRecentDecidedApproval: ApprovalRecordSchema.nullable(),

  activeSuppression: z
    .object({
      id: z.string().uuid(),
      suppressUntil: z.string().nullable(), // null = forever
    })
    .nullable(),

  retrievedMemoryIds: z.array(z.string().uuid()).default([]),
});
export type DeskEpisodeDetail = z.infer<typeof DeskEpisodeDetailSchema>;

// ─── List query params ──────────────────────────────────────────────────────

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

// ─── Slim list-row contract (row = episode) ─────────────────────────────────

export const EpisodeListItemSchema = z.object({
  id: z.string().uuid(),
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

// ─── Handled list row ────────────────────────────────────────────────────────

export const HandledListItemSchema = EpisodeListItemSchema.extend({
  closedAt: z.string(),
  outcome: z.string(),
  durationMs: z.number().int(),
  humanDecision: ApprovalDecisionSchema.nullable(),
  decidedByUserId: z.number().int().nullable(),
  decidedByName: z.string().nullable(),

  activeSuppression: z
    .object({
      id: z.string().uuid(),
      suppressUntil: z.string().nullable(), // null = forever
    })
    .nullable(),
});
export type HandledListItem = z.infer<typeof HandledListItemSchema>;

// ─── Handled window presets ──────────────────────────────────────────────────

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

// ─── Resolve escalated episode (request body) ────────────────────────────────

export const ResolveEpisodeRequestSchema = z.object({
  note: z.string().max(500).optional(),
});
export type ResolveEpisodeRequest = z.infer<typeof ResolveEpisodeRequestSchema>;
