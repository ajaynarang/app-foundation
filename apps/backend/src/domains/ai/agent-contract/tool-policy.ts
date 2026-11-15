import { scopeTier, SCOPE_TIERS } from '@app/shared-types';
import type { AgentScope, ScopeTier, TrustLevel } from '@app/shared-types';

/**
 * The one rule for "may this caller run this tool now, or must a person say yes first?".
 *
 * Every caller of a tool goes through it:
 *   - a person in the assistant           → `{ kind: 'person' }`
 *   - an outside app, key or agent (MCP)  → `{ kind: 'outside' }`
 *   - a Desk job deciding whether to act  → `{ kind: 'job', … }`
 *   - a Desk job running an act the gate
 *     already cleared                     → `{ kind: 'cleared-job' }`
 *
 * Pure: no I/O, no clock. `HitlPolicyService` (the tool pipeline) and
 * `decideGate` (the Desk gate step) are thin adapters over this function, so the
 * tier rules cannot drift between the two paths.
 *
 * The tier comes from the tool's scope (`scopeTier`):
 *   read       → runs for everyone
 *   sensitive  → a person says yes, whatever the caller or its level
 *   standard   → depends on the caller (and, for a job, its level)
 */

/** Confidence a job needs to act alone at each level. null = it always asks. */
export const TRUST_LEVEL_CONFIDENCE_THRESHOLDS: Record<TrustLevel, number | null> = {
  SUPERVISED: null,
  ASSISTED: 0.9,
  AUTONOMOUS: 0.75,
};

/** Which confirmation a waiting call needs. `none` = no confirmation. */
export type ConfirmationTier = 'none' | 'standard' | 'sensitive';

export interface JobConditions {
  conditionsMet: boolean;
  checks: Record<string, boolean>;
}

export type ToolCaller =
  | { kind: 'person' }
  | { kind: 'outside' }
  | { kind: 'cleared-job' }
  | {
      kind: 'job';
      trustLevel: TrustLevel;
      /** The job's own hard rules, already evaluated. */
      conditions: JobConditions;
      /** Confidence of the job's last model step; null when it gave none. */
      confidence: number | null;
    };

export interface ToolCallDecision {
  /** `run` = go now. `ask` = a person must say yes first. */
  verdict: 'run' | 'ask';
  /** The confirmation the call needs when the verdict is `ask`. */
  confirmation: ConfirmationTier;
  /** A stable name for the rule that decided — written to the audit trail. */
  rule: string;
  /** null only when the tool's scope is unknown. */
  tier: ScopeTier | null;
  checks?: Record<string, boolean>;
  confidence?: number | null;
  threshold?: number | null;
}

export function decideToolCall(scope: AgentScope | null, caller: ToolCaller): ToolCallDecision {
  // A tool nobody registered a scope for: fail closed.
  if (scope === null) {
    return { verdict: 'ask', confirmation: 'sensitive', rule: 'unknown_scope_fail_closed', tier: null };
  }

  const tier = scopeTier(scope);

  // Tier overrides everything about the caller.
  if (tier === SCOPE_TIERS.READ) {
    return { verdict: 'run', confirmation: 'none', rule: 'read_never_gates', tier };
  }
  if (tier === SCOPE_TIERS.SENSITIVE) {
    return { verdict: 'ask', confirmation: 'sensitive', rule: 'sensitive_always_gates', tier };
  }

  // Standard tier — the caller decides.
  switch (caller.kind) {
    case 'person':
      return { verdict: 'ask', confirmation: 'standard', rule: 'person_confirms_standard', tier };
    case 'outside':
      return { verdict: 'ask', confirmation: 'standard', rule: 'outside_confirms_standard', tier };
    case 'cleared-job':
      return { verdict: 'run', confirmation: 'none', rule: 'job_cleared_by_gate', tier };
    case 'job':
      return decideJob(tier, caller);
  }
}

function decideJob(tier: ScopeTier, job: Extract<ToolCaller, { kind: 'job' }>): ToolCallDecision {
  const { trustLevel, conditions, confidence } = job;
  const ask = (rule: string, extra: Partial<ToolCallDecision> = {}): ToolCallDecision => ({
    verdict: 'ask',
    confirmation: 'standard',
    rule,
    tier,
    ...extra,
  });
  const run = (rule: string, extra: Partial<ToolCallDecision> = {}): ToolCallDecision => ({
    verdict: 'run',
    confirmation: 'none',
    rule,
    tier,
    ...extra,
  });

  if (trustLevel === 'SUPERVISED') return ask('supervised_gates_standard');

  const threshold = TRUST_LEVEL_CONFIDENCE_THRESHOLDS[trustLevel];
  const belowThreshold = confidence !== null && threshold !== null && confidence < threshold;

  if (trustLevel === 'ASSISTED') {
    const detail = { checks: conditions.checks, confidence, threshold };
    if (!conditions.conditionsMet) return ask('assisted_conditions_failed', detail);
    if (belowThreshold) return ask('assisted_confidence_below_threshold', detail);
    return run('assisted_ok', detail);
  }

  // AUTONOMOUS
  const detail = { confidence, threshold };
  if (belowThreshold) return ask('autonomous_confidence_below_threshold', detail);
  return run('autonomous_ok', detail);
}
