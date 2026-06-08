import { z } from 'zod';
import type { ConditionsUISpec } from '../responsibility';

/**
 * Settlement Review responsibility — types shared between backend, worker, and UI.
 *
 * Owned by sally-payroll. Weekly review of DRAFT driver settlements: approves
 * clean ones (one-tap, human-approved), flags anomalous ones (NEVER
 * auto-approves), and surfaces stale ones so drivers get paid on time. Sally
 * is the validation layer the system lacks — approve-settlement does ZERO
 * validation today.
 *
 * See .docs/plans/06-sally-ai/2026-05-21-desk-settlement-review-design.md.
 */

// ─── Tunable defaults (single source of truth) ──────────────────────────

/** Default age (days) past which a DRAFT settlement counts as stale. */
export const SETTLEMENT_REVIEW_DEFAULT_STALE_DAYS = 7;

/**
 * Default off-average threshold (fraction). A settlement whose net pay differs
 * from the driver's recent average by more than this fraction trips the
 * `offAverage` signal. 0.6 = net more than 1.6× or less than 0.4× of average.
 */
export const SETTLEMENT_REVIEW_DEFAULT_OFF_AVERAGE_THRESHOLD_PCT = 0.6;

/** How many recent non-VOID settlements form the driver's average baseline. */
export const SETTLEMENT_REVIEW_AVERAGE_WINDOW = 6;

// ─── User-editable conditions (tunable rules) ───────────────────────────

export const SettlementReviewConditionsSchema = z.object({
  /** A DRAFT older than this many days trips the `stale` signal. */
  staleDays: z.number().positive().optional(),

  /**
   * Off-average threshold as a fraction (0.6 = 60%). Net pay differing from
   * the driver's recent average by more than this trips `offAverage`.
   */
  offAverageThresholdPct: z.number().positive().optional(),

  /** Never review settlements for these driver IDs (e.g. owner-operators). */
  excludeDriverIds: z.array(z.string()).optional(),
});
export type SettlementReviewConditions = z.infer<typeof SettlementReviewConditionsSchema>;

/** Settings-page UI spec — rendered by the responsibility settings page. */
export const SettlementReviewConditionsUI: ConditionsUISpec = {
  fields: [
    {
      key: 'staleDays',
      label: 'Flag drafts older than (days)',
      control: 'number',
      helpText: 'A draft settlement sitting unactioned longer than this is surfaced as stale. Default 7.',
      min: 1,
    },
    {
      key: 'offAverageThresholdPct',
      label: 'Flag net pay this far off the driver average',
      control: 'number',
      helpText:
        'As a fraction of the driver’s recent average (0.6 = 60%). Net pay more than 1.6× or less than 0.4× the average is flagged. Default 0.6.',
      min: 0,
    },
    {
      key: 'excludeDriverIds',
      label: 'Never review these drivers',
      control: 'driver-multiselect',
      helpText: 'Sally will skip settlements for these drivers entirely (e.g. owner-operators on a different process).',
    },
  ],
};

// ─── Anomaly signals (computed deterministically in hydrate) ────────────
//
// These are MATH, not LLM judgment. If ANY signal is true, the decide step
// CANNOT choose `approve` — the workflow forces `flag_anomaly` in code.

export const SettlementAnomalyKindSchema = z.enum([
  'negativeNet',
  'deductionsExceedGross',
  'noLineItems',
  'offAverage',
  'stale',
]);
export type SettlementAnomalyKind = z.infer<typeof SettlementAnomalyKindSchema>;

export const SettlementAnomalySignalsSchema = z.object({
  /** Net pay is below zero. */
  negativeNet: z.boolean(),
  /** Deductions exceed gross pay. */
  deductionsExceedGross: z.boolean(),
  /** No line items attached. */
  noLineItems: z.boolean(),
  /**
   * Net pay is more than the threshold off the driver's recent average.
   * `null` when the driver has no baseline yet (new driver) — that's "no
   * average to compare", NOT an anomaly.
   */
  offAverage: z.boolean().nullable(),
  /** Draft has been sitting longer than staleDays. */
  stale: z.boolean(),
});
export type SettlementAnomalySignals = z.infer<typeof SettlementAnomalySignalsSchema>;

/**
 * True iff at least one hard anomaly signal tripped. `offAverage === null`
 * (no baseline) is NOT an anomaly. Single source of truth for "this
 * settlement cannot be one-tap approved".
 */
export function hasAnomaly(signals: SettlementAnomalySignals): boolean {
  return (
    signals.negativeNet ||
    signals.deductionsExceedGross ||
    signals.noLineItems ||
    signals.offAverage === true ||
    signals.stale
  );
}

/** The ordered list of tripped signal kinds (for display + decide context). */
export function anomalyKinds(signals: SettlementAnomalySignals): SettlementAnomalyKind[] {
  const kinds: SettlementAnomalyKind[] = [];
  if (signals.negativeNet) kinds.push('negativeNet');
  if (signals.deductionsExceedGross) kinds.push('deductionsExceedGross');
  if (signals.noLineItems) kinds.push('noLineItems');
  if (signals.offAverage === true) kinds.push('offAverage');
  if (signals.stale) kinds.push('stale');
  return kinds;
}

// ─── Voice schemas (per LLM step) ───────────────────────────────────────

/** Perceive — summarize the settlement + which anomaly signals tripped. */
export const SettlementReviewPerceiveSchema = z.object({
  /** One short paragraph (≤280 chars) a human can read at a glance. */
  summary: z.string(),
  /** The signal kinds the perceive step read as tripped (mirrors hydrate math). */
  trippedSignals: z.array(SettlementAnomalyKindSchema),
  /** Whether the perceive step considers this a clean, in-range settlement. */
  looksClean: z.boolean(),
  // NOTE: Anthropic's structured-output endpoint rejects `minimum`/`maximum`
  // on number fields, so confidence is described in prose and range-enforced
  // by the prompt. Keep as plain z.number().
  confidence: z.number(),
});
export type SettlementReviewPerceive = z.infer<typeof SettlementReviewPerceiveSchema>;

/** Decide — pick the action. */
export const SettlementReviewDecideSchema = z.object({
  action: z.enum(['approve', 'flag_anomaly', 'no_action']),
  reasoning: z.string(),
  /** Present when action=flag_anomaly — the primary anomaly driving the flag. */
  anomalyKind: SettlementAnomalyKindSchema.optional(),
  confidence: z.number(),
});
export type SettlementReviewDecide = z.infer<typeof SettlementReviewDecideSchema>;

// ─── Outcomes (settlement-review-specific) ──────────────────────────────

export const SETTLEMENT_REVIEW_OUTCOMES = [
  'settlement_approved',
  'anomaly_flagged',
  'no_action_needed',
  'rejected_by_operator',
  'preflight_skipped',
  'preflight_aborted',
  'approval_expired',
  'escalated_to_human',
] as const;
export type SettlementReviewOutcome = (typeof SETTLEMENT_REVIEW_OUTCOMES)[number];
