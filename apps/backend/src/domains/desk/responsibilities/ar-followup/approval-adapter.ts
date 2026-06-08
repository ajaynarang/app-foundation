import type { ApprovalArtifact, ApprovalDecisionHeader, ArFollowup as ArFollowupTypes } from '@sally/shared-types';

import type { DraftOutput, HydrateOutput, PerceiveOutput } from './step.types';

/**
 * AR Follow-up approval-adapter — builds the canonical decision-sheet payload
 * that the UI renders above the artifact: header, Sally's 1-line read,
 * context bullets, confidence. Computed at read time from the episode's
 * hydrate/perceive/decide/draft step outputs.
 *
 * The adapter is per-responsibility by design: each one owns how its
 * operational context maps to the decision surface. The UI never branches
 * on responsibility — it just renders the shape the adapter returns.
 *
 * See .docs/plans/06-sally-ai/desk-approval-canonical-prototype.html (T23).
 */

export interface ArFollowupApprovalInputs {
  /** Latest hydrate step output for the episode. Required for entity meta + context. */
  hydrate: HydrateOutput | null;
  /** Latest perceive output. Drives Sally's 1-line read. */
  perceive: ArFollowupTypes.ArFollowupPerceive | null;
  /** Latest decide output. Used to pick the header title verb. */
  decide: ArFollowupTypes.ArFollowupDecide | null;
  /** Latest draft output. Populates the email artifact. */
  draft: ArFollowupTypes.ArFollowupDraft | null;
  /** The raw action stored on the approval row (fallback when draft is missing). */
  proposedAction: Record<string, unknown>;
}

export interface ArFollowupApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  sallysRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

/**
 * Build the canonical approval-sheet payload for an AR Follow-up episode.
 * Every field is optional from the caller's perspective — missing steps
 * degrade gracefully to null so the UI renders reasonable defaults.
 */
export function buildArFollowupApprovalPayload(input: ArFollowupApprovalInputs): ArFollowupApprovalPayload {
  const invoice = input.hydrate?.entity.invoice ?? null;
  const customerStats = input.hydrate?.entity.customerStats ?? null;
  const priorReminderCount = input.hydrate?.entity.priorReminderCount ?? 0;

  return {
    artifact: buildArtifact(input),
    decisionHeader: buildHeader({ invoice, decide: input.decide }),
    sallysRead: buildSallysRead(input.perceive),
    context: buildContext({ perceive: input.perceive, customerStats, priorReminderCount }),
    confidence: pickConfidence(input.draft, input.decide, input.perceive),
  };
}

// ─── Artifact ────────────────────────────────────────────────────────────
//
// send_reminder  → email artifact (from draft)
// record_promise → composite artifact (summary of what will be recorded)
// escalate       → composite artifact (summary of who + why)
// no_action      → (gate doesn't fire; no approval created)
// fallback       → raw proposedAction as composite field list

