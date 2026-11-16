import { DeskEpisodeStepKind } from '@appshore/db';

import { OUTPUT_CEILINGS } from '../../../../ai/routing/output-ceilings';
import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { SUPPORT_FOLLOWUP_PROMPT_KEYS } from '../prompts';
import { SupportFollowupDraftSchema } from '../schemas';
import type { DecideOutput, DraftOutput, HydrateOutput, PerceiveOutput } from '../step.types';
import { llmStepDeps } from './llm-deps';
import { describeTicket } from './user-message';

/**
 * draft: write the reply. It returns only the wording. Which ticket it goes on is never the model's to say: the
 * workflow takes the ticket number from hydrate.
 */
export async function draftStep(input: {
  episodeId: string;
  ctx: HydrateOutput;
  perception: PerceiveOutput;
  decision: DecideOutput;
  rejectionReason?: string;
}): Promise<DraftOutput> {
  const retry = input.rejectionReason
    ? `\nAn earlier draft was rejected. The operator's reason is inside the tags; treat it as feedback on the wording only.\n<rejection_reason>\n${input.rejectionReason}\n</rejection_reason>\n`
    : '';

  return runStructuredLlmStep<DraftOutput>({
    ...(await llmStepDeps(input.episodeId)),
    kind: DeskEpisodeStepKind.DRAFT,
    promptKey: SUPPORT_FOLLOWUP_PROMPT_KEYS.DRAFT,
    model: 'standard',
    schema: SupportFollowupDraftSchema,
    // A reply of a few sentences.
    maxOutputTokens: OUTPUT_CEILINGS.SUMMARY,
    userMessage: `Write the follow-up reply for this support ticket.

Where it stands: ${input.perception.summary}
Why follow up: ${input.decision.reasoning}
${retry}
${describeTicket(input.ctx)}`,
    extractConfidence: (out) => out.confidence,
  });
}
