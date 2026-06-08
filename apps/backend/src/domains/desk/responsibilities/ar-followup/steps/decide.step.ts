import { DeskEpisodeStepKind } from '@prisma/client';
import { ArFollowup } from '@sally/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';

import type { DecideOutput, HydrateOutput, PerceiveOutput } from '../step.types';

/**
 * decide step — LLM picks the action from the branched set:
 *   send_reminder | record_promise | escalate | no_action
 *
 * Sonnet (standard) — this is the reasoning step that determines whether
 * we reach out at all. Confidence here drives the Assisted gate threshold.
 *
 * Operator-authored guidance flows through the memory subsystem now —
 * playbook-scoped memories surface in `ctx.memories` next to entity- and
 * pattern-scoped lessons. The decide-step prompt is responsible for
 * weighting them appropriately; the workflow does not inject a
 * separate notes block.
 */
export async function decideStep(input: {
  episodeId: string;
  ctx: HydrateOutput;
  perception: PerceiveOutput;
}): Promise<DecideOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const prompting = app.get(PromptingService);
  const structured = app.get(StructuredOutputService);
  const stepWriter = app.get(DeskStepWriter);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      ownerAgentId: true,
      trustLevelSnapshot: true,
      conditionsSnapshot: true,
    },
  });

  const userMessage = buildUserMessage({
    ctx: input.ctx,
    perception: input.perception,
    trustLevel: episode.trustLevelSnapshot,
  });

  return runStructuredLlmStep<DecideOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DECIDE,
    promptKey: 'desk.ar_followup.decide.v1',
    model: 'standard',
    schema: ArFollowup.ArFollowupDecideSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(input: { ctx: HydrateOutput; perception: PerceiveOutput; trustLevel: string }): string {
  const { invoice } = input.ctx.entity;
  // Memory lines: playbook entries are operator-authored rules, entity
  // and pattern entries are Sally's own observations / outcome lessons.
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  return `Pick the best next action for this overdue invoice.

Previously perceived state:
  Invoice state:       ${input.perception.invoiceState}
  Days from due:       ${input.perception.daysFromDue}
  Last contact:        ${input.perception.lastContact.kind}${input.perception.lastContact.daysAgo !== null ? ` (${input.perception.lastContact.daysAgo}d ago)` : ''}
  Payment history:     ${input.perception.paymentHistorySignal}
  Promise on file:     ${input.perception.promiseToPayOnFile.exists ? `yes, due ${input.perception.promiseToPayOnFile.dueDate ?? 'unknown'}, broken=${input.perception.promiseToPayOnFile.broken}` : 'none'}
  Summary:             ${input.perception.summary}
  Perceive confidence: ${input.perception.confidence.toFixed(2)}

Invoice facts:
  Number:  ${invoice.invoiceNumber}
  Customer: ${invoice.customerName}
  Amount:  $${invoice.amount.toFixed(2)}

Tenant trust level: ${input.trustLevel}

Memory (operator rules + corrections + outcome lessons; treat playbook as operator intent):
${memoriesText}

Pick one action:
  • send_reminder  — draft a friendly/firm email and send (most common)
  • record_promise — customer already replied with a commitment; record it
  • escalate       — severe delinquency or broken promise — human needs to take over
  • no_action      — don't reach out today (e.g., too recent a reminder, promise pending)

Return a DecideVoice object with action, reasoning, tone (if send_reminder), urgency, plannedArgs (if record_promise or escalate), and confidence.`;
}
