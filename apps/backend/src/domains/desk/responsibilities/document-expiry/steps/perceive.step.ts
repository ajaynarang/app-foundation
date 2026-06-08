import { DeskEpisodeStepKind } from '@prisma/client';
import { DocumentExpiry } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { PROMPT_NAMES } from '../../../../prompting/prompting.types';
import type { DocumentExpiryHydrateOutput, DocumentExpiryPerceiveOutput } from '../step.types';

/**
 * perceive step — LLM classifies the urgency of the credential expiry and
 * who should hear about it. Haiku (fast) is enough; we're summarizing
 * already-hydrated facts that Shield already detected.
 */
export async function perceiveStep(input: {
  episodeId: string;
  ctx: DocumentExpiryHydrateOutput;
}): Promise<DocumentExpiryPerceiveOutput> {
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

  return runStructuredLlmStep<DocumentExpiryPerceiveOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.PERCEIVE,
    promptKey: PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_PERCEIVE,
    model: 'fast',
    schema: DocumentExpiry.DocumentExpiryPerceiveSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(ctx: DocumentExpiryHydrateOutput): string {
  const { finding, driverContact, adminContact } = ctx.entity;
  const memoriesText = ctx.memories.length
    ? ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  return `Assess the urgency of this driver-credential expiry and who should hear about it.

Credential expiry (detected by Shield):
  Driver:        ${finding.driverName} (id ${finding.driverId})
  Credential:    ${finding.credentialLabel}
  Severity:      ${finding.severity}
  Expiry date:   ${finding.dueDate ?? 'unknown'}
  Days to expiry: ${finding.daysUntilExpiry ?? 'unknown'} (negative = already expired)
  Shield note:   ${finding.recommendation ?? '(none)'}

Contact on file:
  Driver:  email=${driverContact.email ?? 'none'} phone=${driverContact.phone ?? 'none'}
  Admin:   email=${adminContact.email ?? 'none'} phone=${adminContact.phone ?? 'none'}

Memory (operator rules + prior corrections + outcome lessons):
${memoriesText}

Return a DocumentExpiryPerceive object with urgency, daysUntilExpiry, routeTo, summary (≤280 chars), and confidence.`;
}
