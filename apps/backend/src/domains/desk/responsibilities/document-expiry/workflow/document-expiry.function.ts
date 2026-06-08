import type { Inngest, InngestFunction } from 'inngest';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';

import { closeStep } from '../../../shared-steps/close.step';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';
import type { DocumentExpiryDecideOutput, DocumentExpiryDraftOutput } from '../step.types';

// String literals instead of the ApprovalDecision enum to sidestep the
// pre-existing Prisma 7.3 client-export issue. Values match the Prisma enum.
const DECISION_APPROVED = 'APPROVED' as const;
const DECISION_EDITED = 'EDITED' as const;
const DECISION_REJECTED = 'REJECTED' as const;

const MAX_RETRIES = 3;
const TOOL_SEND_EMAIL = 'send-email';
const TOOL_SEND_SMS = 'send-sms';

type FailedKind =
  | 'hydrate'
  | 'perceive'
  | 'decide'
  | 'draft'
  | 'gate'
  | 'execute'
  | 'wait-approval'
  | 'close'
  | 'unknown';

/** One concrete tool invocation derived from the draft + decided channel. */
interface PlannedSend {
  tool: typeof TOOL_SEND_EMAIL | typeof TOOL_SEND_SMS;
  args: Record<string, unknown>;
}

/**
 * Document Expiry workflow handler — mirrors the AR Follow-up handler but
 * for driver-credential renewals. Extracted from the factory so it can be
 * unit-tested with a fake Inngest `step` object.
 *
 * Branches:
 *   - preflight skip/abort → close early (no_action_needed)
 *   - decide.action === 'no_action' → close (no_action_needed)
 *   - send_reminder | escalate_to_admin → draft → gate → (approve | retry)
 *     → execute (one or two comms tools) → close
 *
 * On terminal step failure, auto-escalate via a distinct step id then
 * re-throw so Inngest marks the run failed (same T27e pattern as AR).
 */
