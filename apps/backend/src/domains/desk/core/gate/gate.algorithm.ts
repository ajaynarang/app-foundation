import type { AgentScope, ScopeTier, TrustLevel } from '@app/shared-types';
import { TRUST_LEVEL_CONFIDENCE_THRESHOLDS, scopeTier } from '@app/shared-types';

import type { ConditionsResult } from '../../responsibilities/definition.types';

/**
 * Pure gate-decision algorithm. No side effects — all DB writes live in
 * gate.step.ts which calls into this function with plain data.
 *
 * Consumes scope directly (via ScopeRegistryService lookup by the caller)
 * and derives tier via shared-types' `scopeTier()`. No custom ToolRisk
 * vocabulary — Desk reuses the platform's existing 3-tier scope model:
 *
 *   read       → never gates
 *   sensitive  → always gates (regardless of trust)
 *   standard   → trust-level + conditions + confidence
 *
 * Conditions are responsibility-agnostic: the caller runs the
 * responsibility's own evaluator and passes the {@link ConditionsResult}
 * in. A responsibility with no conditions schema passes
 * `{ conditionsMet: true, checks: {} }`. This keeps `decideGate` free of
 * any per-responsibility knowledge.
 *
 * Decoupling the algorithm from the step wrapper lets us unit-test every
 * trust × tier × conditions × confidence combo without mocking Prisma.
 */

export type GateDecisionInput = {
  trustLevel: TrustLevel;
  toolScope: AgentScope | null; // null = unknown tool; fail-closed to gated
  conditionsResult: ConditionsResult; // pre-computed by the responsibility's evaluator
  lastLlmConfidence: number | null; // from most recent decide/draft step
};

export type GateDecision =
  | {
      gated: false;
      rule: string;
      toolScope: AgentScope;
      tier: ScopeTier;
      checks?: Record<string, boolean>;
      confidence?: number | null;
      threshold?: number | null;
    }
  | {
      gated: true;
      rule: string;
      toolScope: AgentScope | null;
      tier: ScopeTier | null;
      checks?: Record<string, boolean>;
      confidence?: number | null;
      threshold?: number | null;
    };

export function decideGate(input: GateDecisionInput): GateDecision {
  const { trustLevel, toolScope, conditionsResult, lastLlmConfidence } = input;

  // Unknown scope — registry miss. Fail closed.
  if (toolScope === null) {
    return {
      gated: true,
      rule: 'unknown_scope_fail_closed',
      toolScope: null,
      tier: null,
    };
  }

  const tier = scopeTier(toolScope);

  // Universal fail-safes — tier overrides trust level
  if (tier === 'sensitive') {
    return { gated: true, rule: 'sensitive_always_gates', toolScope, tier };
  }
  if (tier === 'read') {
    return { gated: false, rule: 'read_never_gates', toolScope, tier };
  }

  // Everything below handles tier === 'standard'

  if (trustLevel === 'SUPERVISED') {
    return {
      gated: true,
      rule: 'supervised_gates_standard',
      toolScope,
      tier,
    };
  }

  if (trustLevel === 'ASSISTED') {
    const checks = conditionsResult.checks;
    const threshold = TRUST_LEVEL_CONFIDENCE_THRESHOLDS.ASSISTED; // 0.90
    if (!conditionsResult.conditionsMet) {
      return {
        gated: true,
        rule: 'assisted_conditions_failed',
        toolScope,
        tier,
        checks,
        confidence: lastLlmConfidence,
        threshold,
      };
    }
    if (lastLlmConfidence !== null && threshold !== null && lastLlmConfidence < threshold) {
      return {
        gated: true,
        rule: 'assisted_confidence_below_threshold',
        toolScope,
        tier,
        checks,
        confidence: lastLlmConfidence,
        threshold,
      };
    }
    return {
      gated: false,
      rule: 'assisted_ok',
      toolScope,
      tier,
      checks,
      confidence: lastLlmConfidence,
      threshold,
    };
  }

  // AUTONOMOUS
  const threshold = TRUST_LEVEL_CONFIDENCE_THRESHOLDS.AUTONOMOUS; // 0.75
  if (lastLlmConfidence !== null && threshold !== null && lastLlmConfidence < threshold) {
    return {
      gated: true,
      rule: 'autonomous_confidence_below_threshold',
      toolScope,
      tier,
      confidence: lastLlmConfidence,
      threshold,
    };
  }
  return {
    gated: false,
    rule: 'autonomous_ok',
    toolScope,
    tier,
    confidence: lastLlmConfidence,
    threshold,
  };
}
