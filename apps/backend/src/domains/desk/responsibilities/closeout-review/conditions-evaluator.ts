import { CloseoutReview } from '@sally/shared-types';

import type { ConditionsEvaluator, ConditionsResult } from '../definition.types';

import type { CloseoutHydrateOutput } from './step.types';

type CloseoutReviewConditions = CloseoutReview.CloseoutReviewConditions;

/**
 * Closeout Review condition evaluator — pure function over the snapshotted
 * conditions + closeout's own hydrate output.
 *
 * Single source of truth for closeout's hard rules. Supplied to the gate
 * via `CLOSEOUT_REVIEW_DEFINITION.conditionsEvaluator`; the shared gate step
 * is job-blind — it hands closeout the load-shaped hydrate output it
 * produced and closeout reads the fields its rules need:
 *   - billable charge total → vs `minChargeUsd` / `maxChargeUsd`
 *   - load customer         → vs `excludeCustomerIds`
 *
 * `minHoursSinceDelivery` is a fan-out concern (it decides which loads even
 * open an episode), not a gate concern, so it is not evaluated here.
 */
export const closeoutReviewConditionsEvaluator: ConditionsEvaluator = (conditions, hydrate) =>
  evaluateCloseoutReviewConditions(
    CloseoutReview.CloseoutReviewConditionsSchema.parse(conditions),
    hydrate as CloseoutHydrateOutput,
  );

function evaluateCloseoutReviewConditions(
  conditions: CloseoutReviewConditions,
  hydrate: CloseoutHydrateOutput,
): ConditionsResult {
  const amount = hydrate.entity.charges.billableTotalDollars ?? 0;

  const minChargeOk = conditions.minChargeUsd === undefined || amount >= conditions.minChargeUsd;
  const maxChargeOk = conditions.maxChargeUsd === undefined || amount <= conditions.maxChargeUsd;

  const customerId = hydrate.entity.load.customerId ?? null;
  const excludedCustomerOk =
    !conditions.excludeCustomerIds || customerId === null || !conditions.excludeCustomerIds.includes(customerId);

  return {
    checks: { minChargeOk, maxChargeOk, excludedCustomerOk },
    conditionsMet: minChargeOk && maxChargeOk && excludedCustomerOk,
  };
}