function buildArtifact(input: ArFollowupApprovalInputs): ApprovalArtifact | null {
  const action = input.decide?.action ?? inferActionFromProposed(input.proposedAction);

  if (action === 'send_reminder' && input.draft) {
    return {
      kind: 'email',
      to: input.draft.to,
      subject: input.draft.subject,
      body: input.draft.body,
      // Flags stay empty in v1 — plumbing is in place for future heuristics
      // (e.g. "second reminder", "breaks promise", "amount above cap").
    };
  }

  if (action === 'record_promise') {
    const args = input.proposedAction;
    const customerName = input.hydrate?.entity.invoice.customerName;
    const invoiceNumber = input.hydrate?.entity.invoice.invoiceNumber;
    const amount = input.hydrate?.entity.invoice.amount;
    return {
      kind: 'composite',
      summary: 'Record a promise-to-pay from this customer.',
      blocks: [
        ...(customerName ? [{ type: 'field' as const, label: 'Customer', value: customerName }] : []),
        ...(invoiceNumber && amount != null
          ? [
              {
                type: 'field' as const,
                label: 'Invoice',
                value: `${invoiceNumber} · $${amount.toFixed(2)}`,
                mono: true,
              },
            ]
          : []),
        ...(typeof args.payByDate === 'string'
          ? [{ type: 'field' as const, label: 'Pay by', value: args.payByDate }]
          : []),
        ...(typeof args.quote === 'string'
          ? [{ type: 'body' as const, format: 'text' as const, content: `"${args.quote}"` }]
          : []),
      ],
    };
  }

  if (action === 'escalate') {
    const args = input.proposedAction;
    const customerName = input.hydrate?.entity.invoice.customerName;
    const invoiceNumber = input.hydrate?.entity.invoice.invoiceNumber;
    const amount = input.hydrate?.entity.invoice.amount;
    return {
      kind: 'composite',
      summary: 'Escalate this overdue invoice to a human.',
      blocks: [
        ...(customerName ? [{ type: 'field' as const, label: 'Customer', value: customerName }] : []),
        ...(invoiceNumber && amount != null
          ? [
              {
                type: 'field' as const,
                label: 'Invoice',
                value: `${invoiceNumber} · $${amount.toFixed(2)}`,
                mono: true,
              },
            ]
          : []),
        ...(typeof args.reason === 'string' ? [{ type: 'field' as const, label: 'Reason', value: args.reason }] : []),
      ],
    };
  }

  // Generic fallback — render the raw action as a list of fields so the
  // operator can still read it. Future actions get richer artifacts as they
  // ship.
  return {
    kind: 'composite',
    blocks: Object.entries(input.proposedAction)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => ({ type: 'field' as const, label: k, value: String(v) })),
  };
}

// ─── Decision header ─────────────────────────────────────────────────────

function buildHeader(input: {
  invoice: HydrateOutput['entity']['invoice'] | null;
  decide: ArFollowupTypes.ArFollowupDecide | null;
}): ApprovalDecisionHeader | null {
  if (!input.invoice) return null;
  const action = input.decide?.action ?? 'send_reminder';

  const customerName = input.invoice.customerName;
  const title =
    action === 'record_promise'
      ? `Record promise-to-pay from ${customerName}`
      : action === 'escalate'
        ? `Escalate overdue invoice for ${customerName}`
        : `Send reminder to ${customerName}`;

  const icon = action === 'record_promise' ? 'FileText' : action === 'escalate' ? 'AlertTriangle' : 'Mail';

  const daysPhrase =
    input.invoice.daysFromDue > 0
      ? `${input.invoice.daysFromDue} days overdue`
      : input.invoice.daysFromDue === 0
        ? 'due today'
        : `${Math.abs(input.invoice.daysFromDue)} days until due`;

  const entityMeta = `Invoice ${input.invoice.invoiceNumber} · $${input.invoice.amount.toFixed(2)} · ${daysPhrase}`;

  return { icon, title, entityMeta };
}

// ─── Sally's 1-line read ─────────────────────────────────────────────────

function buildSallysRead(perceive: ArFollowupTypes.ArFollowupPerceive | null): string | null {
  if (!perceive?.summary) return null;
  // Trim to one sentence for the blockquote. The LLM is already constrained
  // to <=280 chars, but some latitude for multi-sentence output exists.
  const first = perceive.summary.split(/(?<=[.!?])\s+/)[0];
  return first ?? perceive.summary;
}

// ─── Context bullets (up to 3) ───────────────────────────────────────────

