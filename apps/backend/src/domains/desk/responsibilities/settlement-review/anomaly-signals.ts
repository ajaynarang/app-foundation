import { SettlementReview } from '@sally/shared-types';

type SettlementAnomalySignals = SettlementReview.SettlementAnomalySignals;

/**
 * Deterministic anomaly-signal computation for Settlement Review.
 *
 * This is the math that powers the hard guard "any anomaly ⇒ cannot
 * auto-approve". It is intentionally a pure function — no Prisma, no LLM, no
 * I/O — so every branch (and the new-driver no-baseline case) is unit-testable
 * in isolation and the same result is reproducible from a persisted snapshot.
 *
 * Driver-pay logic: when in doubt, flag. Never silently approve.
 */
export interface ComputeAnomalyInput {
  netPayCents: number;
  grossPayCents: number;
  deductionsCents: number;
  lineItemCount: number;
  ageDays: number;
  /** Driver's recent average net pay (cents), or null when no baseline. */
  avgNetPayCents: number | null;
  /** A DRAFT older than this many days is stale. */
  staleDays?: number;
  /** Off-average threshold as a fraction (0.6 = 60%). */
  offAverageThresholdPct?: number;
}

export function computeAnomalySignals(input: ComputeAnomalyInput): SettlementAnomalySignals {
  const staleDays = input.staleDays ?? SettlementReview.SETTLEMENT_REVIEW_DEFAULT_STALE_DAYS;
  const threshold =
    input.offAverageThresholdPct ?? SettlementReview.SETTLEMENT_REVIEW_DEFAULT_OFF_AVERAGE_THRESHOLD_PCT;

  return {
    negativeNet: input.netPayCents < 0,
    deductionsExceedGross: input.deductionsCents > input.grossPayCents,
    noLineItems: input.lineItemCount === 0,
    offAverage: computeOffAverage(input.netPayCents, input.avgNetPayCents, threshold),
    stale: input.ageDays > staleDays,
  };
}

/**
 * `offAverage` is `null` when there's no usable baseline (new driver, or a
 * zero/negative average that would make the ratio meaningless) — that's "no
 * comparison possible", NOT an anomaly. Otherwise it trips when the net pay
 * deviates from the average by more than the threshold fraction.
 */
function computeOffAverage(netPayCents: number, avgNetPayCents: number | null, threshold: number): boolean | null {
  if (avgNetPayCents === null || avgNetPayCents <= 0) {
    return null;
  }
  const deviation = Math.abs(netPayCents - avgNetPayCents) / avgNetPayCents;
  return deviation > threshold;
}
