import type { ReinforcementJudge } from '../../core/memory/reinforcement.types';

/**
 * Closing transitions whose intent is "keep going / endorse the prior
 * direction" — Sally drafted an invoice and the operator approved it (or it
 * auto-proceeded). A REINFORCE memory paired with one of these means the
 * memory's hint was load-bearing and aligned (CONFIRM); a CORRECT memory
 * paired with one means the memory tried to stop us and we did the opposite
 * (CONTRADICT).
 */
const REINFORCING_TRANSITIONS = new Set(['approve_unchanged', 'auto_send']);

/**
 * Closing transitions whose intent is "do not act / change course" — the
 * operator rejected the draft or it expired unactioned. A CORRECT memory
 * paired with one means the memory's hint was vindicated (CONFIRM); a
 * REINFORCE memory paired with one means it cheerleaded for a draft the
 * operator turned down (CONTRADICT).
 *
 * `snooze` is deliberately NOT in this set — snooze is "leave this load
 * quiet for a while", not "Sally was wrong". It falls through to NEUTRAL
 * via the catch-all guard below.
 */
const CORRECTING_TRANSITIONS = new Set(['reject', 'reject_and_close', 'approval_expired']);

/**
 * Closeout Review reinforcement judge.
 *
 * Decision table:
 *
 *   memory.polarity × transition.intent   → verdict
 *   --------------------------------------------
 *   REINFORCE       × reinforcing         → CONFIRM
 *   REINFORCE       × correcting          → CONTRADICT
 *   CORRECT         × reinforcing         → CONTRADICT
 *   CORRECT         × correcting          → CONFIRM
 *   anything        × no_action           → NEUTRAL    (Sally chose not to draft)
 *   anything        × approve_edited      → NEUTRAL    (the edit IS the lesson)
 *   anything        × snooze              → NEUTRAL    (operator wanted quiet)
 *
 * Entity-scoped + pattern-scoped memories require entityRef overlap to
 * apply (no overlap → NEUTRAL — this memory wasn't load-bearing for THIS
 * load's run). Playbook-scoped memories are agent-wide so they always apply
 * when the transition has clear intent.
 */
export const CLOSEOUT_REVIEW_REINFORCEMENT_JUDGE: ReinforcementJudge = (memory, ctx) => {
  if (!REINFORCING_TRANSITIONS.has(ctx.transition) && !CORRECTING_TRANSITIONS.has(ctx.transition)) {
    return 'NEUTRAL';
  }

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
