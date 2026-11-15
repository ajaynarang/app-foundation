import type { AgentScope, ScopeTier, TrustLevel } from '@app/shared-types';
import { decideToolCall } from '../../../ai/agent-contract/tool-policy';

import type { ConditionsResult } from '../../responsibilities/definition.types';

/**
 * Pure gate-decision algorithm. No side effects — all DB writes live in
 * gate.step.ts which calls into this function with plain data.
 *
 * An adapter over `decideToolCall` (ai/agent-contract/tool-policy.ts), the one
 * rule every tool caller shares. This file only maps its answer to the gate's shape.
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

  // The rules live in `decideToolCall` — the same function the tool pipeline uses.
  const decision = decideToolCall(toolScope, {
    kind: 'job',
    trustLevel,
    conditions: conditionsResult,
    confidence: lastLlmConfidence,
  });

  const detail = {
    rule: decision.rule,
    ...(decision.checks !== undefined && { checks: decision.checks }),
    ...(decision.confidence !== undefined && { confidence: decision.confidence }),
    ...(decision.threshold !== undefined && { threshold: decision.threshold }),
  };

  if (decision.verdict === 'ask') {
    return { gated: true, toolScope, tier: decision.tier, ...detail };
  }
  // `run` is only ever returned for a known scope, so both are non-null here.
  return { gated: false, toolScope: toolScope as AgentScope, tier: decision.tier as ScopeTier, ...detail };
}
