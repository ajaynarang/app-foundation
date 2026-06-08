import { decideGate } from '../gate.algorithm';
import type { GateDecisionInput } from '../gate.algorithm';
import type { ConditionsResult } from '../../../responsibilities/definition.types';

/**
 * Pure-function tests for the gate decision algorithm.
 *
 * Scope-based coverage — tiers derive from shared-types `scopeTier()`:
 *   - read       (`*:read`)        → never gates
 *   - sensitive  (`*:sensitive`)   → always gates
 *   - standard   (everything else) → trust × conditions × confidence
 *
 * `decideGate` is responsibility-agnostic: it consumes a pre-computed
 * `ConditionsResult` (produced by the responsibility's own evaluator).
 * These tests inject that result directly — the per-responsibility
 * evaluator is tested separately (see ar-followup conditions-evaluator
 * spec).
 */

const CONDITIONS_MET: ConditionsResult = { conditionsMet: true, checks: {} };

function baseInput(overrides: Partial<GateDecisionInput> = {}): GateDecisionInput {
  return {
    trustLevel: 'SUPERVISED',
    toolScope: 'comms:send', // standard tier
    conditionsResult: CONDITIONS_MET,
    lastLlmConfidence: 0.95,
    ...overrides,
  };
}

describe('decideGate — universal fail-safes', () => {
  it('read tier never gates (even Supervised)', () => {
    for (const trustLevel of ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'] as const) {
      const decision = decideGate(baseInput({ toolScope: 'documents:read', trustLevel }));
      expect(decision.gated).toBe(false);
      expect(decision.rule).toBe('read_never_gates');
    }
  });

  it('sensitive tier always gates (even Autonomous with full confidence)', () => {
    for (const trustLevel of ['SUPERVISED', 'ASSISTED', 'AUTONOMOUS'] as const) {
      const decision = decideGate(
        baseInput({
          toolScope: 'platform:write:sensitive',
          trustLevel,
          lastLlmConfidence: 1.0,
          conditionsResult: CONDITIONS_MET,
        }),
      );
      expect(decision.gated).toBe(true);
      expect(decision.rule).toBe('sensitive_always_gates');
    }
  });

  it('comms:send:bulk is sensitive tier (always gates)', () => {
    const decision = decideGate(
      baseInput({
        toolScope: 'comms:send:bulk',
        trustLevel: 'AUTONOMOUS',
        lastLlmConfidence: 1.0,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('sensitive_always_gates');
  });

  it('platform:admin is sensitive tier (always gates)', () => {
    const decision = decideGate(baseInput({ toolScope: 'platform:admin', trustLevel: 'AUTONOMOUS' }));
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('sensitive_always_gates');
  });

  it('null toolScope (registry miss) fails closed → gated', () => {
    const decision = decideGate(baseInput({ toolScope: null }));
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('unknown_scope_fail_closed');
  });
});

describe('decideGate — Supervised trust on standard tier', () => {
  const standardScopes = ['comms:send', 'platform:write', 'integrations:write'] as const;

  it.each(standardScopes)('gates %s regardless of confidence or conditions', (toolScope) => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'SUPERVISED',
        toolScope,
        lastLlmConfidence: 1.0,
        conditionsResult: CONDITIONS_MET,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('supervised_gates_standard');
  });
});

describe('decideGate — Assisted trust on standard tier', () => {
  it('passes when conditions met + confidence ≥ 0.90', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: { conditionsMet: true, checks: { amountOk: true } },
        lastLlmConfidence: 0.95,
      }),
    );
    expect(decision.gated).toBe(false);
    expect(decision.rule).toBe('assisted_ok');
  });

  it('gates when conditions are not met (forwards checks)', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: { conditionsMet: false, checks: { amountOk: false, firstReminderOk: true } },
        lastLlmConfidence: 0.95,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('assisted_conditions_failed');
    if (decision.gated) {
      expect(decision.checks?.amountOk).toBe(false);
      expect(decision.checks?.firstReminderOk).toBe(true);
    }
  });

  it('gates when conditions met but confidence < 0.90', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: CONDITIONS_MET,
        lastLlmConfidence: 0.85,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('assisted_confidence_below_threshold');
    if (decision.gated) {
      expect(decision.confidence).toBe(0.85);
      expect(decision.threshold).toBe(0.9);
    }
  });

  it('passes on exact threshold boundary (0.90)', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: CONDITIONS_MET,
        lastLlmConfidence: 0.9,
      }),
    );
    expect(decision.gated).toBe(false);
  });

  it('passes when confidence is null (no LLM step yet)', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: CONDITIONS_MET,
        lastLlmConfidence: null,
      }),
    );
    expect(decision.gated).toBe(false);
    expect(decision.rule).toBe('assisted_ok');
  });

  it('conditions-met result passes conditions check', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'comms:send',
        conditionsResult: CONDITIONS_MET,
        lastLlmConfidence: 0.95,
      }),
    );
    expect(decision.gated).toBe(false);
  });

  it('still gates sensitive tier regardless of conditions', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'ASSISTED',
        toolScope: 'platform:write:sensitive',
        conditionsResult: CONDITIONS_MET,
        lastLlmConfidence: 1.0,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('sensitive_always_gates');
  });
});

describe('decideGate — Autonomous trust on standard tier', () => {
  it('passes when confidence ≥ 0.75 regardless of conditions', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'AUTONOMOUS',
        toolScope: 'comms:send',
        conditionsResult: { conditionsMet: false, checks: { amountOk: false } }, // would gate for Assisted
        lastLlmConfidence: 0.8,
      }),
    );
    expect(decision.gated).toBe(false);
    expect(decision.rule).toBe('autonomous_ok');
  });

  it('gates when confidence < 0.75', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'AUTONOMOUS',
        toolScope: 'comms:send',
        lastLlmConfidence: 0.7,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('autonomous_confidence_below_threshold');
  });

  it('still gates sensitive tier regardless of confidence', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'AUTONOMOUS',
        toolScope: 'platform:write:sensitive',
        lastLlmConfidence: 1.0,
      }),
    );
    expect(decision.gated).toBe(true);
    expect(decision.rule).toBe('sensitive_always_gates');
  });

  it('passes when confidence is null (no LLM step — e.g., deterministic act)', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'AUTONOMOUS',
        toolScope: 'platform:write',
        lastLlmConfidence: null,
      }),
    );
    expect(decision.gated).toBe(false);
    expect(decision.rule).toBe('autonomous_ok');
  });

  it('passes on exact threshold boundary (0.75)', () => {
    const decision = decideGate(
      baseInput({
        trustLevel: 'AUTONOMOUS',
        toolScope: 'platform:write',
        lastLlmConfidence: 0.75,
      }),
    );
    expect(decision.gated).toBe(false);
  });
});
