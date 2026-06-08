import { SettlementReview } from '@app/shared-types';

import type { SettlementReviewDecideOutput } from './step.types';

/**
 * The deterministic anomaly guard — "any anomaly ⇒ flag, never approve".
 *
 * This is the crown-jewel safety invariant for driver pay, and it lives in
 * CODE, not just the decide prompt. If the hydrated signals show ANY anomaly,
 * an LLM `approve` decision is overridden to `flag_anomaly`. Anomalies are
 * math, not judgment — the LLM does not get to reason its way past one.
 *
 * Kept in its own pure module (no Mastra/Langfuse/AI-SDK imports) so it is
 * unit-testable in isolation without loading the LLM transport.
 */
export function enforceAnomalyGuard(
  decision: SettlementReviewDecideOutput,
  signals: SettlementReview.SettlementAnomalySignals,
): SettlementReviewDecideOutput {
  if (decision.action !== 'approve') return decision;
  if (!SettlementReview.hasAnomaly(signals)) return decision;

  const kinds = SettlementReview.anomalyKinds(signals);
  return {
    ...decision,
    action: 'flag_anomaly',
    anomalyKind: kinds[0],
    reasoning: `Anomaly signal(s) tripped (${kinds.join(', ')}) — cannot one-tap approve. ${decision.reasoning}`,
  };
}
