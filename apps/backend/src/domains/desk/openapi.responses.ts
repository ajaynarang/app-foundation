import { z } from 'zod';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

import {
  AgentActivityStatsSchema,
  AgentDetailSchema,
  AgentRosterItemSchema,
  ApprovalRecordSchema,
  ConditionsUISpecSchema,
  DeskEntitySuppressionSchema,
  DeskEpisodeDetailSchema,
  DeskResponsibilityDetailSchema,
  DeskResponsibilityListItemSchema,
  DeskScheduleStateSchema,
  EligibleSupervisorSchema,
  EpisodeListItemSchema,
  EpisodeStatusSchema,
  HandoffCountsSchema,
  LifecycleSchema,
  ListDeskEpisodesResponseSchema,
  ListHandledEpisodesResponseSchema,
  ListMemoriesResponseSchema,
  TrustLevelSchema,
} from './core/types';

/**
 * Desk response schemas for the published contract. The shapes are the desk domain's own wire contracts
 * (`core/types`), named here once so every controller points at the same component.
 */

// ─── Agents (Crew tab) ─────────────────────────────────────────────────────────

export const DeskAgentRosterItemResponse = defineResponseSchema('DeskAgentRosterItem', AgentRosterItemSchema);
export const DeskEligibleSupervisorListResponse = defineCursorListSchema(
  'DeskEligibleSupervisorList',
  EligibleSupervisorSchema,
);
export const DeskAgentDetailResponse = defineResponseSchema('DeskAgentDetail', AgentDetailSchema);
export const DeskAgentActivityStatsResponse = defineResponseSchema('DeskAgentActivityStats', AgentActivityStatsSchema);

const DeskAgentUpdateResultSchema = z.object({
  /** Responsibilities whose `enabled` flag the bulk toggle changed. */
  updatedResponsibilityCount: z.number().int().min(0),
  supervisorUpdated: z.boolean(),
});
export const DeskAgentUpdateResultResponse = defineResponseSchema('DeskAgentUpdateResult', DeskAgentUpdateResultSchema);

// ─── Approvals (Needs-you queue) ───────────────────────────────────────────────

/** The slim pending-approval row (row = episode) — no artifact or enrichment; those live on the episode detail. */
export const DeskApprovalListResponse = defineCursorListSchema('DeskApprovalList', EpisodeListItemSchema);
export const DeskHandoffCountsResponse = defineResponseSchema('DeskHandoffCounts', HandoffCountsSchema);
/** The approval row after a claim or decision (the enrichment fields are absent here). */
export const DeskApprovalResponse = defineResponseSchema('DeskApproval', ApprovalRecordSchema);

// ─── Episodes ──────────────────────────────────────────────────────────────────

export const DeskEpisodeListResponse = defineResponseSchema('DeskEpisodeList', ListDeskEpisodesResponseSchema);
export const DeskHandledEpisodeListResponse = defineResponseSchema(
  'DeskHandledEpisodeList',
  ListHandledEpisodesResponseSchema,
);
export const DeskEpisodeDetailResponse = defineResponseSchema('DeskEpisodeDetail', DeskEpisodeDetailSchema);

const DeskEpisodeResolveResultSchema = z.object({
  id: z.string().uuid(),
  status: EpisodeStatusSchema,
});
export const DeskEpisodeResolveResultResponse = defineResponseSchema(
  'DeskEpisodeResolveResult',
  DeskEpisodeResolveResultSchema,
);

// ─── Memory ────────────────────────────────────────────────────────────────────

export const DeskMemoryListResponse = defineResponseSchema('DeskMemoryList', ListMemoriesResponseSchema);
/** The id of the memory written or edited. */
export const DeskMemoryRefResponse = defineResponseSchema('DeskMemoryRef', z.object({ id: z.string().uuid() }));
export const DeskMemoryPinnedResponse = defineResponseSchema(
  'DeskMemoryPinned',
  z.object({ id: z.string().uuid(), isPinned: z.boolean() }),
);

// ─── Responsibilities ──────────────────────────────────────────────────────────

export const DeskResponsibilityListItemResponse = defineResponseSchema(
  'DeskResponsibilityListItem',
  DeskResponsibilityListItemSchema,
);
export const DeskResponsibilityDetailResponse = defineResponseSchema(
  'DeskResponsibilityDetail',
  DeskResponsibilityDetailSchema,
);

/** The code-authored slice of `ResponsibilityDefinition` the settings form renders from. */
const DeskResponsibilityUiSpecSchema = z.object({
  key: z.string(),
  title: z.string(),
  description: z.string(),
  lifecycle: LifecycleSchema,
  /** null for COMING_SOON stubs. */
  conditionsUI: ConditionsUISpecSchema.nullable(),
  defaults: z.object({ trustLevel: TrustLevelSchema, conditions: z.record(z.string(), z.unknown()) }),
  triggers: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('scheduled'), cron: z.string(), tz: z.string().optional() }),
      z.object({ kind: z.literal('manual') }),
      z.object({
        kind: z.literal('domain-event'),
        event: z.string(),
        condition: z.record(z.string(), z.unknown()).optional(),
      }),
      z.object({ kind: z.literal('webhook'), source: z.string() }),
    ]),
  ),
  /** MCP tool names the responsibility's workflow may call. */
  tools: z.array(z.string()),
});
export const DeskResponsibilityUiSpecResponse = defineResponseSchema(
  'DeskResponsibilityUiSpec',
  DeskResponsibilityUiSpecSchema,
);

/** `TriggerService.runByKey`'s `RunResult`. */
const DeskResponsibilityRunResultSchema = z.object({
  episodesOpened: z.number().int().min(0),
  episodesReused: z.number().int().min(0).optional(),
  skipped: z
    .enum(['responsibility_not_seeded', 'not_available', 'disabled', 'no_supervisor', 'stale_audit'])
    .optional(),
});
export const DeskResponsibilityRunResultResponse = defineResponseSchema(
  'DeskResponsibilityRunResult',
  DeskResponsibilityRunResultSchema,
);

// ─── Schedule + suppressions ───────────────────────────────────────────────────

export const DeskScheduleStateResponse = defineResponseSchema('DeskScheduleState', DeskScheduleStateSchema);
export const DeskEntitySuppressionResponse = defineResponseSchema('DeskEntitySuppression', DeskEntitySuppressionSchema);
