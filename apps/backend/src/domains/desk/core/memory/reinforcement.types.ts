import type { MemoryPolarity, MemoryScope } from '@appshore/db';

/**
 * Reinforcement contract — per-responsibility verdict on a single memory
 * row given the closing transition + outcome of an episode that USED that
 * memory (i.e. it was in `episode.retrievedMemoryIds`).
 *
 * Generic `DeskMemoryReinforcer` walks every retrieved memory and applies
 * the responsibility's judge. Reinforcer code never branches on
 * responsibility key — judges live next to their responsibility's other
 * registry fields and ship together.
 *
 * Verdicts:
 *   • CONFIRM    — outcome aligns with what this memory implied
 *   • CONTRADICT — outcome contradicts this memory; decay confidence
 *   • NEUTRAL    — memory wasn't load-bearing for this episode; bump usage
 *                  count but don't move confidence
 */
export type ReinforcementVerdict = 'CONFIRM' | 'CONTRADICT' | 'NEUTRAL';

export interface ReinforcementJudgeContext {
  transition: string;
  outcome: string;
  entityRef: Record<string, unknown>;
}

export interface ReinforcementMemoryRow {
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  entityRef: Record<string, unknown> | null;
  entityPredicate: Record<string, unknown> | null;
}

export type ReinforcementJudge = (
  memory: ReinforcementMemoryRow,
  context: ReinforcementJudgeContext,
) => ReinforcementVerdict;
