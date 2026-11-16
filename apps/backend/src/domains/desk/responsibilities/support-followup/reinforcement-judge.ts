import type { ReinforcementJudge } from '../../core/memory/reinforcement.types';

/** The run ended by doing what was proposed, with no change from a person. */
const REINFORCING_TRANSITIONS = new Set(['approve_unchanged', 'auto_send']);

/** A person stopped it, or nobody answered in time. `snooze` is not here: quiet is not a correction. */
const CORRECTING_TRANSITIONS = new Set(['reject', 'reject_and_close', 'approval_expired']);

/**
 * Support follow-up reinforcement judge: for each memory the run used, did the way the episode closed agree with it?
 *
 *   memory polarity × how it closed   → verdict
 *   REINFORCE       × reinforcing     → CONFIRM
 *   REINFORCE       × correcting      → CONTRADICT
 *   CORRECT         × reinforcing     → CONTRADICT
 *   CORRECT         × correcting      → CONFIRM
 *   anything        × anything else   → NEUTRAL   (no action, an edited approval, a snooze)
 *
 * A memory about one ticket or one category counts only when it is about this run's ticket or category. A playbook
 * rule is agent-wide, so it always counts.
 */
export const SUPPORT_FOLLOWUP_REINFORCEMENT_JUDGE: ReinforcementJudge = (memory, ctx) => {
  const reinforces = REINFORCING_TRANSITIONS.has(ctx.transition);
  if (!reinforces && !CORRECTING_TRANSITIONS.has(ctx.transition)) return 'NEUTRAL';

  if (memory.scope !== 'PLAYBOOK' && !sharesAKey(ctx.entityRef, memory.entityRef)) return 'NEUTRAL';

  if (memory.polarity === 'REINFORCE') return reinforces ? 'CONFIRM' : 'CONTRADICT';
  return reinforces ? 'CONTRADICT' : 'CONFIRM';
};

function sharesAKey(run: Record<string, unknown>, memory: Record<string, unknown> | null): boolean {
  if (!memory) return false;
  return Object.entries(run).some(([key, value]) => value != null && memory[key] === value);
}