export const documentExpiryHandler = async ({
  event,
  step,
}: {
  event: {
    data: {
      episodeId: string;
      tenantId: number;
      driverId: string;
      credentialType: string;
      idempotencyKey: string;
    };
  };
  step: {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
    waitForEvent: (
      id: string,
      opts: { event: string; match?: string; if?: string; timeout: string },
    ) => Promise<{ data: Record<string, unknown> } | null>;
  };
}) => {
  const { episodeId } = event.data;
  let failedKind: FailedKind = 'hydrate';

  try {
    // ── hydrate: context + memory + preflight ────────────────────────
    const ctx = await step.run('hydrate', () => hydrateStep({ episodeId, responsibilityKey: 'document_expiry' }));
    if (ctx.preflight.action !== 'proceed') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: ctx.preflight.outcome ?? DESK_OUTCOMES.NO_ACTION_NEEDED,
          outcomeNote: ctx.preflight.reason,
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── perceive → decide ─────────────────────────────────────────────
    failedKind = 'perceive';
    const perception = await step.run('perceive', () => perceiveStep({ episodeId, ctx }));
    failedKind = 'decide';
    const decision = await step.run('decide', () => decideStep({ episodeId, ctx, perception }));

    if (decision.action === 'no_action') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
          outcomeNote: decision.reasoning,
          transition: 'no_action',
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    const terminalOutcome =
      decision.action === 'escalate_to_admin' ? DESK_OUTCOMES.ESCALATED_TO_ADMIN : DESK_OUTCOMES.REMINDER_SENT;

    // ── send branch — draft → gate → (approve | retry up to 3) ────────
    let rejectionReason: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      failedKind = 'draft';
      const drafted: DocumentExpiryDraftOutput = await step.run(`draft-${attempt}`, () =>
        draftStep({ episodeId, ctx, perception, decision, rejectionReason }),
      );

      // The gate is created against the canonical proposed action (the
      // draft + decision) so the approval sheet renders the message.
      const proposedAction = buildProposedAction(decision, drafted);

      failedKind = 'gate';
      const gateResult = await step.run(`gate-${attempt}`, () =>
        gateStep({
          episodeId,
          tool: primaryTool(decision),
          proposedArgs: proposedAction,
          proposedAction,
        }),
      );

      let finalDecision = decision;
      let finalDraft = drafted;

      if (gateResult.needsApproval) {
        failedKind = 'wait-approval';
        const approval = await step.waitForEvent(`wait-approval-${attempt}`, {
          event: 'sally/desk.approval.decided',
          match: 'data.episodeId',
          timeout: '7d',
        });

        if (!approval) {
          failedKind = 'close';
          const out = await step.run('close', () =>
            closeStep({
              episodeId,
              outcome: DESK_OUTCOMES.APPROVAL_EXPIRED,
              outcomeNote: `No decision within 7d on draft attempt ${attempt + 1}`,
              transition: 'approval_expired',
            }),
          );
          failedKind = 'unknown';
          return out;
        }
        if (approval.data.terminateEpisode) {
          failedKind = 'close';
          const out = await step.run('close', () =>
            closeStep({
              episodeId,
              outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
              outcomeNote: (approval.data.rejectionReason as string | undefined) ?? 'operator chose Reject & close',
              transition: 'reject_and_close',
            }),
          );
          failedKind = 'unknown';
          return out;
        }
        if (approval.data.decision === DECISION_REJECTED) {
          // Loop continues; next draft receives the rejection reason.
          rejectionReason = (approval.data.rejectionReason as string | undefined) ?? 'Previous draft rejected';
          continue;
        }
        if (approval.data.decision === DECISION_APPROVED || approval.data.decision === DECISION_EDITED) {
          const edited = approval.data.editedAction as Record<string, unknown> | undefined;
          if (edited) {
            finalDraft = mergeEditedDraft(drafted, edited);
            finalDecision = mergeEditedDecision(decision, edited);
          }
          await runSends({
            step,
            episodeId,
            attempt,
            sends: planSends(finalDecision, finalDraft, event.data),
            setFailedKind: (k) => {
              failedKind = k;
            },
          });
          failedKind = 'close';
          const out = await step.run('close', () =>
            closeStep({
              episodeId,
              outcome: terminalOutcome,
              outcomeNote: `approved on attempt ${attempt + 1}${
                approval.data.decision === DECISION_EDITED ? ' (edited)' : ''
              }`,
              transition: approval.data.decision === DECISION_EDITED ? 'approve_edited' : 'approve_unchanged',
            }),
          );
          failedKind = 'unknown';
          return out;
        }
        // Unrecognized decision — loop to redraft defensively.
        rejectionReason = 'Previous draft rejected';
        continue;
      }

      // Not gated (Assisted/Autonomous auto-send).
      await runSends({
        step,
        episodeId,
        attempt,
        sends: planSends(finalDecision, finalDraft, event.data),
        setFailedKind: (k) => {
          failedKind = k;
        },
      });
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: terminalOutcome,
          outcomeNote: `sent on attempt ${attempt + 1}`,
          transition: 'auto_send',
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // Exhausted retries — close with rejection outcome.
    failedKind = 'close';
    const out = await step.run('close', () =>
      closeStep({
        episodeId,
        outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
        outcomeNote: `Retry cap (${MAX_RETRIES}) reached`,
        transition: 'reject',
      }),
    );
    failedKind = 'unknown';
    return out;
  } catch (err) {
    const msg = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await step.run('auto-escalate-close', () =>
      closeStep({
        episodeId,
        outcome: DESK_OUTCOMES.ESCALATED_TO_HUMAN,
        outcomeNote: `step ${failedKind} failed: ${msg}`,
        terminalStatus: 'ESCALATED',
      }),
    );
    throw err;
  }
};

// ─────────────────────────────────────────────────────────────────────────
// Helpers — pure
// ─────────────────────────────────────────────────────────────────────────

/** The tool the gate is scoped against (both comms tools share comms:send). */
function primaryTool(decision: DocumentExpiryDecideOutput): typeof TOOL_SEND_EMAIL | typeof TOOL_SEND_SMS {
  return decision.channel === 'sms' ? TOOL_SEND_SMS : TOOL_SEND_EMAIL;
}

/** Canonical proposed action stored on the approval row for the sheet. */
function buildProposedAction(
  decision: DocumentExpiryDecideOutput,
  draft: DocumentExpiryDraftOutput,
): Record<string, unknown> {
  return {
    channel: decision.channel,
    recipient: decision.recipient,
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    smsBody: draft.smsBody,
  };
}

