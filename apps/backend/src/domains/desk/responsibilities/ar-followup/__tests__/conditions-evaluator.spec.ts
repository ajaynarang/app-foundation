import type { HydrateOutput } from '../step.types';
import { arFollowupConditionsEvaluator } from '../conditions-evaluator';

/**
 * AR Follow-up conditions evaluator — pure-function tests over the
 * snapshotted conditions + AR's own hydrate output. The gate is job-blind:
 * it hands AR the hydrate output it produced and AR reads the fields its
 * rules need (invoice amount/customerId, prior reminder count). Behaviour
 * is byte-identical to the prior GateEntity-based evaluator — only the
 * source of the values changed (pre-mapped GateEntity → AR hydrate output).
 */

/** Build an AR hydrate output carrying just the fields the evaluator reads. */
function hydrate(
  facts: { amount?: number; customerId?: string | null; priorActionCount?: number } = {},
): HydrateOutput {
  return {
    entity: {
      invoice: { amount: facts.amount, customerId: facts.customerId },
      priorReminderCount: facts.priorActionCount,
    },
  } as unknown as HydrateOutput;
}

const baseFacts = {
  amount: 1000,
  customerId: 'cust_acme' as string | null,
  priorActionCount: 0,
};

describe('arFollowupConditionsEvaluator', () => {
  it('empty conditions → all checks pass', () => {
    const result = arFollowupConditionsEvaluator({}, hydrate(baseFacts));
    expect(result.conditionsMet).toBe(true);
    expect(result.checks.amountOk).toBe(true);
    expect(result.checks.firstReminderOk).toBe(true);
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('amountOk: amount == maxAmountUsd is OK (≤, not <)', () => {
    const result = arFollowupConditionsEvaluator({ maxAmountUsd: 1000 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.amountOk).toBe(true);
  });

  it('amountOk: amount > maxAmountUsd fails', () => {
    const result = arFollowupConditionsEvaluator({ maxAmountUsd: 999 }, hydrate({ ...baseFacts, amount: 1000 }));
    expect(result.checks.amountOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('firstReminderOnly=false is a no-op (always passes)', () => {
    const result = arFollowupConditionsEvaluator(
      { firstReminderOnly: false },
      hydrate({ ...baseFacts, priorActionCount: 5 }),
    );
    expect(result.checks.firstReminderOk).toBe(true);
  });

  it('firstReminderOnly=true + priorActionCount=0 passes', () => {
    const result = arFollowupConditionsEvaluator(
      { firstReminderOnly: true },
      hydrate({ ...baseFacts, priorActionCount: 0 }),
    );
    expect(result.checks.firstReminderOk).toBe(true);
  });

  it('firstReminderOnly=true + priorActionCount=1 fails', () => {
    const result = arFollowupConditionsEvaluator(
      { firstReminderOnly: true },
      hydrate({ ...baseFacts, priorActionCount: 1 }),
    );
    expect(result.checks.firstReminderOk).toBe(false);
  });

  it('excludeCustomerIds empty array is a no-op', () => {
    const result = arFollowupConditionsEvaluator({ excludeCustomerIds: [] }, hydrate(baseFacts));
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('excludeCustomerIds contains customer → fails', () => {
    const result = arFollowupConditionsEvaluator(
      { excludeCustomerIds: ['cust_acme', 'cust_brown'] },
      hydrate(baseFacts),
    );
    expect(result.checks.excludedCustomerOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('excludeCustomerIds set but customerId=null → passes (no match possible)', () => {
    const result = arFollowupConditionsEvaluator(
      { excludeCustomerIds: ['cust_acme'] },
      hydrate({ ...baseFacts, customerId: null }),
    );
    expect(result.checks.excludedCustomerOk).toBe(true);
  });

  it('all three fail — conditionsMet false', () => {
    const result = arFollowupConditionsEvaluator(
      {
        maxAmountUsd: 500,
        firstReminderOnly: true,
        excludeCustomerIds: ['cust_acme'],
      },
      hydrate({ ...baseFacts, amount: 1000, priorActionCount: 2 }),
    );
    expect(result.checks.amountOk).toBe(false);
    expect(result.checks.firstReminderOk).toBe(false);
    expect(result.checks.excludedCustomerOk).toBe(false);
    expect(result.conditionsMet).toBe(false);
  });

  it('amount fails but others pass → conditionsMet false', () => {
    const result = arFollowupConditionsEvaluator(
      { maxAmountUsd: 500, firstReminderOnly: true },
      hydrate({ ...baseFacts, amount: 1000, priorActionCount: 0 }),
    );
    expect(result.checks.amountOk).toBe(false);
    expect(result.checks.firstReminderOk).toBe(true);
    expect(result.conditionsMet).toBe(false);
  });

  it('treats missing amount as 0 (within any maxAmountUsd)', () => {
    const result = arFollowupConditionsEvaluator({ maxAmountUsd: 500 }, hydrate({ customerId: 'cust_acme' }));
    expect(result.checks.amountOk).toBe(true);
  });

  it('treats missing priorActionCount as 0 (first reminder)', () => {
    const result = arFollowupConditionsEvaluator({ firstReminderOnly: true }, hydrate({ customerId: 'cust_acme' }));
    expect(result.checks.firstReminderOk).toBe(true);
  });
});
