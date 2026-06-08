import type { SettlementReview } from '@sally/shared-types';

import { enforceAnomalyGuard } from '../anomaly-guard';
import type { SettlementReviewDecideOutput } from '../step.types';

/**
 * The deterministic anomaly guard — "any anomaly ⇒ flag, never approve".
 * This is the crown-jewel safety invariant for driver pay: it lives in CODE,
 * not just the prompt. The LLM's `approve` is overridden whenever a hard
 * signal tripped.
 */
function cleanSignals(
  over: Partial<SettlementReview.SettlementAnomalySignals> = {},
): SettlementReview.SettlementAnomalySignals {
  return {
    negativeNet: false,
    deductionsExceedGross: false,
    noLineItems: false,
    offAverage: false,
    stale: false,
    ...over,
  };
}

function approveDecision(): SettlementReviewDecideOutput {
  return { action: 'approve', reasoning: 'looks fine', confidence: 0.9 };
}

describe('enforceAnomalyGuard', () => {
  it('leaves an approve untouched when ALL signals are clean', () => {
    const out = enforceAnomalyGuard(approveDecision(), cleanSignals());
    expect(out.action).toBe('approve');
    expect(out.reasoning).toBe('looks fine');
  });

  it('treats offAverage=null (new driver, no baseline) as clean — approve survives', () => {
    const out = enforceAnomalyGuard(approveDecision(), cleanSignals({ offAverage: null }));
    expect(out.action).toBe('approve');
  });

  it.each([
    ['negativeNet', { negativeNet: true }],
    ['deductionsExceedGross', { deductionsExceedGross: true }],
    ['noLineItems', { noLineItems: true }],
    ['offAverage', { offAverage: true }],
    ['stale', { stale: true }],
  ] as const)('overrides approve → flag_anomaly when %s tripped', (kind, over) => {
    const out = enforceAnomalyGuard(approveDecision(), cleanSignals(over));
    expect(out.action).toBe('flag_anomaly');
    expect(out.anomalyKind).toBe(kind);
    expect(out.reasoning).toContain(kind);
  });

  it('picks the first tripped kind as the primary anomalyKind', () => {
    const out = enforceAnomalyGuard(approveDecision(), cleanSignals({ noLineItems: true, stale: true }));
    expect(out.action).toBe('flag_anomaly');
    // anomalyKinds order: ...noLineItems before stale
    expect(out.anomalyKind).toBe('noLineItems');
  });

  it('does NOT touch a decision that is already flag_anomaly', () => {
    const flagged: SettlementReviewDecideOutput = {
      action: 'flag_anomaly',
      anomalyKind: 'negativeNet',
      reasoning: 'already flagged',
      confidence: 0.95,
    };
    const out = enforceAnomalyGuard(flagged, cleanSignals({ negativeNet: true }));
    expect(out).toEqual(flagged);
  });

  it('does NOT touch a no_action decision even if a signal tripped', () => {
    const noAction: SettlementReviewDecideOutput = { action: 'no_action', reasoning: 'not draft', confidence: 0.7 };
    const out = enforceAnomalyGuard(noAction, cleanSignals({ stale: true }));
    expect(out).toEqual(noAction);
  });
});
