import type {
  ApprovalArtifact,
  ApprovalDecisionHeader,
  CloseoutReview as CloseoutReviewTypes,
} from '@sally/shared-types';

import type { CloseoutHydrateOutput } from './step.types';

/**
 * Closeout Review approval-adapter — builds the canonical decision-sheet
 * payload the UI renders above the artifact: header, Sally's 1-line read,
 * context bullets, confidence. Computed at read time from the episode's
 * hydrate/perceive/decide/draft step outputs.
 *
 * The artifact is a `composite` block stream (customer / total fields + a
 * line-item list), NOT a bespoke 'invoice' kind. The canonical sheet renders
 * composite blocks for any responsibility with zero frontend changes — the
 * UI never branches on responsibility. This is the same shape AR uses for
 * its non-email actions.
 */

export interface CloseoutReviewApprovalInputs {
  hydrate: CloseoutHydrateOutput | null;
  perceive: CloseoutReviewTypes.CloseoutReviewPerceive | null;
  decide: CloseoutReviewTypes.CloseoutReviewDecide | null;
  draft: CloseoutReviewTypes.CloseoutReviewDraft | null;
  /** Raw action stored on the approval row (fallback when draft is missing). */
  proposedAction: Record<string, unknown>;
}

export interface CloseoutReviewApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  sallysRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

export function buildCloseoutReviewApprovalPayload(input: CloseoutReviewApprovalInputs): CloseoutReviewApprovalPayload {
  return {
    artifact: buildArtifact(input),
    decisionHeader: buildHeader(input),
    sallysRead: buildSallysRead(input.perceive),
    context: buildContext(input),
    confidence: pickConfidence(input.draft, input.decide, input.perceive),
  };
}

// ─── Artifact ────────────────────────────────────────────────────────────

function buildArtifact(input: CloseoutReviewApprovalInputs): ApprovalArtifact | null {
  const draft = input.draft;
  if (draft) {
    const lineItemStrings = draft.lineItems.map(
      (li) =>
        `${li.description} — ${li.quantity} × $${li.unitPriceDollars.toFixed(2)} = $${li.totalDollars.toFixed(2)}`,
    );
    return {
      kind: 'composite',
      summary: draft.summary,
      blocks: [
        { type: 'field', label: 'Customer', value: draft.customerName },
        { type: 'field', label: 'Total', value: `$${draft.totalDollars.toFixed(2)}`, mono: true },
        ...(lineItemStrings.length > 0 ? [{ type: 'list' as const, label: 'Line items', items: lineItemStrings }] : []),
      ],
    };
  }

  // Generic fallback — render the raw action as a list of fields so the
  // operator can still read it when no draft is present.
  const primitiveEntries = Object.entries(input.proposedAction).filter(
    (entry): entry is [string, string | number | boolean] =>
      typeof entry[1] === 'string' || typeof entry[1] === 'number' || typeof entry[1] === 'boolean',
  );
  return {
    kind: 'composite',
    blocks: primitiveEntries.map(([k, v]) => ({ type: 'field' as const, label: k, value: String(v) })),
  };
}

// ─── Decision header ─────────────────────────────────────────────────────

function buildHeader(input: CloseoutReviewApprovalInputs): ApprovalDecisionHeader | null {
  const load = input.hydrate?.entity.load ?? null;
  if (!load) return null;

  const customerName = load.customerName;
  const total = input.draft?.totalDollars ?? input.hydrate?.entity.charges.billableTotalDollars ?? null;
  const agePhrase = `delivered ${load.hoursSinceDelivery}h ago`;
  const entityMeta =
    total != null
      ? `Load ${load.loadNumber} · $${total.toFixed(2)} · ${agePhrase}`
      : `Load ${load.loadNumber} · ${agePhrase}`;

  return {
    icon: 'FileText',
    title: `Invoice ${customerName}`,
    entityMeta,
  };
}

// ─── Sally's 1-line read ─────────────────────────────────────────────────

function buildSallysRead(perceive: CloseoutReviewTypes.CloseoutReviewPerceive | null): string | null {
  if (!perceive?.summary) return null;
  const first = perceive.summary.split(/(?<=[.!?])\s+/)[0];
  return first ?? perceive.summary;
}

// ─── Context bullets (up to 3) ───────────────────────────────────────────

function buildContext(input: CloseoutReviewApprovalInputs): string[] | null {
  const bullets: string[] = [];
  const load = input.hydrate?.entity.load ?? null;
  const charges = input.hydrate?.entity.charges ?? null;
  const readiness = input.hydrate?.entity.readiness ?? null;

  if (load) {
    bullets.push(`Delivered ${load.hoursSinceDelivery}h ago, never invoiced`);
  }
  if (charges) {
    const itemCount = input.draft?.lineItems.length ?? charges.items.length;
    bullets.push(
      `${itemCount} billable charge${itemCount === 1 ? '' : 's'} · $${charges.billableTotalDollars.toFixed(2)}`,
    );
  }
  if (readiness) {
    bullets.push(
      readiness.hasBlockers
        ? `Billing blockers: ${readiness.blockers.join('; ')}`
        : 'Documents on file — ready to bill',
    );
  }

  const trimmed = bullets.filter((b) => b && b.trim().length > 0).slice(0, 3);
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Confidence ──────────────────────────────────────────────────────────

function pickConfidence(
  draft: CloseoutReviewTypes.CloseoutReviewDraft | null,
  decide: CloseoutReviewTypes.CloseoutReviewDecide | null,
  perceive: CloseoutReviewTypes.CloseoutReviewPerceive | null,
): number | null {
  const raw = draft?.confidence ?? decide?.confidence ?? perceive?.confidence;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw));
}
