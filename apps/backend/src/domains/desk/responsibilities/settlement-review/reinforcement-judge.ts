import type { ReinforcementJudge } from '../../core/memory/reinforcement.types';

/**
 * Closing transitions whose intent is "endorse Sally's read — go ahead".
 * For Settlement Review that's an operator approving a settlement Sally
 * proposed as clean (one-tap approve / approve-edited / the rare auto path).
 * A REINFORCE memory paired with one of these was load-bearing + aligned
 * (CONFIRM); a CORRECT memory paired with one means the memory tried to stop
 * us and the operator went ahead anyway (CONTRADICT).
 */
const REINFORCING_TRANSITIONS = new Set(['approve_unchanged', 'auto_send']);

/**
 * Closing transitions whose intent is "don't proceed / Sally was off".
 * An operator rejecting/closing an approval, or an approval expiring,
 * vindicates a CORRECT memory (CONFIRM) and contradicts a REINFORCE one
 * (CONTRADICT).
 *
 * `snooze` is deliberately NOT here — snooze is "quiet for a while", not
 * "Sally was wrong about this driver". It falls through to NEUTRAL.
 */
const CORRECTING_TRANSITIONS = new Set(['reject', 'reject_and_close', 'approval_expired']);

/**
 * Settlement Review reinforcement judge.
 *
 * Decision table (identical structure to AR — the polarity × intent product
 * is responsibility-agnostic; only the transition vocabulary differs):
 *
 *   memory.polarity × transition.intent   → verdict
 *   --------------------------------------------
 *   REINFORCE       × reinforcing         → CONFIRM
 *   REINFORCE       × correcting          → CONTRADICT
 *   CORRECT         × reinforcing         → CONTRADICT
 *   CORRECT         × correcting          → CONFIRM
 *   anything        × no_action           → NEUTRAL    (Sally chose neither)
 *   anything        × approve_edited      → NEUTRAL    (the edit IS the lesson)
 *   anything        × snooze              → NEUTRAL    (operator wanted quiet)
 *
 * Entity/pattern-scoped memories require entityRef overlap to apply (no
 * overlap → NEUTRAL). Playbook-scoped memories are agent-wide so they always
 * apply when the transition has clear intent.
 */
export const SETTLEMENT_REVIEW_REINFORCEMENT_JUDGE: ReinforcementJudge = (memory, ctx) => {
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
