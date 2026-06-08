import { DeskEpisodeStepKind } from '@prisma/client';
import { CloseoutReview } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import type { CloseoutHydrateOutput, CloseoutPerceiveOutput } from '../step.types';

/**
 * perceive step — LLM classifies the load's billing state and summarizes
 * blockers / charges. Haiku (fast) is enough; we're summarizing
 * already-hydrated facts.
 */
export async function perceiveStep(input: {
  episodeId: string;
  ctx: CloseoutHydrateOutput;
}): Promise<CloseoutPerceiveOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { ownerAgentId: true },
  });

  const userMessage = buildUserMessage(input.ctx);

  return runStructuredLlmStep<CloseoutPerceiveOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.PERCEIVE,
    promptKey: 'desk.closeout_review.perceive.v1',
    model: 'fast',
    schema: CloseoutReview.CloseoutReviewPerceiveSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(ctx: CloseoutHydrateOutput): string {
  const { load, readiness, charges } = ctx.entity;
  const memoriesText = ctx.memories.length
    ? ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';
  const chargesText = charges.items.length
    ? charges.items
        .map(
          (c) =>
            `  • ${c.description} — ${c.quantity} × $${c.unitPriceDollars.toFixed(2)} = $${c.totalDollars.toFixed(2)}`,
        )
        .join('\n')
    : '  (none)';
  const blockersText = readiness.blockers.length ? readiness.blockers.map((b) => `  • ${b}`).join('\n') : '  (none)';

  return `Classify the billing state of this delivered-but-uninvoiced load and summarize context.

Load:
  Number:            ${load.loadNumber}
  Customer:          ${load.customerName} (id ${load.customerId})
  Status:            ${load.status}
  Billing status:    ${load.billingStatus ?? 'none'}
  Hours since delivery: ${load.hoursSinceDelivery}

Billing readiness:
  Compliance score:  ${readiness.score}
  Has blockers:      ${readiness.hasBlockers}
  Ready to approve:  ${readiness.readyToApprove}
  Blockers:
${blockersText}

Billable charges:
  Has billable charges: ${charges.hasBillableCharges}
  Billable total:       $${charges.billableTotalDollars.toFixed(2)}
  Line items:
${chargesText}

Memory (operator rules + prior corrections + outcome lessons; treat playbook as operator intent):
${memoriesText}

Return a perceive object with billingState, hoursSinceDelivery, hasBillableCharges, blockers, summary (<=280 chars), and confidence.`;
}
