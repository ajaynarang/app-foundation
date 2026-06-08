import type { Inngest, InngestFunction } from 'inngest';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';

import { closeStep } from '../../../shared-steps/close.step';
import { decideStep } from '../steps/decide.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';

// String literals instead of the ApprovalDecision enum to sidestep the
// pre-existing Prisma 7.3 client-export issue. Values match the Prisma enum.
const DECISION_APPROVED = 'APPROVED' as const;
const DECISION_EDITED = 'EDITED' as const;
const DECISION_REJECTED = 'REJECTED' as const;

const APPROVE_TOOL = 'approve-settlement';

/** Which step-kind was about to run — for auto-escalate outcomeNote labeling. */
type FailedKind = 'hydrate' | 'perceive' | 'decide' | 'gate' | 'execute' | 'wait-approval' | 'close' | 'unknown';

/**
 * Settlement Review workflow handler — extracted from the factory so it can be
 * unit-tested with a fake Inngest `step` object (see spec). Mirrors the AR
 * handler's structure (auto-escalate, dedupe, concurrency) but with the
 * settlement-review branch set:
 *
 *   hydrate → preflight? → perceive → decide:
 *     • approve       → gate (approve-settlement, SENSITIVE → always gates) →
 *                       wait approval → execute → close(settlement_approved)
 *     • flag_anomaly  → close(anomaly_flagged, ESCALATED) — NO execute, NO
 *                       one-tap approve. Sally never auto-approves driver pay
 *                       she doesn't trust; the human fixes it in the module.
 *     • no_action     → close(no_action_needed)
 *
 * The deterministic anomaly guard lives in decide.step (enforceAnomalyGuard),
 * so by the time we branch on action='approve' here, the signals are clean.
 */
export const settlementReviewHandler = async ({
  event,
  step,
}: {
  event: {
    data: {
      episodeId: string;
      tenantId: number;
      settlementId: string;
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
    // ── hydrate: loads context + baseline + anomaly signals + memory ──
    const ctx = await step.run('hydrate', () => hydrateStep({ episodeId, responsibilityKey: 'settlement_review' }));
    if (ctx.preflight.action !== 'proceed') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: ctx.preflight.outcome ?? DESK_OUTCOMES.PREFLIGHT_SKIPPED,
          outcomeNote: ctx.preflight.reason,
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── perceive → decide (decide enforces the anomaly guard in code) ──
    failedKind = 'perceive';
    const perception = await step.run('perceive', () => perceiveStep({ episodeId, ctx }));
    failedKind = 'decide';
    const decision = await step.run('decide', () => decideStep({ episodeId, ctx, perception }));

    // ── no-action branch ──────────────────────────────────────────────
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

    // ── flag-anomaly branch — escalate for a human; NEVER auto-approve ─
    if (decision.action === 'flag_anomaly') {
      failedKind = 'close';
      const out = await step.run('close', () =>
        closeStep({
          episodeId,
          outcome: DESK_OUTCOMES.ANOMALY_FLAGGED,
          outcomeNote: decision.reasoning,
          terminalStatus: 'ESCALATED',
        }),
      );
      failedKind = 'unknown';
      return out;
    }

    // ── approve branch — gate (always gates, sensitive) → approve ─────
    failedKind = 'gate';
    const proposedAction = { settlementId: ctx.entity.settlement.settlementId };
    const gateResult = await step.run(`gate-${APPROVE_TOOL}`, () =>
      gateStep({
        episodeId,
        tool: APPROVE_TOOL,
        proposedArgs: proposedAction,
        proposedAction,
      }),
    );

    let argsToExecute: Record<string, unknown> = proposedAction;

    if (gateResult.needsApproval) {
      failedKind = 'wait-approval';
      // Correlate by data.episodeId — one live wait per episode. Same pattern
      // as the AR workflow.
      const approval = await step.waitForEvent(`wait-approval-${APPROVE_TOOL}`, {
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
            outcomeNote: `No decision within 7d for ${APPROVE_TOOL}`,
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
      // APPROVED or EDITED — honor edited args if present (e.g. operator picked
      // a different settlement id, though that's unusual here).
      if (approval.data.decision === DECISION_APPROVED || approval.data.decision === DECISION_EDITED) {
        argsToExecute = (approval.data.editedAction as Record<string, unknown> | undefined) ?? proposedAction;
      }
    }

    failedKind = 'execute';
    await step.run(`execute-${APPROVE_TOOL}`, () =>
      executeStep({ episodeId, tool: APPROVE_TOOL, args: argsToExecute }),
    );
    failedKind = 'close';
    // Distinguish auto-approve (no human) from approve_unchanged. Sensitive
    // tier always gates, so in practice this is approve_unchanged — but keep
    // the branch honest in case trust/tier rules change.
    const transition: import('../../../shared-steps/step.types').CloseTransition = !gateResult.needsApproval
      ? 'auto_send'
      : 'approve_unchanged';
    const out = await step.run('close', () =>
      closeStep({
        episodeId,
        outcome: DESK_OUTCOMES.SETTLEMENT_APPROVED,
        outcomeNote: decision.reasoning,
        transition,
      }),
    );
    failedKind = 'unknown';
    return out;
  } catch (err) {
    // Auto-escalate on terminal step failure — distinct step id so Inngest
    // doesn't memoize against the success-path close.
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
 * Settlement Review workflow — Inngest function.
 *
 * Listens for `sally/desk.settlement_review.run` events published by
 * TriggerService (weekly cron) + ResponsibilityController (manual run).
 *
 * Idempotency: event id = `settlement_review:settlement:<settlementId>:<date>`
 * so Inngest rejects duplicate firings for the same settlement the same day.
 * Concurrency: keyed per tenant, capped at 5.
 */
export function createSettlementReviewFunction(inngest: Inngest): InngestFunction.Any {
  return inngest.createFunction(
    {
      id: 'settlement-review',
      name: 'Settlement Review',
      concurrency: { key: 'event.data.tenantId', limit: 5 },
      idempotency: 'event.data.idempotencyKey',
      triggers: [{ event: 'sally/desk.settlement_review.run' }],
    },
    settlementReviewHandler as unknown as Parameters<Inngest['createFunction']>[1],
  );
}
