import { DeskEpisodeStepKind } from '@appshore/db';

import { OUTPUT_CEILINGS } from '../../../../ai/routing/output-ceilings';
import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { SUPPORT_FOLLOWUP_PROMPT_KEYS } from '../prompts';
import { SupportFollowupPerceiveSchema } from '../schemas';
import type { HydrateOutput, PerceiveOutput } from '../step.types';
import { llmStepDeps } from './llm-deps';
import { describeTicket } from './user-message';

/** perceive: say where the ticket stands. A fast model is enough; it sums up facts hydrate already loaded. */
export async function perceiveStep(input: { episodeId: string; ctx: HydrateOutput }): Promise<PerceiveOutput> {
  return runStructuredLlmStep<PerceiveOutput>({
    ...(await llmStepDeps(input.episodeId)),
    kind: DeskEpisodeStepKind.PERCEIVE,
    promptKey: SUPPORT_FOLLOWUP_PROMPT_KEYS.PERCEIVE,
    model: 'fast',
    schema: SupportFollowupPerceiveSchema,
    // A state, a two-sentence summary and a number.
    maxOutputTokens: OUTPUT_CEILINGS.VERDICT,
    userMessage: `Say where this quiet support ticket stands.\n\n${describeTicket(input.ctx)}`,
    extractConfidence: (out) => out.confidence,
  });
}
