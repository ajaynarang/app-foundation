import { DeskEpisodeStepKind } from '@prisma/client';
import { DocumentExpiry } from '@sally/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { PROMPT_NAMES } from '../../../../prompting/prompting.types';
import type {
  DocumentExpiryDecideOutput,
  DocumentExpiryDraftOutput,
  DocumentExpiryHydrateOutput,
  DocumentExpiryPerceiveOutput,
} from '../step.types';

/**
 * draft step — LLM produces the renewal reminder (email and/or SMS).
 *
 * Called when decide.action is send_reminder or escalate_to_admin. Re-runs
 * on reject with the previous rejectionReason fed back so the new draft
 * incorporates the operator's feedback.
 */
export async function draftStep(input: {
  episodeId: string;
  ctx: DocumentExpiryHydrateOutput;
  perception: DocumentExpiryPerceiveOutput;
  decision: DocumentExpiryDecideOutput;
  rejectionReason?: string;
}): Promise<DocumentExpiryDraftOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { ownerAgentId: true },
  });

  const contact = input.decision.recipient === 'admin' ? input.ctx.entity.adminContact : input.ctx.entity.driverContact;
  if (!contact.email && !contact.phone) {
    throw new Error(
      `draft: no contact on file for ${input.decision.recipient}; cannot draft reminder for driver ${input.ctx.entity.finding.driverId}`,
    );
  }

  const userMessage = buildUserMessage({
    ctx: input.ctx,
    decision: input.decision,
    rejectionReason: input.rejectionReason,
    contactEmail: contact.email,
    contactPhone: contact.phone,
  });

  return runStructuredLlmStep<DocumentExpiryDraftOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DRAFT,
    promptKey: PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_DRAFT,
    model: 'standard',
    schema: DocumentExpiry.DocumentExpiryDraftSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(input: {
  ctx: DocumentExpiryHydrateOutput;
  decision: DocumentExpiryDecideOutput;
  rejectionReason?: string;
  contactEmail: string | null;
  contactPhone: string | null;
}): string {
  const { finding } = input.ctx.entity;
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';
  const retryBlock = input.rejectionReason
    ? `\n⚠️ A PREVIOUS DRAFT was REJECTED with this reason: "${input.rejectionReason}"\nRewrite the message to address that feedback. Don't repeat the same mistake.\n`
    : '';

  return `Draft a credential-renewal reminder.

Recipient:   ${input.decision.recipient}
Channel:     ${input.decision.channel}
Send to:     email=${input.contactEmail ?? 'none'} sms=${input.contactPhone ?? 'none'}

Credential:
  Driver:      ${finding.driverName}
  Credential:  ${finding.credentialLabel}
  Severity:    ${finding.severity}
  Expiry date: ${finding.dueDate ?? 'unknown'}
  Days to expiry: ${finding.daysUntilExpiry ?? 'unknown'}

Decided action: ${input.decision.action}
Decide reasoning: ${input.decision.reasoning}

Memory (operator rules + edits + outcome lessons):
${memoriesText}
${retryBlock}
Return a DocumentExpiryDraft object with:
  to (the chosen recipient's contact — email when emailing, E.164 phone when texting)
  subject (email subject; null when SMS-only)
  body (email body, plain text; null when SMS-only)
  smsBody (≤320 chars; null when email-only)
  mentionsCredential, mentionsDate, confidence`;
}
