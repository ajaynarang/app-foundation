/**
 * Sally's Desk — UI types.
 *
 * All domain types come from `@sally/shared-types` (single source of
 * truth). This file adds only frontend-only shapes (UI state, view
 * models) that aren't part of the wire contract.
 */

export type {
  // Enums
  AgentKey,
  ApprovalDecision,
  ApprovalScope,
  EpisodeStatus,
  Lifecycle,
  MemoryPolarity,
  MemoryScope,
  Priority,
  ResponsibilityKey,
  StepKind,
  StepStatus,
  TriggerKind,
  TrustLevel,
  // Agent
  AgentActivityStats,
  AgentActivityWindow,
  AgentDetail,
  AgentRosterItem,
  AgentSupervisor,
  EligibleSupervisor,
  ResponsibilityHeld,
  UpdateAgentRequest,
  // Responsibility
  DeskResponsibilityListItem,
  DeskResponsibilityDetail,
  UpdateDeskResponsibilityRequest,
  UpdateResponsibilityAutonomyRequest,
  ConditionsUISpec,
  ConditionFieldSpec,
  // Schedule (tenant master switch)
  DeskScheduleState,
  UpdateDeskScheduleRequest,
  // Episode
  DeskEpisodeListItem,
  DeskEpisodeDetail,
  EpisodeListItem,
  HandledListItem,
  HandledWindow,
  ListDeskEpisodesQuery,
  ListDeskEpisodesResponse,
  ListHandledEpisodesQuery,
  ListHandledEpisodesResponse,
  ResolveEpisodeRequest,
  // Step
  StepRecord,
  GateDecisionRecord,
  // Approval
  ApprovalRecord,
  ApprovalArtifact,
  ApprovalArtifactBlock,
  ApprovalDecisionHeader,
  DecideApprovalRequest,
  HandoffCounts,
  // Memory
  MemoryRecord,
  ListMemoriesQuery,
  UpdateMemoryRequest,
  SetMemoryPinnedRequest,
  AddPlaybookRuleRequest,
  // Suppression
  DeskEntitySuppression,
  SnoozeDuration,
  SnoozeEpisodeRequest,
} from '@sally/shared-types';

/** Domain sentinel used by handoffs-page's `useEpisodes({ status: ESCALATED_STATUS })`. */
export const ESCALATED_STATUS = 'ESCALATED' as const;
