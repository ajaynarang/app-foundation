import type {
  ApprovalArtifact,
  ApprovalDecisionHeader,
  DocumentExpiry as DocumentExpiryTypes,
} from '@sally/shared-types';

import type { DocumentExpiryDecideOutput, DocumentExpiryDraftOutput, DocumentExpiryHydrateOutput } from './step.types';

/**
 * Document Expiry approval-adapter — builds the canonical decision-sheet
 * payload (header, Sally's read, context bullets, confidence) the UI renders
 * above the artifact. Computed at read time from the episode's
 * hydrate/perceive/decide/draft step outputs.
 *
 * Mirrors the AR Follow-up adapter; the UI never branches on responsibility.
 */

export interface DocumentExpiryApprovalInputs {
  hydrate: DocumentExpiryHydrateOutput | null;
  perceive: DocumentExpiryTypes.DocumentExpiryPerceive | null;
  decide: DocumentExpiryDecideOutput | null;
  draft: DocumentExpiryDraftOutput | null;
  proposedAction: Record<string, unknown>;
}

export interface DocumentExpiryApprovalPayload {
  artifact: ApprovalArtifact | null;
  decisionHeader: ApprovalDecisionHeader | null;
  sallysRead: string | null;
  context: string[] | null;
  confidence: number | null;
}

export function buildDocumentExpiryApprovalPayload(input: DocumentExpiryApprovalInputs): DocumentExpiryApprovalPayload {
  const finding = input.hydrate?.entity.finding ?? null;

  return {
    artifact: buildArtifact(input),
    decisionHeader: buildHeader({ finding, decide: input.decide }),
    sallysRead: buildSallysRead(input.perceive),
    context: buildContext({ finding, perceive: input.perceive, hydrate: input.hydrate }),
    confidence: pickConfidence(input.draft, input.decide, input.perceive),
  };
}

// ─── Artifact ────────────────────────────────────────────────────────────

function buildArtifact(input: DocumentExpiryApprovalInputs): ApprovalArtifact | null {
  const channel = input.decide?.channel ?? channelFromProposed(input.proposedAction);
  const to = input.draft?.to ?? (typeof input.proposedAction.to === 'string' ? input.proposedAction.to : null);
  if (!to || !channel) {
    return fallbackArtifact(input.proposedAction);
  }

  const subject =
    input.draft?.subject ?? (typeof input.proposedAction.subject === 'string' ? input.proposedAction.subject : null);
  const emailBody =
    input.draft?.body ?? (typeof input.proposedAction.body === 'string' ? input.proposedAction.body : null);
  const smsBody =
    input.draft?.smsBody ?? (typeof input.proposedAction.smsBody === 'string' ? input.proposedAction.smsBody : null);

  // The operator-facing body: email body when present, else SMS text.
  const body = emailBody ?? smsBody;
  if (!body) {
    return fallbackArtifact(input.proposedAction);
  }

  return {
    kind: 'message',
    channel,
    to,
    subject: subject ?? null,
    body,
  };
}

function fallbackArtifact(proposed: Record<string, unknown>): ApprovalArtifact {
  return {
    kind: 'composite',
    blocks: Object.entries(proposed)
      .filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
      .map(([k, v]) => ({ type: 'field' as const, label: k, value: String(v) })),
  };
}

// ─── Decision header ─────────────────────────────────────────────────────

function buildHeader(input: {
  finding: DocumentExpiryHydrateOutput['entity']['finding'] | null;
  decide: DocumentExpiryDecideOutput | null;
}): ApprovalDecisionHeader | null {
  if (!input.finding) return null;
  const escalating = input.decide?.action === 'escalate_to_admin';

  const title = escalating
    ? `Escalate to admin — ${input.finding.driverName}`
    : `Reminder: ${input.finding.driverName} — ${input.finding.credentialLabel}`;

  const icon = escalating ? 'AlertTriangle' : 'BellRing';

  const datePhrase = input.finding.dueDate
    ? input.finding.daysUntilExpiry != null && input.finding.daysUntilExpiry < 0
      ? `expired ${Math.abs(input.finding.daysUntilExpiry)} days ago`
      : `expires ${input.finding.dueDate}`
    : 'expiry date unknown';

  const entityMeta = `${input.finding.credentialLabel} · ${datePhrase} · ${input.finding.severity}`;

  return { icon, title, entityMeta };
}

// ─── Sally's 1-line read ─────────────────────────────────────────────────

function buildSallysRead(perceive: DocumentExpiryTypes.DocumentExpiryPerceive | null): string | null {
  if (!perceive?.summary) return null;
  const first = perceive.summary.split(/(?<=[.!?])\s+/)[0];
  return first ?? perceive.summary;
}

// ─── Context bullets (up to 3) ───────────────────────────────────────────

function buildContext(input: {
  finding: DocumentExpiryHydrateOutput['entity']['finding'] | null;
  perceive: DocumentExpiryTypes.DocumentExpiryPerceive | null;
  hydrate: DocumentExpiryHydrateOutput | null;
}): string[] | null {
  const bullets: string[] = [];

  if (input.finding?.severity) {
    bullets.push(
      input.finding.severity === 'CRITICAL'
        ? 'Critical — credential expired or driver hauling'
        : 'Warning — credential expiring soon',
    );
  }

  if (input.perceive?.routeTo) {
    bullets.push(
      input.perceive.routeTo === 'admin' ? 'Routed to admin (operational decision)' : 'Routed to the driver',
    );
  }

  const prior = input.hydrate?.entity.priorReminderCount ?? 0;
  bullets.push(
    prior > 0 ? `${prior} prior reminder${prior === 1 ? '' : 's'} recently` : 'No recent reminders for this credential',
  );

  const trimmed = bullets.filter((b) => b && b.trim().length > 0).slice(0, 3);
  return trimmed.length > 0 ? trimmed : null;
}

// ─── Confidence ──────────────────────────────────────────────────────────

function pickConfidence(
  draft: DocumentExpiryDraftOutput | null,
  decide: DocumentExpiryDecideOutput | null,
  perceive: DocumentExpiryTypes.DocumentExpiryPerceive | null,
): number | null {
  const raw = draft?.confidence ?? decide?.confidence ?? perceive?.confidence;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.max(0, Math.min(1, raw));
}

// ─── Utilities ───────────────────────────────────────────────────────────

function channelFromProposed(proposed: Record<string, unknown>): DocumentExpiryDecideOutput['channel'] | null {
  const c = proposed.channel;
  return c === 'sms' || c === 'email' || c === 'both' ? c : null;
}
