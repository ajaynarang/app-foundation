import { settlementReviewConditionsEvaluator } from '../conditions-evaluator';
import type { SettlementReviewHydrateOutput } from '../step.types';

/**
 * Settlement Review conditions evaluator — pure-function tests over the
 * snapshotted conditions + settlement-review's OWN hydrate output. The gate
 * is job-blind: it hands settlement-review the hydrate output it produced and
 * the evaluator reads the field its rule needs (the driver public id) for the
 * excludeDriverIds rule.
 */

/** Build a settlement hydrate output carrying just the field the evaluator reads. */
function hydrate(driverId: string | null = 'drv_acme'): SettlementReviewHydrateOutput {
  return {
    entity: {
      settlement: { driverId },
    },
  } as unknown as SettlementReviewHydrateOutput;
}

describe('settlementReviewConditionsEvaluator', () => {
  it('empty conditions → check passes', () => {
    const result = settlementReviewConditionsEvaluator({}, hydrate());
    expect(result.conditionsMet).toBe(true);
    expect(result.checks.excludedDriverOk).toBe(true);
  });

  it('excludeDriverIds empty array is a no-op', () => {
    const result = settlementReviewConditionsEvaluator({ excludeDriverIds: [] }, hydrate());
    expect(result.checks.excludedDriverOk).toBe(true);
  });

  it('excludeDriverIds contains driver → fails', () => {
    const result = settlementReviewConditionsEvaluator({ excludeDriverIds: ['drv_acme', 'drv_brown'] }, hydrate());
    expect(result.checks.excludedDriverOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('excludeDriverIds set but driverId=null → passes (no match possible)', () => {
    const result = settlementReviewConditionsEvaluator({ excludeDriverIds: ['drv_acme'] }, hydrate(null));
    expect(result.checks.excludedDriverOk).toBe(true);
  });

  it('ignores staleDays / offAverageThresholdPct (not gate rules)', () => {
    const result = settlementReviewConditionsEvaluator({ staleDays: 14, offAverageThresholdPct: 0.4 }, hydrate());
    expect(result.conditionsMet).toBe(true);
    expect(result.checks.excludedDriverOk).toBe(true);
  });
});
