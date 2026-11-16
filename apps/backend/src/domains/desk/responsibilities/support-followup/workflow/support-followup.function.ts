import type { Inngest, InngestFunction } from 'inngest';

import { ToolNames } from '../../../../ai/agent-contract/tool-names.constants';
import { reportDeskFunctionFailure } from '../../../core/inngest/desk-function-failure';
import { deskEscalationStep, deskStep } from '../../../core/inngest/desk-step';
import { closeStep } from '../../../shared-steps/close.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';
import type { CloseInput } from '../../../shared-steps/step.types';
import type { DraftOutput } from '../step.types';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';

export const SUPPORT_FOLLOWUP_RUN_EVENT = 'app/desk.support_followup.run';
const APPROVAL_DECIDED_EVENT = 'app/desk.approval.decided';
const ACT_TOOL = ToolNames.REPLY_TO_SUPPORT_TICKET;

/** How many times a rejected draft is rewritten before the episode closes as rejected. */
const MAX_REDRAFTS = 3;
/** Matches `ApprovalService.DEFAULT_EXPIRY_DAYS`. */
const APPROVAL_TIMEOUT = '7d';

/** The step about to run, so a terminal failure can say which one it was. */
type Stage = 'hydrate' | 'perceive' | 'decide' | 'draft' | 'gate' | 'wait-approval' | 'execute' | 'close' | 'done';

interface WorkflowArgs {
  event: { data: { episodeId: string; tenantId: number; ticketNumber: string; idempotencyKey: string } };
  step: {
    run: <T>(id: string, fn: () => Promise<T> | T) => Promise<T>;
    waitForEvent: (
      id: string,
      opts: { event: string; match?: string; timeout: string },
    ) => Promise<{ data: Record<string, unknown> } | null>;
  };
}

/**
 * Support follow-up: the reference Desk job. Copy this file's shape for a new job.
 *
 * It is a workflow: this code picks the steps, in a fixed order. The model fills in three of them (perceive, decide,
 * draft) and never chooses which tool runs or on what. The trust level decides ask or act, inside the shared gate
 * step; nothing here reads it.
 *
 *   hydrate ─ preflight says skip/abort ─────────────────────────────► close
 *      │
 *   perceive → decide ─ no_action ────────────────────────────────────► close
 *                 │      escalate ────────────────────────────────────► close (ESCALATED)
 *                 ▼
 *   draft → gate ─ may act ──────────────────────► execute ───────────► close (followup_sent)
 *      ▲       └── must ask → wait for a person ─ approved / edited ──► execute → close
 *      └────────── rejected (rewrite, up to 3) ◄──┤ reject and close ─► close
 *                                                 └ nobody answered ──► close (expired)
 *
 * Rules a copy must keep:
 *   - Every step goes through `deskStep`, which re-enters the tenant and checks the episode belongs to it.
 *   - The ticket the reply goes on comes from hydrate. A draft, or an operator's edit, can change the wording only.
 *   - A terminal failure closes the episode through a step with its own id, because Inngest memoizes step ids.
 */
