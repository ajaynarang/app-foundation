import type { ReinforcementJudge } from '../../core/memory/reinforcement.types';

/**
 * Closing transitions whose intent is "keep going / endorse the prior
 * direction". A REINFORCE memory paired with one means the memory's hint
 * was load-bearing and aligned (CONFIRM); a CORRECT memory paired with one
 * means the memory tried to stop us and we did the opposite (CONTRADICT).
 */
const REINFORCING_TRANSITIONS = new Set(['approve_unchanged', 'auto_send']);

/**
 * Closing transitions whose intent is "do not act / change course".
 *
 * `snooze` is deliberately NOT here — for document_expiry it means "this
 * driver is already handling their renewal", not "Sally was wrong to
 * watch this credential". Decaying a REINFORCE memory because the operator
 * muted the noise would unlearn a valid compliance lesson. snooze falls
 * through to NEUTRAL.
 */
const CORRECTING_TRANSITIONS = new Set(['reject', 'reject_and_close', 'approval_expired']);

/**
 * Document Expiry reinforcement judge.
 *
 * Decision table (identical structure to AR Follow-up):
 *
 *   memory.polarity × transition.intent → verdict
 *   --------------------------------------------
 *   REINFORCE × reinforcing → CONFIRM
 *   REINFORCE × correcting  → CONTRADICT
 *   CORRECT   × reinforcing → CONTRADICT
 *   CORRECT   × correcting  → CONFIRM
 *   anything  × no_action / approve_edited / snooze → NEUTRAL
 *
 * Entity- and pattern-scoped memories require entityRef overlap to apply
 * (no overlap → NEUTRAL). Playbook-scoped memories are agent-wide so they
 * always apply when the transition has clear intent.
 */
export const DOCUMENT_EXPIRY_REINFORCEMENT_JUDGE: ReinforcementJudge = (memory, ctx) => {
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
