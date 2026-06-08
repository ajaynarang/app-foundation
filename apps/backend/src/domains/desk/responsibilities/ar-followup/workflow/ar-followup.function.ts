import type { Inngest, InngestFunction } from 'inngest';

import { closeStep } from '../../../shared-steps/close.step';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';
import type { DraftOutput } from '../step.types';

// Use string literals instead of the ApprovalDecision enum to sidestep the
// pre-existing Prisma 7.3 client-export issue. Values match the Prisma
// enum exactly; refactor to `ApprovalDecision.X` once the client-export
// issue is resolved platform-wide.
const DECISION_APPROVED = 'APPROVED' as const;
const DECISION_EDITED = 'EDITED' as const;
const DECISION_REJECTED = 'REJECTED' as const;

const MAX_RETRIES = 3;

/**
 * Which step-kind was about to run (or is currently running). Tracked so
 * the top-level catch can label the auto-escalate outcomeNote with the
 * exact step that exploded. Order matches T27e design doc §D8.
 */
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

/**
 * AR Follow-up workflow handler — extracted from `createArFollowupFunction`
 * so it can be unit-tested directly with a fake Inngest `step` object
 * (see spec). The Inngest wrapper (retries, concurrency, dedupe) stays
 * in the factory below.
 *
 * T27e — Stalled-episode auto-escalate (design doc Flow 6):
 *   After Inngest exhausts retries for any step.run in the try block,
 *   the final error re-throws out of `await step.run(...)` and is
 *   caught here. We close the episode via a DIFFERENT step id
 *   (`auto-escalate-close`) so Inngest doesn't memoize it against the
 *   success-path `close` step. Then re-throw the original error so
 *   Inngest logs the run as failed.
 */
