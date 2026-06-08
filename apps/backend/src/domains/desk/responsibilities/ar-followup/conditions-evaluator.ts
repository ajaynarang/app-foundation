import { ArFollowup } from '@app/shared-types';

import type { ConditionsEvaluator, ConditionsResult } from '../definition.types';

import type { HydrateOutput } from './step.types';

type ArFollowupConditions = ArFollowup.ArFollowupConditions;

/**
 * AR Follow-up condition evaluator — pure function over the snapshotted
 * conditions + AR's own hydrate output.
 *
 * The single source of truth for AR's hard rules. Supplied to the gate
 * via `AR_FOLLOWUP_DEFINITION.conditionsEvaluator`; the shared gate step
 * invokes it without any AR-specific knowledge of its own — it hands AR
 * the hydrate output it produced and AR reads the fields its rules need:
 *   - invoice amount             → vs `maxAmountUsd`
 *   - invoice customerId         → vs `excludeCustomerIds`
 *   - prior reminder count       → vs `firstReminderOnly`
 */
export const arFollowupConditionsEvaluator: ConditionsEvaluator = (conditions, hydrate) =>
  evaluateArFollowupConditions(ArFollowup.ArFollowupConditionsSchema.parse(conditions), hydrate as HydrateOutput);

function evaluateArFollowupConditions(conditions: ArFollowupConditions, hydrate: HydrateOutput): ConditionsResult {
  const invoice = hydrate.entity.invoice;

  const amountOk = conditions.maxAmountUsd === undefined || (invoice.amount ?? 0) <= conditions.maxAmountUsd;

  const firstReminderOk = conditions.firstReminderOnly !== true || (hydrate.entity.priorReminderCount ?? 0) === 0;

  const customerId = invoice.customerId ?? null;
  const excludedCustomerOk =
    !conditions.excludeCustomerIds || customerId === null || !conditions.excludeCustomerIds.includes(customerId);

  return {
    checks: { amountOk, firstReminderOk, excludedCustomerOk },
    conditionsMet: amountOk && firstReminderOk && excludedCustomerOk,
  };
}