/**
 * Translate the decided channel + draft into the concrete comms-tool calls.
 * Each send carries `driverId` + `credentialType` so the hydrate
 * recent-reminder check can attribute it to this (driver, credential).
 */
function planSends(
  decision: DocumentExpiryDecideOutput,
  draft: DocumentExpiryDraftOutput,
  meta: { driverId: string; credentialType: string },
): PlannedSend[] {
  const sends: PlannedSend[] = [];
  const tag = { _driverId: meta.driverId, _credentialType: meta.credentialType };

  const wantsEmail = decision.channel === 'email' || decision.channel === 'both';
  const wantsSms = decision.channel === 'sms' || decision.channel === 'both';

  if (wantsEmail && draft.subject && draft.body && isEmail(draft.to)) {
    sends.push({ tool: TOOL_SEND_EMAIL, args: { to: draft.to, subject: draft.subject, body: draft.body, ...tag } });
  }
  if (wantsSms && draft.smsBody) {
    // The SMS recipient is the E.164 phone — use draft.to when it's a phone,
    // otherwise the draft must carry the SMS body and a phone in `to`.
    const phone = isE164(draft.to) ? draft.to : null;
    if (phone) {
      sends.push({ tool: TOOL_SEND_SMS, args: { to: phone, message: draft.smsBody, ...tag } });
    }
  }
  return sends;
}

async function runSends(input: {
  step: { run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T> };
  episodeId: string;
  attempt: number;
  sends: PlannedSend[];
  setFailedKind: (k: FailedKind) => void;
}): Promise<void> {
  if (input.sends.length === 0) {
    throw new Error('execute: no sendable channel resolved from the draft (missing contact or body)');
  }
  let i = 0;
  for (const send of input.sends) {
    input.setFailedKind('execute');
    const idx = i++;
    await input.step.run(`execute-${send.tool}-${input.attempt}-${idx}`, () =>
      executeStep({ episodeId: input.episodeId, tool: send.tool, args: send.args }),
    );
  }
}

function mergeEditedDraft(
  draft: DocumentExpiryDraftOutput,
  edited: Record<string, unknown>,
): DocumentExpiryDraftOutput {
  return {
    ...draft,
    to: typeof edited.to === 'string' ? edited.to : draft.to,
    subject: 'subject' in edited ? (edited.subject as string | null) : draft.subject,
    body: 'body' in edited ? (edited.body as string | null) : draft.body,
    smsBody: 'smsBody' in edited ? (edited.smsBody as string | null) : draft.smsBody,
  };
}

function mergeEditedDecision(
  decision: DocumentExpiryDecideOutput,
  edited: Record<string, unknown>,
): DocumentExpiryDecideOutput {
  const channel = edited.channel;
  const recipient = edited.recipient;
  return {
    ...decision,
    channel: isChannel(channel) ? channel : decision.channel,
    recipient: isRecipient(recipient) ? recipient : decision.recipient,
  };
}

function isEmail(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
}

function isE164(v: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(v);
}

function isChannel(v: unknown): v is DocumentExpiryDecideOutput['channel'] {
  return v === 'sms' || v === 'email' || v === 'both';
}

function isRecipient(v: unknown): v is DocumentExpiryDecideOutput['recipient'] {
  return v === 'driver' || v === 'admin';
}

/**
 * Document Expiry workflow — Inngest function.
 *
 * Listens for `sally/desk.document_expiry.run` events published by
 * TriggerService (cron) + the manual-run endpoint.
 *
 * Idempotency: event `id` = dedupe key
 * (`document_expiry:driver:<driverId>:<credential>:<date>`). Dedupe is on
 * (driver, credential) — NOT findingId — because Shield re-creates findings
 * with new ids each audit, so a findingId key would re-open daily.
 *
 * Concurrency: keyed per tenant, capped at 5.
 */
export function createDocumentExpiryFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'document-expiry',
      name: 'Document Expiry',
      concurrency: { key: 'event.data.tenantId', limit: 5 },
      idempotency: 'event.data.idempotencyKey',
      triggers: [{ event: 'sally/desk.document_expiry.run' }],
    },
    documentExpiryHandler as unknown as Parameters<Inngest['createFunction']>[1],
  );
}
