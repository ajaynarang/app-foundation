/**
 * Sally's Desk — user-facing label + variant maps.
 *
 * Keyed on v3 enums from `@sally/shared-types`. Kept here so components
 * never inline a status→label mapping.
 */

import type {
  AgentKey,
  ApprovalDecision,
  EpisodeStatus,
  Lifecycle,
  MemoryPolarity,
  MemoryScope,
  StepKind,
  StepStatus,
  TriggerKind,
  TrustLevel,
} from './types';

export const STEP_LABELS: Record<StepKind, string> = {
  HYDRATE: 'Hydrate',
  PERCEIVE: 'Perceive',
  DECIDE: 'Decide',
  DRAFT: 'Draft',
  GATE: 'Gate',
  EXECUTE: 'Execute',
  CLOSE: 'Close',
};

export const STEP_DESCRIPTIONS: Record<StepKind, string> = {
  HYDRATE: 'Load context — invoice, customer, payment history, memory',
  PERCEIVE: 'Interpret the situation and score confidence',
  DECIDE: 'Pick the next action',
  DRAFT: 'Compose the artifact to send',
  GATE: 'Check trust, conditions, and confidence thresholds',
  EXECUTE: 'Run the tool (via the Agent Contract pipeline)',
  CLOSE: 'Finalize the episode and write learning memory',
};

export const STEP_STATUS_VARIANTS: Record<StepStatus, { label: string; className: string }> = {
  RUNNING: {
    label: 'Running',
    className: 'bg-blue-500/10 text-blue-500 dark:text-blue-400',
  },
  SUCCEEDED: {
    label: 'Done',
    className: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-500 dark:text-red-400',
  },
  GATED: {
    label: 'Gated',
    className: 'bg-yellow-500/10 text-yellow-500 dark:text-yellow-400',
  },
  SKIPPED: {
    label: 'Skipped',
    className: 'bg-muted text-muted-foreground',
  },
};

export const EPISODE_STATUS_VARIANTS: Record<EpisodeStatus, { label: string; className: string }> = {
  RUNNING: {
    label: 'Running',
    className: 'bg-blue-500/10 text-blue-500 dark:text-blue-400',
  },
  WAITING_APPROVAL: {
    label: 'Waiting approval',
    className: 'bg-yellow-500/10 text-yellow-500 dark:text-yellow-400',
  },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400',
  },
  ESCALATED: {
    label: 'Escalated',
    className: 'bg-red-500/10 text-red-500 dark:text-red-400',
  },
  REJECTED_BY_OPERATOR: {
    label: 'Rejected',
    className: 'bg-muted text-muted-foreground',
  },
  EXPIRED: {
    label: 'Expired',
    className: 'bg-muted text-muted-foreground',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-muted text-muted-foreground',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-500 dark:text-red-400',
  },
};

export const TRUST_LEVEL_LABELS: Record<TrustLevel, { label: string; description: string }> = {
  SUPERVISED: {
    label: 'Supervised',
    description: 'Sally asks before every action',
  },
  ASSISTED: {
    label: 'Assisted',
    description: 'Sally acts on low-risk tasks that match your rules',
  },
  AUTONOMOUS: {
    label: 'Autonomous',
    description: 'Sally acts independently; flags exceptions',
  },
};

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  AVAILABLE: 'Available',
  COMING_SOON: 'Coming soon',
};

export const TRIGGER_KIND_LABELS: Record<TriggerKind, string> = {
  SCHEDULED: 'Scheduled',
  DOMAIN_EVENT: 'Event',
  WEBHOOK: 'Webhook',
  MANUAL: 'Manual',
};

export const APPROVAL_DECISION_LABELS: Record<ApprovalDecision, string> = {
  APPROVED: 'Approved',
  EDITED: 'Edited & approved',
  REJECTED: 'Rejected',
};

export const MEMORY_SCOPE_LABELS: Record<MemoryScope, string> = {
  ENTITY: 'Subject',
  PATTERN: 'Pattern',
  PLAYBOOK: 'Rule',
};

export const MEMORY_POLARITY_LABELS: Record<MemoryPolarity, string> = {
  REINFORCE: 'Reinforce',
  CORRECT: 'Correct',
};

export const TRUST_LEVEL_OPTIONS: Array<{ value: TrustLevel; label: string }> = [
  { value: 'SUPERVISED', label: TRUST_LEVEL_LABELS.SUPERVISED.label },
  { value: 'ASSISTED', label: TRUST_LEVEL_LABELS.ASSISTED.label },
  { value: 'AUTONOMOUS', label: TRUST_LEVEL_LABELS.AUTONOMOUS.label },
];

/** Canonical step order for the timeline display. */
export const STEP_ORDER: StepKind[] = ['HYDRATE', 'PERCEIVE', 'DECIDE', 'DRAFT', 'GATE', 'EXECUTE', 'CLOSE'];

/**
 * Monogram per agent — renders inside the Crew avatar. Two-letter
 * abbreviation derived from the agent key.
 */
export const AGENT_MONOGRAMS: Record<AgentKey, string> = {
  'sally-dispatch': 'SD',
  'sally-billing': 'SB',
  'sally-payroll': 'SP',
  'sally-compliance': 'SC',
  'sally-safety': 'SA',
  'sally-maintenance': 'SM',
  'sally-fuel': 'SF',
  'sally-route': 'SR',
  'sally-driver': 'SV',
  'sally-customer': 'SU',
  'sally-support': 'SS',
  'sally-prospect': 'SO',
};

/**
 * Generic free-form-rule example shown as the placeholder in the agent's
 * Rules tab. Per-agent so the example matches that agent's domain (a payroll
 * agent shouldn't be prompted with an invoicing example). `DEFAULT_RULE_PLACEHOLDER`
 * is the fallback for any agent without a tailored example.
 */
export const DEFAULT_RULE_PLACEHOLDER = 'e.g. "Always check with me before taking action over $10k"';

export const AGENT_RULE_PLACEHOLDERS: Partial<Record<AgentKey, string>> = {
  'sally-billing': 'e.g. "Escalate invoices over $10k to me before sending"',
  'sally-payroll': 'e.g. "Always flag settlements over $8k for my review"',
  'sally-compliance': 'e.g. "Remind drivers 30 days before a CDL expires, not 14"',
  'sally-dispatch': 'e.g. "Never auto-assign loads to drivers with under 6 months tenure"',
  'sally-route': 'e.g. "Warn the broker as soon as an ETA slips past the appointment window"',
  'sally-maintenance': 'e.g. "Schedule PM only on weekends for the long-haul trucks"',
};