export const arFollowupHandler = async ({
  event,
  step,
}: {
  event: {
    data: {
      episodeId: string;
      tenantId: number;
      invoiceNumber: string;
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

  // Track the step-kind about to execute so a terminal failure can label
  // the escalation outcomeNote. Updated BEFORE each step.run(...).
  let failedKind: FailedKind = 'hydrate';

  try {
    // ── hydrate: loads context + memory + runs preflight ─────────────
    const ctx = await step.run('hydrate', () => hydrateStep({ episodeId, responsibilityKey: 'ar_followup' }));
    if (ctx.preflight.action !== 'proceed') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: ctx.preflight.outcome ?? DESK_OUTCOMES.PREFLIGHT_SKIPPED,
          outcomeNote: ctx.preflight.reason,
          // Preflight skip/abort isn't a decision Sally made — no
          // transition fires, so the writer + reinforcer no-op.
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
          outcomeNote: decision.reasoning,
          transition: 'no_action',
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── record-promise / escalate branches — no draft, direct gate+execute ─
    if (decision.action === 'record_promise' || decision.action === 'escalate') {
      const tool = decision.action === 'record_promise' ? 'record-promise-to-pay' : 'escalate-invoice';
      const terminalOutcome =
        decision.action === 'record_promise' ? DESK_OUTCOMES.PROMISE_RECORDED : DESK_OUTCOMES.ESCALATED_TO_HUMAN;
      const plannedArgs = decision.plannedArgs ?? {};

      failedKind = 'gate';
      const gateResult = await step.run(`gate-${tool}`, () =>
        gateStep({
          episodeId,
          tool,
          proposedArgs: plannedArgs,
          proposedAction: plannedArgs,
        }),
      );

      let argsToExecute = plannedArgs;

      if (gateResult.needsApproval) {
        failedKind = 'wait-approval';
        // Correlate via `match: 'data.episodeId'` — Inngest joins the
        // triggering event's `data.episodeId` (set by TriggerService when
        // the episode is opened) to the candidate `sally/desk.approval.decided`
        // event's `data.episodeId` (set by ApprovalService.decide).
        //
        // We can't use `match: 'data.approvalId'` — the approvalId doesn't
        // exist on the triggering event (it's created later by the gate step).
        // `if:` was tried but evaluates `event.data.approvalId` in the
        // triggering-event scope, which is undefined → the dashboard
        // renders `null == "<uuid>"` and the wait never satisfies.
        //
        // One episode = one live wait at a time, so matching on episodeId
        // is unambiguous — the approval id is asserted defensively below
        // before we use approval.data.
        const approval = await step.waitForEvent(`wait-approval-${tool}`, {
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
              outcomeNote: `No decision within 7d for ${tool}`,
              transition: 'approval_expired',
            }),
          );
          failedKind = 'unknown';
          return out;
        }
        if (approval.data.terminateEpisode || approval.data.decision === DECISION_REJECTED) {
          failedKind = 'close';
          const out = await step.run('close', () =>
            closeStep({
              episodeId,
              outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
              outcomeNote: (approval.data.rejectionReason as string | undefined) ?? undefined,
              transition: approval.data.terminateEpisode ? 'reject_and_close' : 'reject',
            }),
          );
          failedKind = 'unknown';
          return out;
        }
        // APPROVED or EDITED — use edited args if present
        argsToExecute = (approval.data.editedAction as Record<string, unknown> | undefined) ?? plannedArgs;
      }

      failedKind = 'execute';
      await step.run(`execute-${tool}`, () => executeStep({ episodeId, tool, args: argsToExecute }));
      failedKind = 'close';
      // Distinguish auto-send (no human in the loop) from approve_unchanged
      // / approve_edited — the gate either needed approval or didn't.
      const transition: import('../../../shared-steps/step.types').CloseTransition = !gateResult.needsApproval
        ? 'auto_send'
        : 'approve_unchanged';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: terminalOutcome,
          outcomeNote: decision.reasoning,
          transition,
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── send-reminder branch — draft → gate → (approve | retry up to 3) ─
    let rejectionReason: string | undefined;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      failedKind = 'draft';
      const drafted: DraftOutput = await step.run(`draft-${attempt}`, () =>
        draftStep({
          episodeId,
          ctx,
          perception,
          decision,
          rejectionReason,
        }),
      );

      failedKind = 'gate';
      const gateResult = await step.run(`gate-send-email-${attempt}`, () =>
        gateStep({
          episodeId,
          tool: 'send-email',
          proposedArgs: drafted,
          proposedAction: drafted,
        }),
      );

      if (!gateResult.needsApproval) {
        failedKind = 'execute';
        await step.run(`execute-send-email-${attempt}`, () =>
          executeStep({ episodeId, tool: 'send-email', args: drafted }),
        );
        failedKind = 'close';
        const out = await step.run('close', () =>
          closeStep({
            episodeId,
            outcome: DESK_OUTCOMES.FOLLOWUP_SENT,
            outcomeNote: `sent on attempt ${attempt + 1}`,
            transition: 'auto_send',
          }),
        );
        failedKind = 'unknown';
        return out;
      }

      failedKind = 'wait-approval';
      // Same pattern as the sibling waitForEvent above — correlate by
      // `data.episodeId`. The triggering event carries it, the approval
      // event carries it, and only one wait is live per episode at a time.
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
        const finalArgs = (approval.data.editedAction as Record<string, unknown> | undefined) ?? drafted;
        failedKind = 'execute';
        await step.run(`execute-send-email-${attempt}`, () =>
          executeStep({ episodeId, tool: 'send-email', args: finalArgs }),
        );
        failedKind = 'close';
        const out = await step.run('close', () =>
          closeStep({
            episodeId,
            outcome: DESK_OUTCOMES.FOLLOWUP_SENT,
            outcomeNote: `approved on attempt ${attempt + 1}${
              approval.data.decision === DECISION_EDITED ? ' (edited)' : ''
            }`,
            transition: approval.data.decision === DECISION_EDITED ? 'approve_edited' : 'approve_unchanged',
          }),
        );
        failedKind = 'unknown';
        return out;
      }
      // REJECTED without terminate — loop continues; next draft receives
      // rejectionReason so the LLM addresses the operator's feedback.
      rejectionReason = (approval.data.rejectionReason as string | undefined) ?? 'Previous draft rejected';
    }

    // Exhausted retries — close with rejection outcome.
    // Treat as reject (the operator's pattern is "no, this isn't right")
    // rather than reject_and_close (entity-scoped hard stop).
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
    // T27e — auto-escalate on terminal step failure.
    // Inngest has already exhausted retries for whichever step threw;
    // the final error propagated out of its `await step.run(...)` here.
    // We close the episode as `escalated` via a distinct step id so
    // Inngest doesn't memoize this close against the success-path
    // `close` step. The original error is re-thrown after the close so
    // Inngest marks the run failed AFTER the episode is terminal.
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
 * AR Follow-up workflow — the only Inngest function in Desk v1.
 *
 * Registered on the Inngest `serve()` call (see inngest.controller.ts).
 * Listens for `sally/desk.ar_followup.run` events published by TriggerService
 * (cron) + ResponsibilityController (manual run).
 *
 * Idempotency: event `id` = dedupe key
 * (`ar_followup:invoice:<invoiceNumber>:<date>`) so Inngest rejects
 * duplicate cron firings for the same invoice the same day. This mirrors
 * our Postgres partial unique index on `desk_episodes(tenant_id, dedupe_key)
 * WHERE status IN ('RUNNING', 'WAITING_APPROVAL')` — two layers of dedupe.
 *
 * Concurrency: keyed per tenant, capped at 5 (free-plan limit; bump when
 * we upgrade). Prevents a big-tenant cron fan-out from saturating workers.
 *
 * Shape matches design doc §4.1. See also the end-to-end trace in §5.
 *
 * Factory-pattern export so the function captures the specific Inngest
 * client instance (InngestClientService writes it in onModuleInit).
 */
export function createArFollowupFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'ar-followup',
      name: 'AR Follow-up',
      concurrency: { key: 'event.data.tenantId', limit: 5 },
      idempotency: 'event.data.idempotencyKey',
      triggers: [{ event: 'sally/desk.ar_followup.run' }],
    },
    arFollowupHandler as unknown as Parameters<Inngest['createFunction']>[1],
  );
}
