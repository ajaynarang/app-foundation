import type { CloseoutHydrateOutput } from '../step.types';
import { closeoutReviewConditionsEvaluator } from '../conditions-evaluator';

/**
 * Closeout Review conditions evaluator — pure-function tests over the
 * snapshotted conditions + closeout's own load-shaped hydrate output. The
 * gate is job-blind: it hands closeout the hydrate output it produced and
 * closeout reads the fields its rules need (billable charge total, load
 * customer). Behaviour is byte-identical to the prior GateEntity-based
 * evaluator — only the source of the values changed (pre-mapped GateEntity
 * → closeout hydrate output).
 */

/** Build a closeout hydrate output carrying just the fields the evaluator reads. */
function hydrate(facts: { amount?: number; customerId?: string | null } = {}): CloseoutHydrateOutput {
  return {
    entity: {
      load: { customerId: facts.customerId },
      charges: { billableTotalDollars: facts.amount },
    },
  } as unknown as CloseoutHydrateOutput;
}

const baseFacts = {
  amount: 1000,
  customerId: 'cust_acme' as string | null,
};

describe('closeoutReviewConditionsEvaluator', () => {
  it('empty conditions → all checks pass', () => {
    const result = closeoutReviewConditionsEvaluator({}, hydrate(baseFacts));
    expect(result.conditionsMet).toBe(true);
    expect(result.checks.minChargeOk).toBe(true);
    expect(result.checks.maxChargeOk).toBe(true);
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('maxChargeOk: amount == maxChargeUsd is OK (≤, not <)', () => {
    const result = closeoutReviewConditionsEvaluator({ maxChargeUsd: 1000 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.maxChargeOk).toBe(true);
  });

  it('maxChargeOk: amount > maxChargeUsd fails', () => {
    const result = closeoutReviewConditionsEvaluator({ maxChargeUsd: 999 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.maxChargeOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('minChargeOk: amount == minChargeUsd is OK (≥, not >)', () => {
    const result = closeoutReviewConditionsEvaluator({ minChargeUsd: 1000 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.minChargeOk).toBe(true);
  });

  it('minChargeOk: amount < minChargeUsd fails', () => {
    const result = closeoutReviewConditionsEvaluator({ minChargeUsd: 1001 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.minChargeOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('excludeCustomerIds empty array is a no-op', () => {
    const result = closeoutReviewConditionsEvaluator({ excludeCustomerIds: [] }, hydrate(baseFacts));
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('excludeCustomerIds contains customer → fails', () => {
    const result = closeoutReviewConditionsEvaluator(
      { excludeCustomerIds: ['cust_acme', 'cust_brown'] },
      hydrate(baseFacts),
    );
    expect(result.checks.excludedCustomerOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('excludeCustomerIds set but customerId=null → passes (no match possible)', () => {
    const result = closeoutReviewConditionsEvaluator(
      { excludeCustomerIds: ['cust_acme'] },
      hydrate({ ...baseFacts, customerId: null }),
    );
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('min + max + excluded all fail → conditionsMet false', () => {
    const result = closeoutReviewConditionsEvaluator(
      { minChargeUsd: 2000, maxChargeUsd: 500, excludeCustomerIds: ['cust_acme'] },
      hydrate({ ...baseFacts, amount: 1000 }),
    );
    expect(result.checks.minChargeOk).toBe(false);
    expect(result.checks.maxChargeOk).toBe(false);
    expect(result.checks.excludedCustomerOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('treats missing amount as 0 (below any minChargeUsd, within any maxChargeUsd)', () => {
    const result = closeoutReviewConditionsEvaluator(
      { minChargeUsd: 1, maxChargeUsd: 500 },
      hydrate({ customerId: 'cust_acme' }),
    );
    expect(result.checks.minChargeOk).toBe(false);
    expect(result.checks.maxChargeOk).toBe(true);
  });

  it('reads charge total + customer from a full closeout hydrate shape', () => {
    const fullHydrate: CloseoutHydrateOutput = {
      entity: {
        load: {
          loadNumber: 'LD-1',
          customerId: 'cust_acme',
          customerName: 'Acme',
          deliveredAt: '2026-05-18T00:00:00.000Z',
          hoursSinceDelivery: 72,
          billingStatus: 'APPROVED',
          status: 'DELIVERED',
        },
        readiness: { score: 100, hasBlockers: false, readyToApprove: true, blockers: [] },
        charges: { hasBillableCharges: true, billableTotalDollars: 2450, items: [] },
      },
      memories: [],
      preflight: { action: 'proceed' },
    };

    const result = closeoutReviewConditionsEvaluator(
      { minChargeUsd: 1000, maxChargeUsd: 5000, excludeCustomerIds: ['cust_brown'] },
      fullHydrate,
    );
    expect(result.checks.minChargeOk).toBe(true);
    expect(result.checks.maxChargeOk).toBe(true);
    expect(result.checks.excludedCustomerOk).toBe(true);
    expect(result.conditionsMet).toBe(true);
  });
});
