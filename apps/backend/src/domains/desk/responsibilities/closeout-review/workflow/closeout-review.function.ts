import type { Inngest, InngestFunction } from 'inngest';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';

import { closeStep } from '../../../shared-steps/close.step';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';
import type { CloseoutDraftOutput } from '../step.types';

// String literals instead of the ApprovalDecision enum to sidestep the
// pre-existing Prisma 7.3 client-export issue (matches ar-followup.function).
const DECISION_APPROVED = 'APPROVED' as const;
const DECISION_EDITED = 'EDITED' as const;

const MAX_RETRIES = 3;

/** Which step-kind was about to run — labels the auto-escalate outcomeNote. */
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

const EXECUTE_TOOL = 'generate-invoice';

/**
 * Closeout Review workflow handler — extracted from the factory so it can be
 * unit-tested directly with a fake Inngest `step` object (see spec). The
 * Inngest wrapper (retries, concurrency, dedupe) stays in the factory below.
 *
 * Shape mirrors ar-followup.function: a try block of step.run(...) calls with
 * a top-level catch that auto-escalates a terminal step failure (closes the
 * episode via a DISTINCT step id so Inngest doesn't memoize it against the
 * success-path close, then re-throws so the run is logged as failed).
 *
 * Closeout is act-shaped, not message-shaped: the only act is
 * generate-invoice, which creates a DRAFT invoice from the load's LoadCharge
 * rows. Under SUPERVISED (the default) the gate always requires approval.
 */
export const closeoutReviewHandler = async ({
  event,
  step,
}: {
  event: {
    data: {
      episodeId: string;
      tenantId: number;
      loadNumber: string;
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
  const { episodeId, loadNumber } = event.data;

  let failedKind: FailedKind = 'hydrate';

  try {
    // ── hydrate: load context + readiness + charges + memory + preflight ─
    const ctx = await step.run('hydrate', () => hydrateStep({ episodeId, responsibilityKey: 'closeout_review' }));
    if (ctx.preflight.action !== 'proceed') {
      failedKind = 'close';
      // skip → no_action (blocker flagged); abort → preflight_aborted.
      // Both are non-decisions Sally made deterministically, so the
      // transition fires only for the no_action skip (drives memory).
      const isNoAction = ctx.preflight.action === 'skip';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome:
            ctx.preflight.outcome ?? (isNoAction ? DESK_OUTCOMES.NO_ACTION_NEEDED : DESK_OUTCOMES.PREFLIGHT_ABORTED),
          outcomeNote: ctx.preflight.reason,
          transition: isNoAction ? 'no_action' : undefined,
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── perceive → decide ────────────────────────────────────────────
    failedKind = 'perceive';
    const perception = await step.run('perceive', () => perceiveStep({ episodeId, ctx }));
    failedKind = 'decide';
    const decision = await step.run('decide', () => decideStep({ episodeId, ctx, perception }));

    // ── no-action branch — early exit, no gate, no execute ───────────
    if (decision.action === 'no_action') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
          outcomeNote: decision.blockerReason ?? decision.reasoning,
          transition: 'no_action',
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── draft_invoice branch — draft → gate → (approve | retry up to 3) ─
    let rejectionReason: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      failedKind = 'draft';
      const drafted: CloseoutDraftOutput = await step.run(`draft-${attempt}`, () =>
        draftStep({ episodeId, ctx, perception, decision, rejectionReason }),
      );

      failedKind = 'gate';
      const gateResult = await step.run(`gate-generate-invoice-${attempt}`, () =>
        gateStep({
          episodeId,
          tool: EXECUTE_TOOL,
          proposedArgs: { loadNumber },
          proposedAction: drafted as unknown as Record<string, unknown>,
        }),
      );

      if (!gateResult.needsApproval) {
        failedKind = 'execute';
        await step.run(`execute-generate-invoice-${attempt}`, () =>
          executeStep({ episodeId, tool: EXECUTE_TOOL, args: { loadNumber } }),
        );
        failedKind = 'close';
        const out = await step.run('close', () =>
          closeStep({
            episodeId,
            outcome: DESK_OUTCOMES.INVOICE_DRAFTED,
            outcomeNote: `drafted on attempt ${attempt + 1}`,
            transition: 'auto_send',
          }),
        );
        failedKind = 'unknown';
        return out;
      }

      failedKind = 'wait-approval';
      // Correlate by data.episodeId (same pattern as ar-followup): the
      // triggering event carries it and the approval event carries it; only
      // one wait is live per episode at a time.
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
      if (approval.data.decision === DECISION_APPROVED || approval.data.decision === DECISION_EDITED) {
        // generate-invoice always bills from the load's LoadCharge rows, so
        // an EDITED preview can't change WHAT gets invoiced — the invoice is
        // derived from real charges, not the preview. We always execute with
        // the canonical { loadNumber }. (Edits change the operator's mental
        // model / memory, not the generated document.)
        failedKind = 'execute';
        await step.run(`execute-generate-invoice-${attempt}`, () =>
          executeStep({ episodeId, tool: EXECUTE_TOOL, args: { loadNumber } }),
        );
        failedKind = 'close';
        const out = await step.run('close', () =>
          closeStep({
            episodeId,
            outcome: DESK_OUTCOMES.INVOICE_DRAFTED,
            outcomeNote: `approved on attempt ${attempt + 1}${
              approval.data.decision === DECISION_EDITED ? ' (edited)' : ''
            }`,
            transition: approval.data.decision === DECISION_EDITED ? 'approve_edited' : 'approve_unchanged',
          }),
        );
        failedKind = 'unknown';
        return out;
      }
      // REJECTED without terminate — loop; next draft receives the reason.
      rejectionReason = (approval.data.rejectionReason as string | undefined) ?? 'Previous preview rejected';
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
    // Auto-escalate on terminal step failure. A failed generate-invoice
    // (e.g. a race that created a manual invoice between hydrate and execute,
    // which the tool surfaces via result.isError → executeStep throws) lands
    // here and closes the episode as ESCALATED — never as a false success,
    // and never a duplicate invoice.
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

/**
 * Closeout Review workflow — Inngest function. Listens for
 * `sally/desk.closeout_review.run` events published by TriggerService (cron)
 * + ResponsibilityController (manual run).
 *
 * Idempotency: event id = dedupe key (`closeout_review:load:<loadNumber>:<date>`)
 * so Inngest rejects duplicate cron firings for the same load the same day.
 * Mirrors the Postgres partial unique index on desk_episodes.
 *
 * Concurrency: keyed per tenant, capped at 5.
 */
export function createCloseoutReviewFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'closeout-review',
      name: 'Closeout Review',
      concurrency: { key: 'event.data.tenantId', limit: 5 },
      idempotency: 'event.data.idempotencyKey',
      triggers: [{ event: 'sally/desk.closeout_review.run' }],
    },
    closeoutReviewHandler as unknown as Parameters<Inngest['createFunction']>[1],
  );
}
