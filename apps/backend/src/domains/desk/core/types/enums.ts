import { z } from 'zod';
import {
  ApprovalDecision,
  ApprovalDecisionSchema,
  DeskEpisodeStatus,
  DeskEpisodeStatusSchema,
  DeskEpisodeStepKind,
  DeskEpisodeStepKindSchema,
  DeskEpisodeStepStatus,
  DeskEpisodeStepStatusSchema,
  Lifecycle,
  LifecycleSchema,
  MemoryPolarity,
  MemoryPolaritySchema,
  MemoryScope,
  MemoryScopeSchema,
  Priority,
  PrioritySchema,
  TriggerKind,
  TriggerKindSchema,
  TrustLevel,
  TrustLevelSchema,
} from '@app/shared-types';

// ---------------------------------------------------------------------------
// Desk engine contracts (local to the desk domain).
//
// These types used to live in `@app/shared-types/desk` but were moved here as
// part of making shared-types domain-free. The Prisma-mirrored enums are still
// imported from `@app/shared-types` (single source of truth); everything else
// is defined locally. Author your responsibility/agent vocabulary here.
// ---------------------------------------------------------------------------

// Desk Prisma-mirrored enums re-exported from the shared codegen mirror.
export {
  ApprovalDecision,
  ApprovalDecisionSchema,
  Lifecycle,
  LifecycleSchema,
  MemoryPolarity,
  MemoryPolaritySchema,
  MemoryScope,
  MemoryScopeSchema,
  Priority,
  PrioritySchema,
  TriggerKind,
  TriggerKindSchema,
  TrustLevel,
  TrustLevelSchema,
};

// ─── Agents ───────────────────────────────────────────────────────────────
// The starter ships ONE generic agent. Agent keys are stringly-typed so you
// can seed your own roster without changing this contract.

export const AGENT_KEYS = ['assistant'] as const;
export const AgentKeySchema = z.string();
export type AgentKey = z.infer<typeof AgentKeySchema>;

// ─── Responsibilities ───────────────────────────────────────────────────────
// Responsibility keys are stringly-typed — the registry (see
// `responsibilities/index.ts`) is the source of truth. Empty in the starter.

export const RESPONSIBILITY_KEYS: readonly string[] = [];
export const ResponsibilityKeySchema = z.string();
export type ResponsibilityKey = z.infer<typeof ResponsibilityKeySchema>;

// ─── Trust labels ─────────────────────────────────────────────────────────

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  SUPERVISED: 'Supervised',
  ASSISTED: 'Assisted',
  AUTONOMOUS: 'Autonomous',
};

export const TRUST_LEVEL_DESCRIPTIONS: Record<TrustLevel, string> = {
  SUPERVISED: 'The agent proposes every action. Nothing acts until you approve.',
  ASSISTED: 'The agent acts automatically when confident and your hard rules are met. Otherwise it asks.',
  AUTONOMOUS: 'The agent runs the job. It only surfaces exceptions and errors.',
};

/** Confidence thresholds for auto-proceed (matches gate algorithm). null = always gate. */
export const TRUST_LEVEL_CONFIDENCE_THRESHOLDS: Record<TrustLevel, number | null> = {
  SUPERVISED: null,
  ASSISTED: 0.9,
  AUTONOMOUS: 0.75,
};

// ─── Step kind / Step status / Episode status ───────────────────────────────
// Public names (`StepKind`, `StepStatus`, `EpisodeStatus`) alias the generated
// DeskEpisode* enums imported at the top of this file.

export const StepKindSchema = DeskEpisodeStepKindSchema;
export type StepKind = DeskEpisodeStepKind;
export type { DeskEpisodeStepKind, DeskEpisodeStepStatus, DeskEpisodeStatus };
export const STEP_KINDS = StepKindSchema.options;

export const StepStatusSchema = DeskEpisodeStepStatusSchema;
export type StepStatus = DeskEpisodeStepStatus;
export const STEP_STATUSES = StepStatusSchema.options;

export const EpisodeStatusSchema = DeskEpisodeStatusSchema;
export type EpisodeStatus = DeskEpisodeStatus;
export const EPISODE_STATUSES = EpisodeStatusSchema.options;

/** Episode statuses that hold the partial-unique dedupe slot. */
export const OPEN_EPISODE_STATUSES: readonly EpisodeStatus[] = ['RUNNING', 'WAITING_APPROVAL'];

/** Terminal (closed) statuses. */
export const TERMINAL_EPISODE_STATUSES: readonly EpisodeStatus[] = [
  'RESOLVED',
  'ESCALATED',
  'FAILED',
  'REJECTED_BY_OPERATOR',
  'CANCELLED',
  'EXPIRED',
];

// ─── View sets (tab membership) ─────────────────────────────────────────────
// OPEN_/TERMINAL_ describe the DB LIFECYCLE; the two sets below describe which
// DESK TAB an episode surfaces on. ESCALATED is DB-terminal yet unfinished
// business, so it lives on Needs-you, never on Handled.

/** Statuses shown on the Handled tab — episodes that are DONE and need no further action. */
export const HANDLED_EPISODE_STATUSES: readonly EpisodeStatus[] = [
  'RESOLVED',
  'REJECTED_BY_OPERATOR',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
];

/** Statuses that surface on the Needs-you tab — awaiting human attention. */
export const NEEDS_YOU_EPISODE_STATUSES: readonly EpisodeStatus[] = ['RUNNING', 'WAITING_APPROVAL', 'ESCALATED'];
