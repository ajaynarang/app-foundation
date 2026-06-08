import type { ReinforcementJudge } from '../../core/memory/reinforcement.types';

/**
 * Closing transitions whose intent is "keep going / endorse the prior
 * direction". A REINFORCE memory paired with one of these means the
 * memory's hint was load-bearing and aligned (CONFIRM); a CORRECT
 * memory paired with one means the memory tried to stop us and we did
 * the opposite (CONTRADICT).
 */
const REINFORCING_TRANSITIONS = new Set(['approve_unchanged', 'auto_send']);

/**
 * Closing transitions whose intent is "do not act / change course".
 * A CORRECT memory paired with one means the memory's hint was
 * vindicated (CONFIRM); a REINFORCE memory paired with one means the
 * memory cheerleaded for action that the operator turned down
 * (CONTRADICT).
 *
 * `snooze` is deliberately NOT in this set — snooze is "I want quiet
 * for a while", not "Sally was wrong about this customer". Decaying a
 * REINFORCE memory ("Acme always pays around day 50") because the
 * dispatcher snoozed the noise would unlearn a valid lesson. snooze
 * falls through to NEUTRAL via the catch-all guard below.
 */
const CORRECTING_TRANSITIONS = new Set(['reject', 'reject_and_close', 'approval_expired']);

/**
 * AR Follow-up reinforcement judge.
 *
 * Decision table:
 *
 *   memory.polarity × transition.intent   → verdict
 *   --------------------------------------------
 *   REINFORCE       × reinforcing         → CONFIRM
 *   REINFORCE       × correcting          → CONTRADICT
 *   CORRECT         × reinforcing         → CONTRADICT
 *   CORRECT         × correcting          → CONFIRM
 *   anything        × no_action           → NEUTRAL    (Sally chose neither)
 *   anything        × approve_edited      → NEUTRAL    (the edit IS the lesson; the new pattern memory is already written)
 *   anything        × snooze              → NEUTRAL    (operator wanted quiet, not a correction)
 *
 * Entity-scoped + pattern-scoped memories require entityRef overlap to
 * apply (no overlap → NEUTRAL — this memory wasn't load-bearing for
 * THIS entity's run). Playbook-scoped memories are agent-wide so they
 * always apply when the transition has clear intent.
 */
export const AR_FOLLOWUP_REINFORCEMENT_JUDGE: ReinforcementJudge = (memory, ctx) => {
  // approve_edited and no_action don't reveal intent strongly enough to
  // move confidence — leave the memory alone, just bump usage count via
  // the generic NEUTRAL verdict.
  if (!REINFORCING_TRANSITIONS.has(ctx.transition) && !CORRECTING_TRANSITIONS.has(ctx.transition)) {
    return 'NEUTRAL';
  }

  // Entity/pattern memories without an entityRef overlap aren't
  // load-bearing for THIS run.
  if (memory.scope !== 'PLAYBOOK') {
    if (!entityRefOverlap(ctx.entityRef, memory.entityRef)) return 'NEUTRAL';
  }

  const transitionReinforces = REINFORCING_TRANSITIONS.has(ctx.transition);
  if (memory.polarity === 'REINFORCE') {
    return transitionReinforces ? 'CONFIRM' : 'CONTRADICT';
  }
  // memory.polarity === 'CORRECT'
  return transitionReinforces ? 'CONTRADICT' : 'CONFIRM';
};

function entityRefOverlap(query: Record<string, unknown>, memory: Record<string, unknown> | null): boolean {
  if (!memory) return false;
  for (const [k, v] of Object.entries(query)) {
    if (v != null && memory[k] === v) return true;
  }
  return false;
}
