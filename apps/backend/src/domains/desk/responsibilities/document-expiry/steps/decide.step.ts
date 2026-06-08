import { DeskEpisodeStepKind } from '@prisma/client';
import { DocumentExpiry } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { PROMPT_NAMES } from '../../../../prompting/prompting.types';
import type {
  DocumentExpiryDecideOutput,
  DocumentExpiryHydrateOutput,
  DocumentExpiryPerceiveOutput,
} from '../step.types';

/**
 * decide step — LLM picks action + channel + recipient:
 *   send_reminder | escalate_to_admin | no_action
 *   channel: sms | email | both   recipient: driver | admin
 *
 * Sonnet (standard) — confidence here drives the Assisted gate threshold.
 * Routing bias: expired/CRITICAL → admin-first; expiring/WARNING → driver.
 */
export async function decideStep(input: {
  episodeId: string;
  ctx: DocumentExpiryHydrateOutput;
  perception: DocumentExpiryPerceiveOutput;
}): Promise<DocumentExpiryDecideOutput> {
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

  return runStructuredLlmStep<DocumentExpiryDecideOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DECIDE,
    promptKey: PROMPT_NAMES.DESK_DOCUMENT_EXPIRY_DECIDE,
    model: 'standard',
    schema: DocumentExpiry.DocumentExpiryDecideSchema,
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
  perception: DocumentExpiryPerceiveOutput;
  trustLevel: string;
}): string {
  const { finding, driverContact, adminContact } = input.ctx.entity;
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  return `Pick the best next action for this driver-credential expiry.

Perceived state:
  Urgency:       ${input.perception.urgency}
  Days to expiry: ${input.perception.daysUntilExpiry}
  Suggested route: ${input.perception.routeTo}
  Summary:       ${input.perception.summary}
  Perceive confidence: ${input.perception.confidence.toFixed(2)}

Credential:
  Driver:        ${finding.driverName} (id ${finding.driverId})
  Credential:    ${finding.credentialLabel}
  Severity:      ${finding.severity}
  Expiry date:   ${finding.dueDate ?? 'unknown'}

Contact available:
  Driver:  email=${driverContact.email ? 'yes' : 'no'} sms=${driverContact.phone ? 'yes' : 'no'}
  Admin:   email=${adminContact.email ? 'yes' : 'no'} sms=${adminContact.phone ? 'yes' : 'no'}

Tenant trust level: ${input.trustLevel}

Memory (operator rules + corrections + outcome lessons):
${memoriesText}

Routing: expired or CRITICAL → escalate_to_admin (recipient=admin). Expiring/WARNING → send_reminder (recipient=driver).
Only pick a channel whose contact exists for the chosen recipient; if the chosen recipient has no contact, fall back to admin; if neither has contact, no_action.

Return a DocumentExpiryDecide object with action, channel, recipient, reasoning, and confidence.`;
}
