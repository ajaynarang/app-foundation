import { DeskEpisodeStepKind } from '@appshore/db';

import { OUTPUT_CEILINGS } from '../../../../ai/routing/output-ceilings';
import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { SUPPORT_FOLLOWUP_PROMPT_KEYS } from '../prompts';
import { SupportFollowupDecideSchema } from '../schemas';
import type { DecideOutput, HydrateOutput, PerceiveOutput } from '../step.types';
import { llmStepDeps } from './llm-deps';
import { describeTicket } from './user-message';

/**
 * decide: follow up, leave it, or hand it to a person. The workflow, not the model, turns that choice into steps; the
 * model only picks from the fixed list.
 */
export async function decideStep(input: {
  episodeId: string;
  ctx: HydrateOutput;
  perception: PerceiveOutput;
}): Promise<DecideOutput> {
  return runStructuredLlmStep<DecideOutput>({
    ...(await llmStepDeps(input.episodeId)),
    kind: DeskEpisodeStepKind.DECIDE,
    promptKey: SUPPORT_FOLLOWUP_PROMPT_KEYS.DECIDE,
    model: 'standard',
    schema: SupportFollowupDecideSchema,
    // An action, a two-sentence reason and a number.
    maxOutputTokens: OUTPUT_CEILINGS.VERDICT,
    userMessage: `Decide what to do about this quiet support ticket.

Where it stands: ${input.perception.state}. ${input.perception.summary}

${describeTicket(input.ctx)}`,
    extractConfidence: (out) => out.confidence,
  });
}