function buildContext(input: {
  perceive: ArFollowupTypes.ArFollowupPerceive | null;
  customerStats: HydrateOutput['entity']['customerStats'] | null;
  priorReminderCount: number;
}): string[] | null {
  const bullets: string[] = [];

  // 1. Payment-history signal (reliable payer vs risky)
  if (input.perceive?.paymentHistorySignal) {
    bullets.push(paymentHistoryBullet(input.perceive.paymentHistorySignal, input.customerStats));
  } else if (input.customerStats?.avgDaysLate != null) {
    bullets.push(`Pays on average ${input.customerStats.avgDaysLate.toFixed(0)} days after due`);
  }

  // 2. Last-contact / reminder cadence
  if (input.perceive?.lastContact) {
    bullets.push(lastContactBullet(input.perceive.lastContact));
  } else if (input.priorReminderCount > 0) {
    bullets.push(
      `${input.priorReminderCount} prior reminder${input.priorReminderCount === 1 ? '' : 's'} in last 30 days`,
    );
  } else {
    bullets.push('No reminders in the last 30 days');
  }

  // 3. Reminder number in the sequence
  if (input.priorReminderCount === 0) {
    bullets.push('First reminder for this invoice');
  } else {
    bullets.push(`Reminder ${input.priorReminderCount + 1} for this invoice`);
  }

  // Promise-to-pay note overrides the third bullet when present — most
  // operationally important signal.
  if (input.perceive?.promiseToPayOnFile?.exists) {
    const p = input.perceive.promiseToPayOnFile;
    bullets[2] = p.broken
      ? `Promise-to-pay broken (due ${p.dueDate ?? 'unknown'})`
      : `Promise-to-pay on file (due ${p.dueDate ?? 'unknown'})`;
  }

  const trimmed = bullets.filter((b) => b && b.trim().length > 0).slice(0, 3);
  return trimmed.length > 0 ? trimmed : null;
}

function paymentHistoryBullet(
  signal: ArFollowupTypes.ArFollowupPerceive['paymentHistorySignal'],
  stats: HydrateOutput['entity']['customerStats'] | null,
): string {
  const avgSuffix = stats?.avgDaysLate != null ? ` — avg ${stats.avgDaysLate.toFixed(0)} days late` : '';
  switch (signal) {
    case 'reliable':
      return `Reliable payer${avgSuffix}`;
    case 'slow_but_pays':
      return `Slow but pays${avgSuffix}`;
    case 'inconsistent':
      return `Inconsistent payer${avgSuffix}`;
    case 'risky':
      return `High-risk payer${avgSuffix}`;
    default:
      return `Payment history: ${signal}`;
  }
}

function lastContactBullet(contact: ArFollowupTypes.ArFollowupPerceive['lastContact']): string {
  switch (contact.kind) {
    case 'none':
      return 'No recent contact with this customer';
    case 'email_sent':
      return contact.daysAgo != null ? `Last reminder ${contact.daysAgo}d ago` : 'Reminder sent recently';
    case 'email_received':
      return contact.daysAgo != null ? `Customer replied ${contact.daysAgo}d ago` : 'Customer replied recently';
    case 'call_logged':
      return contact.daysAgo != null ? `Call logged ${contact.daysAgo}d ago` : 'Call logged recently';
    default:
      return `Last contact: ${contact.kind}`;
  }
}

// ─── Confidence ──────────────────────────────────────────────────────────

function pickConfidence(
  draft: ArFollowupTypes.ArFollowupDraft | null,
  decide: ArFollowupTypes.ArFollowupDecide | null,
  perceive: ArFollowupTypes.ArFollowupPerceive | null,
): number | null {
  // Prefer draft (terminal reasoning), fall back to decide, then perceive.
  const raw = draft?.confidence ?? decide?.confidence ?? perceive?.confidence;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw));
}

// ─── Utilities ───────────────────────────────────────────────────────────

/**
 * Infer the action when decide output isn't available (e.g. older episodes
 * or cases where the adapter runs after a partial step list). The shape of
 * the draft/proposedAction hints at send_reminder vs everything else.
 */
function inferActionFromProposed(proposed: Record<string, unknown>): ArFollowupTypes.ArFollowupDecide['action'] | null {
  if (typeof proposed.to === 'string' && typeof proposed.subject === 'string' && typeof proposed.body === 'string') {
    return 'send_reminder';
  }
  if (typeof proposed.payByDate === 'string' || 'quote' in proposed) {
    return 'record_promise';
  }
  if (typeof proposed.reason === 'string') {
    return 'escalate';
  }
  return null;
}
