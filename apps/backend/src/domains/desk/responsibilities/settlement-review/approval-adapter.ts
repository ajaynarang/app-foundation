import type {
  ApprovalArtifact,
  ApprovalDecisionHeader,
  SettlementReview as SettlementReviewTypes,
} from '@app/shared-types';
import { SettlementReview } from '@app/shared-types';

import type { SettlementReviewHydrateOutput } from './step.types';

/**
 * Settlement Review approval-adapter — builds the canonical decision-sheet
 * payload the UI renders above the artifact: header, Sally's 1-line read,
 * context bullets, confidence. Computed at read time from the episode's
 * hydrate/perceive/decide step outputs.
 *
 * Per-responsibility by design: this owns how a settlement maps onto the
 * decision surface. The UI never branches on responsibility — it renders the
 * shape the adapter returns. We use the universal `composite` artifact kind
 * (field/body/list/flag blocks) so no new frontend renderer is needed.
 *
 * The one-tap Approve action is offered ONLY when decide.action === 'approve'
 * (clean). Anomalies render with a critical flag and no one-tap approve — the
 * operator must open the settlement module to fix. Sally never auto-approves
 * a settlement she doesn't trust.
 */

export interface SettlementReviewApprovalInputs {
  /** Latest hydrate step output for the episode. Required for entity meta + signals. */
  hydrate: SettlementReviewHydrateOutput | null;
  /** Latest perceive output. Drives Sally's 1-line read. */
  perceive: SettlementReviewTypes.SettlementReviewPerceive | null;
  /** Latest decide output. Used to pick the header verb + anomaly flag. */
  decide: SettlementReviewTypes.SettlementReviewDecide | null;
  /** The raw action stored on the approval row (fallback when decide is missing). */
  proposedAction: Record<string, unknown>;
}

export interface SettlementReviewApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  sallysRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

const ANOMALY_LABELS: Record<SettlementReviewTypes.SettlementAnomalyKind, string> = {
  negativeNet: 'Net pay is negative',
  deductionsExceedGross: 'Deductions exceed gross pay',
  noLineItems: 'No loads attached',
  offAverage: 'Net pay is well off this driver’s average',
  stale: 'Draft has been sitting unactioned',
};

/**
 * Build the canonical approval-sheet payload for a Settlement Review episode.
 * Every field degrades gracefully to null so the UI renders defaults.
 */
export function buildSettlementReviewApprovalPayload(
  input: SettlementReviewApprovalInputs,
): SettlementReviewApprovalPayload {
  const settlement = input.hydrate?.entity.settlement ?? null;
  const signals = input.hydrate?.entity.signals ?? null;
  const baseline = input.hydrate?.entity.baseline ?? null;

  return {
    artifact: buildArtifact(settlement, signals),
    decisionHeader: buildHeader(settlement, input.decide),
    sallysRead: buildSallysRead(input.perceive, signals),
    context: buildContext(settlement, signals, baseline),
    confidence: pickConfidence(input.decide, input.perceive),
  };
}

// ─── Artifact (composite) ────────────────────────────────────────────────

function buildArtifact(
  settlement: SettlementReviewHydrateOutput['entity']['settlement'] | null,
  signals: SettlementReviewTypes.SettlementAnomalySignals | null,
): ApprovalArtifact | null {
  if (!settlement) return null;

  const blocks: Extract<ApprovalArtifact, { kind: 'composite' }>['blocks'] = [
    { type: 'field', label: 'Driver', value: settlement.driverName },
    { type: 'field', label: 'Settlement', value: settlement.settlementNumber, mono: true },
    { type: 'field', label: 'Period', value: formatPeriod(settlement.periodStart, settlement.periodEnd) },
    { type: 'field', label: 'Gross', value: dollars(settlement.grossPayCents), mono: true },
    { type: 'field', label: 'Deductions', value: dollars(settlement.deductionsCents), mono: true },
    { type: 'field', label: 'Net pay', value: dollars(settlement.netPayCents), mono: true },
  ];

  // Anomaly flags first so they sit at the top of the breakdown — these are
  // why Sally is NOT offering a one-tap approve.
  if (signals) {
    for (const kind of SettlementReview.anomalyKinds(signals)) {
      blocks.unshift({ type: 'flag', variant: 'critical', text: ANOMALY_LABELS[kind] });
    }
  }

  if (settlement.lineItems.length > 0) {
    blocks.push({
      type: 'list',
      label: `Loads (${settlement.lineItems.length})`,
      items: settlement.lineItems.map(
        (li) => `${li.loadNumber ? `${li.loadNumber} — ` : ''}${li.description} · ${dollars(li.payAmountCents)}`,
      ),
    });
  }

  return {
    kind: 'composite',
    summary:
      signals && SettlementReview.hasAnomaly(signals)
        ? 'Review this settlement before approving — Sally flagged an anomaly.'
        : 'Approve this driver settlement.',
    blocks,
  };
}

