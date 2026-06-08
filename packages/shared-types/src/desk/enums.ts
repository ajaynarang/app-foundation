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
  Priority,
  PrioritySchema,
  TriggerKind,
  TriggerKindSchema,
  TrustLevel,
  TrustLevelSchema,
} from '../generated/prisma-enums';

// Desk Prisma-mirrored enums re-exported from the codegen mirror.
export {
  ApprovalDecision,
  ApprovalDecisionSchema,
  Lifecycle,
  LifecycleSchema,
  Priority,
  PrioritySchema,
  TriggerKind,
  TriggerKindSchema,
  TrustLevel,
  TrustLevelSchema,
};

// ─── Agents (12 AI personas) ────────────────────────────────────────────
// Mirrors apps/backend seed data. Keep in sync.

export const AGENT_KEYS = [
  'sally-dispatch',
  'sally-billing',
  'sally-payroll',
  'sally-compliance',
  'sally-safety',
  'sally-maintenance',
  'sally-fuel',
  'sally-route',
  'sally-driver',
  'sally-customer',
  'sally-support',
  'sally-prospect',
] as const;
export const AgentKeySchema = z.enum(AGENT_KEYS);
export type AgentKey = z.infer<typeof AgentKeySchema>;

// ─── Responsibilities (10 — only ar_followup AVAILABLE in v1) ───────────

export const RESPONSIBILITY_KEYS = [
  'ar_followup',
  'eta_monitoring',
  'driver_assignment',
  'document_expiry',
  'preventive_maintenance',
  'vehicle_inspection',
  'closeout_review',
  'settlement_review',
  'deadhead_optimization',
  'hos_monitoring',
] as const;
export const ResponsibilityKeySchema = z.enum(RESPONSIBILITY_KEYS);
export type ResponsibilityKey = z.infer<typeof ResponsibilityKeySchema>;

// ─── Trust labels (uses TrustLevel from codegen mirror, re-exported above) ─

export const TRUST_LEVEL_LABELS: Record<TrustLevel, string> = {
  SUPERVISED: 'Supervised',
  ASSISTED: 'Assisted',
  AUTONOMOUS: 'Autonomous',
};

export const TRUST_LEVEL_DESCRIPTIONS: Record<TrustLevel, string> = {
  SUPERVISED: 'Sally proposes every action. Nothing acts until you approve.',
  ASSISTED: 'Sally acts automatically when confident and your hard rules are met. Otherwise she asks.',
  AUTONOMOUS: 'Sally runs the job. She only surfaces exceptions and errors.',
};

/** Confidence thresholds for auto-proceed (matches gate algorithm). null = always gate. */
export const TRUST_LEVEL_CONFIDENCE_THRESHOLDS: Record<TrustLevel, number | null> = {
  SUPERVISED: null,
  ASSISTED: 0.9,
  AUTONOMOUS: 0.75,
};

// `Lifecycle`, `TriggerKind`, `Priority` are re-exported from the codegen
// mirror at the top of this file.

// ─── Step kind / Step status / Episode status ───────────────────────────
// Public names (`StepKind`, `StepStatus`, `EpisodeStatus`) preserved for
// call-site stability — they alias the generated DeskEpisode* enums imported
// at the top of this file.

export const StepKindSchema = DeskEpisodeStepKindSchema;
export type StepKind = DeskEpisodeStepKind;
// re-export so callers can write `import type { DeskEpisodeStepKind }` too
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

// ─── View sets (tab membership) ─────────────────────────────────────────
// The OPEN_/TERMINAL_ sets above describe the DB LIFECYCLE — they drive the
// partial-unique dedupe slot and the close path, and must not change. The two
// sets below describe which DESK TAB an episode surfaces on. The distinction
// matters for ESCALATED: it is DB-terminal (has a `closedAt`), yet it is
// unfinished business — a human still has to resolve it — so it belongs on
// Needs-you, never on Handled. Splitting view-classification from DB-lifecycle
// is what lets the same episode live in exactly one tab.

/**
 * Statuses shown on the Handled tab — episodes that are DONE and need no
 * further human action. ESCALATED is deliberately excluded: an escalation is
 * unfinished business that lives on Needs-you until a human resolves it.
 */
export const HANDLED_EPISODE_STATUSES: readonly EpisodeStatus[] = [
  'RESOLVED',
  'REJECTED_BY_OPERATOR',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
];

/** Statuses that surface on the Needs-you tab — awaiting human attention. */
export const NEEDS_YOU_EPISODE_STATUSES: readonly EpisodeStatus[] = ['RUNNING', 'WAITING_APPROVAL', 'ESCALATED'];

// `ApprovalDecision` is re-exported from the codegen mirror at the top of
// this file.

// ─── Memory scope + polarity ────────────────────────────────────────────
// Re-exported from the codegen mirror — Prisma enums are the single source
// of truth. Both wire format and DB representation are now UPPER (the
// previous lowercase wire format was retired with the boundary
// `.toLowerCase()`/`.toUpperCase()` translation).
//
// Scope:    ENTITY (specific subject), PATTERN (class of entities),
//           PLAYBOOK (agent-wide rule).
// Polarity: REINFORCE / CORRECT.
import { MemoryPolarity, MemoryPolaritySchema, MemoryScope, MemoryScopeSchema } from '../generated/prisma-enums';
export { MemoryPolarity, MemoryPolaritySchema, MemoryScope, MemoryScopeSchema };
