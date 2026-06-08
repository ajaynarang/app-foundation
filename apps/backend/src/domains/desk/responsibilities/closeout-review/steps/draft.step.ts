import { DeskEpisodeStepKind } from '@prisma/client';
import { CloseoutReview } from '@sally/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import type {
  CloseoutDecideOutput,
  CloseoutDraftOutput,
  CloseoutHydrateOutput,
  CloseoutPerceiveOutput,
} from '../step.types';

/**
 * draft step — LLM produces the invoice PREVIEW (customer, total, line
 * items) the approval sheet renders. It does NOT write the invoice;
 * generate-invoice builds the real invoice from the load's LoadCharge rows
 * at execute time. The preview must mirror those charges exactly.
 *
 * Called only when decide.action === 'draft_invoice'. Re-runs on reject with
 * the previous rejectionReason fed back in.
 */
export async function draftStep(input: {
  episodeId: string;
  ctx: CloseoutHydrateOutput;
  perception: CloseoutPerceiveOutput;
  decision: CloseoutDecideOutput;
  rejectionReason?: string;
}): Promise<CloseoutDraftOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { ownerAgentId: true },
  });

  if (!input.ctx.entity.charges.hasBillableCharges) {
    throw new Error(
      `draft: load ${input.ctx.entity.load.loadNumber} has no billable charges; cannot preview an invoice`,
    );
  }

  const userMessage = buildUserMessage({
    ctx: input.ctx,
    decision: input.decision,
    rejectionReason: input.rejectionReason,
  });

  return runStructuredLlmStep<CloseoutDraftOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DRAFT,
    promptKey: 'desk.closeout_review.draft.v1',
    model: 'standard',
    schema: CloseoutReview.CloseoutReviewDraftSchema,
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
  decision: CloseoutDecideOutput;
  rejectionReason?: string;
}): string {
  const { load, charges } = input.ctx.entity;
  const chargesText = charges.items
    .map(
      (c) => `  • ${c.description} — ${c.quantity} × $${c.unitPriceDollars.toFixed(2)} = $${c.totalDollars.toFixed(2)}`,
    )
    .join('\n');
  const retryBlock = input.rejectionReason
    ? `\n⚠️ A PREVIOUS PREVIEW was REJECTED with this reason: "${input.rejectionReason}"\nAddress that feedback. Do not invent or alter charges.\n`
    : '';

  return `Build the invoice PREVIEW for this delivered load. Mirror the charges below EXACTLY.

Customer:       ${load.customerName}
Load:           ${load.loadNumber}
Billable total: $${charges.billableTotalDollars.toFixed(2)}

Billable charges (the invoice will be generated from these — copy them faithfully):
${chargesText}

Decide reasoning: ${input.decision.reasoning}
${retryBlock}
Return a draft object with:
  customerName (the customer above)
  totalDollars (must equal the billable total above)
  lineItems (one per billable charge: description, quantity, unitPriceDollars, totalDollars)
  summary (one short sentence, e.g. "Ready to invoice — $2,450, Acme Logistics, 3 line items")
  confidence`;
}