// ─── Decision header ─────────────────────────────────────────────────────

function buildHeader(
  settlement: SettlementReviewHydrateOutput['entity']['settlement'] | null,
  decide: SettlementReviewTypes.SettlementReviewDecide | null,
): ApprovalDecisionHeader | null {
  if (!settlement) return null;
  const action = decide?.action ?? 'flag_anomaly';

  const title =
    action === 'approve'
      ? `Approve settlement for ${settlement.driverName}`
      : `Review settlement for ${settlement.driverName}`;

  const icon = action === 'approve' ? 'CheckCircle' : 'AlertTriangle';

  const entityMeta = `${settlement.settlementNumber} · net ${dollars(settlement.netPayCents)} · ${settlement.ageDays}d old`;

  return { icon, title, entityMeta };
}

// ─── Sally's 1-line read ─────────────────────────────────────────────────

function buildSallysRead(
  perceive: SettlementReviewTypes.SettlementReviewPerceive | null,
  signals: SettlementReviewTypes.SettlementAnomalySignals | null,
): string | null {
  // Anomaly read is deterministic — derive straight from the signal snapshot
  // so it's never softer than the math.
  if (signals && SettlementReview.hasAnomaly(signals)) {
    const kinds = SettlementReview.anomalyKinds(signals);
    return `⚠ ${kinds.map((k) => ANOMALY_LABELS[k]).join('; ')}`;
  }
  if (perceive?.summary) {
    const first = perceive.summary.split(/(?<=[.!?])\s+/)[0];
    return first ?? perceive.summary;
  }
  return 'Clean — within range';
}

// ─── Context bullets (up to 3) ───────────────────────────────────────────

function buildContext(
  settlement: SettlementReviewHydrateOutput['entity']['settlement'] | null,
  signals: SettlementReviewTypes.SettlementAnomalySignals | null,
  baseline: SettlementReviewHydrateOutput['entity']['baseline'] | null,
): string[] | null {
  if (!settlement) return null;
  const bullets: string[] = [];

  // 1. Average comparison
  if (baseline?.avgNetPayCents != null && baseline.sampleSize > 0) {
    bullets.push(
      `Net ${dollars(settlement.netPayCents)} vs ${dollars(baseline.avgNetPayCents)} avg over last ${baseline.sampleSize}`,
    );
  } else {
    bullets.push('No settlement history yet for this driver');
  }

  // 2. Age
  bullets.push(settlement.ageDays === 1 ? 'Drafted 1 day ago' : `Drafted ${settlement.ageDays} days ago`);

  // 3. Composition or anomaly count
  if (signals && SettlementReview.hasAnomaly(signals)) {
    const count = SettlementReview.anomalyKinds(signals).length;
    bullets.push(`${count} anomaly signal${count === 1 ? '' : 's'} tripped`);
  } else {
    bullets.push(
      `${settlement.lineItems.length} load${settlement.lineItems.length === 1 ? '' : 's'}, ${settlement.deductions.length} deduction${
        settlement.deductions.length === 1 ? '' : 's'
      }`,
    );
  }

  const trimmed = bullets.filter((b) => b && b.trim().length > 0).slice(0, 3);
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Confidence ──────────────────────────────────────────────────────────

function pickConfidence(
  decide: SettlementReviewTypes.SettlementReviewDecide | null,
  perceive: SettlementReviewTypes.SettlementReviewPerceive | null,
): number | null {
  const raw = decide?.confidence ?? perceive?.confidence;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw));
}

// ─── Utilities ───────────────────────────────────────────────────────────

function dollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${Math.abs(cents / 100).toFixed(2)}`;
}

function formatPeriod(start: string | null, end: string | null): string {
  if (start && end) return `${start} – ${end}`;
  if (start) return `from ${start}`;
  if (end) return `through ${end}`;
  return 'unknown';
}