export const supportFollowupHandler = async ({ event, step }: WorkflowArgs) => {
  const { episodeId } = event.data;
  let stage: Stage = 'hydrate';

  const close = async (input: Omit<CloseInput, 'episodeId'>) => {
    stage = 'close';
    const out = await deskStep(step, event, 'close', () => closeStep({ episodeId, ...input }));
    stage = 'done';
    return out;
  };

  try {
    const ctx = await deskStep(step, event, 'hydrate', () => hydrateStep({ episodeId }));
    if (ctx.preflight.action !== 'proceed') {
      // Not a decision the agent made, so no transition: nothing is learned from it.
      return await close({
        outcome: ctx.preflight.outcome ?? DESK_OUTCOMES.PREFLIGHT_SKIPPED,
        outcomeNote: ctx.preflight.reason,
      });
    }

    stage = 'perceive';
    const perception = await deskStep(step, event, 'perceive', () => perceiveStep({ episodeId, ctx }));
    stage = 'decide';
    const decision = await deskStep(step, event, 'decide', () => decideStep({ episodeId, ctx, perception }));

    if (decision.action === 'no_action') {
      return await close({
        outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
        outcomeNote: decision.reasoning,
        transition: 'no_action',
      });
    }
    if (decision.action === 'escalate') {
      // Handing it to a person needs no tool, so there is nothing to gate.
      return await close({
        outcome: DESK_OUTCOMES.ESCALATED_TO_HUMAN,
        outcomeNote: decision.reasoning,
        terminalStatus: 'ESCALATED',
      });
    }

    // Pinned once, from hydrate. Neither the model nor an edit can point the reply at another ticket.
    const ticketNumber = ctx.entity.ticket.ticketNumber;
    let rejectionReason: string | undefined;

    for (let attempt = 0; attempt <= MAX_REDRAFTS; attempt++) {
      stage = 'draft';
      const drafted: DraftOutput = await deskStep(step, event, `draft-${attempt}`, () =>
        draftStep({ episodeId, ctx, perception, decision, rejectionReason }),
      );
      const proposed = { ticketNumber, content: drafted.content };

      stage = 'gate';
      const gate = await deskStep(step, event, `gate-${attempt}`, () =>
        gateStep({ episodeId, tool: ACT_TOOL, proposedArgs: proposed, proposedAction: proposed }),
      );

      let content = drafted.content;
      let transition: CloseInput['transition'] = 'auto_send';

      if (gate.needsApproval) {
        stage = 'wait-approval';
        // Matched on the episode id: the approval id does not exist on the event that started this run, and one
        // episode has one live wait at a time.
        const approval = await step.waitForEvent(`wait-approval-${attempt}`, {
          event: APPROVAL_DECIDED_EVENT,
          match: 'data.episodeId',
          timeout: APPROVAL_TIMEOUT,
        });

        if (!approval) {
          return await close({
            outcome: DESK_OUTCOMES.APPROVAL_EXPIRED,
            outcomeNote: `No decision within ${APPROVAL_TIMEOUT} on draft ${attempt + 1}`,
            transition: 'approval_expired',
          });
        }
        const reason = approval.data.rejectionReason as string | undefined;
        if (approval.data.terminateEpisode) {
          return await close({
            outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
            outcomeNote: reason ?? 'The operator chose reject and close',
            transition: 'reject_and_close',
          });
        }
        if (approval.data.decision === 'REJECTED') {
          // The next draft is told why this one was turned down.
          rejectionReason = reason ?? 'The previous draft was rejected';
          continue;
        }

        const edited = editedContent(approval.data.editedAction);
        if (approval.data.decision === 'EDITED' && edited) content = edited;
        transition = content === drafted.content ? 'approve_unchanged' : 'approve_edited';
      }

      stage = 'execute';
      await deskStep(step, event, `execute-${attempt}`, () =>
        executeStep({
          episodeId,
          tool: ACT_TOOL,
          // The key makes a retried step post the reply once: the executor returns the first result for the same key.
          args: { ticketNumber, content, idempotencyKey: `desk:${episodeId}:${attempt}` },
        }),
      );
      return await close({
        outcome: DESK_OUTCOMES.FOLLOWUP_SENT,
        outcomeNote: transition === 'auto_send' ? 'Sent without asking' : `Approved on draft ${attempt + 1}`,
        transition,
      });
    }

    return await close({
      outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
      outcomeNote: `Rejected ${MAX_REDRAFTS + 1} drafts`,
      transition: 'reject',
    });
  } catch (err) {
    // Inngest has used up the failed step's retries. Close the episode for a person to look at, through a step id of
    // its own (a memoized `close` would be skipped), then let the run fail.
    const message = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    await deskEscalationStep(step, event, 'auto-escalate-close', () =>
      closeStep({
        episodeId,
        outcome: DESK_OUTCOMES.ESCALATED_TO_HUMAN,
        outcomeNote: `step ${stage} failed: ${message}`,
        terminalStatus: 'ESCALATED',
      }),
    );
    throw err;
  }
};

/** The wording an operator's edit carries, if it carries any. Every other key of the edit is ignored. */
function editedContent(editedAction: unknown): string | null {
  const content = (editedAction as { content?: unknown } | null | undefined)?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}

/**
 * One Inngest function per job. One episode gets one run: the trigger sends the event only for a new episode, with the
 * episode's id as the event id. Concurrency is per tenant, so one workspace's sweep cannot starve another's.
 */
export function createSupportFollowupFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'support-followup',
      name: 'Support follow-up',
      concurrency: { key: 'event.data.tenantId', limit: 5 },
      idempotency: 'event.data.idempotencyKey',
      triggers: [{ event: SUPPORT_FOLLOWUP_RUN_EVENT }],
      onFailure: reportDeskFunctionFailure,
    },
    supportFollowupHandler,
  );
}
