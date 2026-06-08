import { SettlementReview } from '@app/shared-types';

import type { ConditionsEvaluator, ConditionsResult } from '../definition.types';

import type { SettlementReviewHydrateOutput } from './step.types';

type SettlementReviewConditions = SettlementReview.SettlementReviewConditions;

/**
 * Settlement Review condition evaluator — pure function over the snapshotted
 * conditions + settlement-review's OWN hydrate output.
 *
 * Supplied to the gate via `SETTLEMENT_REVIEW_DEFINITION.conditionsEvaluator`.
 * The gate is job-blind: it hands the evaluator the hydrate output this
 * responsibility produced (typed `unknown`) and the evaluator casts it to its
 * own shape and reads the field its rule needs — the driver public id:
 *   - `entity.settlement.driverId` → vs `excludeDriverIds`
 *
 * In practice the gate rarely consults this for settlement-review: the only
 * tool the workflow executes is `approve-settlement`, which is a SENSITIVE
 * scope and so ALWAYS gates regardless of conditions (driver-pay safety, by
 * design). The evaluator still exists for completeness + a single source of
 * truth for the `excludeDriverIds` rule.
 *
 * Note: staleDays + offAverageThresholdPct are NOT gate rules — they are
 * tuning inputs the hydrate step uses to compute anomaly signals
 * deterministically. Only excludeDriverIds is expressible as a gate check.
 */
export const settlementReviewConditionsEvaluator: ConditionsEvaluator = (conditions, hydrate) =>
  evaluate(
    SettlementReview.SettlementReviewConditionsSchema.parse(conditions),
    hydrate as SettlementReviewHydrateOutput,
  );

function evaluate(conditions: SettlementReviewConditions, hydrate: SettlementReviewHydrateOutput): ConditionsResult {
  const driverId = hydrate.entity.settlement.driverId ?? null;
  const excludedDriverOk =
    !conditions.excludeDriverIds || driverId === null || !conditions.excludeDriverIds.includes(driverId);

  return {
    checks: { excludedDriverOk },
    conditionsMet: excludedDriverOk,
  };
}
