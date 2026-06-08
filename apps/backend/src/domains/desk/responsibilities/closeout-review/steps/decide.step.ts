import { DeskEpisodeStepKind } from '@prisma/client';
import { CloseoutReview } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import type { CloseoutDecideOutput, CloseoutHydrateOutput, CloseoutPerceiveOutput } from '../step.types';

/**
 * decide step — LLM picks between drafting an invoice and standing down:
 *   draft_invoice | no_action
 *
 * Sonnet (standard). The hard money rule lives here: no_action whenever the
 * load has ANY billing blocker or no billable charges. The hydrate preflight
 * already short-circuits the clear blocker cases, but the decide prompt
 * re-enforces the rule for anything that slips through (and supplies the
 * operator-facing blockerReason).
 */
export async function decideStep(input: {
  episodeId: string;
  ctx: CloseoutHydrateOutput;
  perception: CloseoutPerceiveOutput;
}): Promise<CloseoutDecideOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { ownerAgentId: true, trustLevelSnapshot: true },
  });

  const userMessage = buildUserMessage({
    ctx: input.ctx,
    perception: input.perception,
    trustLevel: episode.trustLevelSnapshot,
  });

  return runStructuredLlmStep<CloseoutDecideOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DECIDE,
    promptKey: 'desk.closeout_review.decide.v1',
    model: 'standard',
    schema: CloseoutReview.CloseoutReviewDecideSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(input: {
  ctx: CloseoutHydrateOutput;
  perception: CloseoutPerceiveOutput;
  trustLevel: string;
}): string {
  const { load, readiness, charges } = input.ctx.entity;
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  return `Decide whether to draft an invoice for this delivered-but-uninvoiced load.

Previously perceived state:
  Billing state:        ${input.perception.billingState}
  Hours since delivery: ${input.perception.hoursSinceDelivery}
  Has billable charges: ${input.perception.hasBillableCharges}
  Blockers:             ${input.perception.blockers.length ? input.perception.blockers.join(', ') : 'none'}
  Summary:              ${input.perception.summary}
  Perceive confidence:  ${input.perception.confidence.toFixed(2)}

Load facts:
  Number:            ${load.loadNumber}
  Customer:          ${load.customerName}
  Billing status:    ${load.billingStatus ?? 'none'}
  Has blockers:      ${readiness.hasBlockers}
  Billable total:    $${charges.billableTotalDollars.toFixed(2)}
  Billable charges:  ${charges.items.length}

Tenant trust level: ${input.trustLevel}

Memory (operator rules + corrections + outcome lessons; treat playbook as operator intent):
${memoriesText}

Pick one action:
  • draft_invoice — the load is billable: charges present, documents on file, no blockers
  • no_action     — not billable yet (any blocker, no charges, missing docs, needs approval)

HARD RULE: never draft_invoice when there are blockers or no billable charges. When picking
no_action, set blockerReason to a short operator-facing explanation.

Return a decide object with action, reasoning, blockerReason (if no_action), and confidence.`;
}
