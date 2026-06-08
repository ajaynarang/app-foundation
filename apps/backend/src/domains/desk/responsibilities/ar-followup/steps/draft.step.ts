import { DeskEpisodeStepKind } from '@prisma/client';
import { ArFollowup } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';

import type { DecideOutput, DraftOutput, HydrateOutput, PerceiveOutput } from '../step.types';

/**
 * draft step — LLM produces the actual email subject + body.
 *
 * Called only when decide.action === 'send_reminder'. Re-runs on reject
 * with the previous rejectionReason fed back in so the new draft
 * actually incorporates the operator's feedback.
 */
export async function draftStep(input: {
  episodeId: string;
  ctx: HydrateOutput;
  perception: PerceiveOutput;
  decision: DecideOutput;
  rejectionReason?: string;
}): Promise<DraftOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { ownerAgentId: true },
  });

  const customerEmail = input.ctx.entity.invoice.customerEmail;
  if (!customerEmail) {
    throw new Error(
      `draft: invoice ${input.ctx.entity.invoice.invoiceNumber} has no customer email; cannot draft follow-up`,
    );
  }

  const userMessage = buildUserMessage({
    ctx: input.ctx,
    perception: input.perception,
    decision: input.decision,
    rejectionReason: input.rejectionReason,
    customerEmail,
  });

  return runStructuredLlmStep<DraftOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DRAFT,
    promptKey: 'desk.ar_followup.draft.v1',
    model: 'standard',
    schema: ArFollowup.ArFollowupDraftSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(input: {
  ctx: HydrateOutput;
  perception: PerceiveOutput;
  decision: DecideOutput;
  rejectionReason?: string;
  customerEmail: string;
}): string {
  const { invoice } = input.ctx.entity;
  // playbook-scoped memories are operator-authored tone/style rules from
  // the Rules tab; entity/pattern-scoped are Sally's own observations.
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';
  const retryBlock = input.rejectionReason
    ? `\n⚠️ A PREVIOUS DRAFT was REJECTED with this reason: "${input.rejectionReason}"\nRewrite the email to address that feedback. Don't repeat the same mistake.\n`
    : '';

  return `Draft a follow-up email about this overdue invoice.

Send to:        ${input.customerEmail}
Customer:       ${invoice.customerName}
Invoice:        ${invoice.invoiceNumber}
Amount:         $${invoice.amount.toFixed(2)}
Days past due:  ${invoice.daysFromDue}

Decided action: ${input.decision.action}
Chosen tone:    ${input.decision.tone ?? 'friendly'}
Decide reasoning: ${input.decision.reasoning}

Payment context:
  ${input.perception.summary}

Memory (operator rules + edits + outcome lessons; honor playbook entries as tone/style guidance):
${memoriesText}
${retryBlock}
Return a DraftVoice object with:
  to (the customer email above)
  subject (max 200 chars; specific, include the invoice number)
  body (max 3000 chars; matches the decided tone; mentions amount+dueDate if appropriate; plain text, no HTML)
  toneUsed, mentionsAmount, mentionsDueDate, confidence`;
}
