import { DeskEpisodeStepKind } from '@prisma/client';
import { ArFollowup } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';

import type { HydrateOutput, PerceiveOutput } from '../step.types';

/**
 * perceive step — LLM classifies the invoice state and summarizes context.
 * Haiku (fast) is enough; we're summarizing already-hydrated facts.
 */
export async function perceiveStep(input: { episodeId: string; ctx: HydrateOutput }): Promise<PerceiveOutput> {
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

  return runStructuredLlmStep<PerceiveOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.PERCEIVE,
    promptKey: 'desk.ar_followup.perceive.v1',
    model: 'fast',
    schema: ArFollowup.ArFollowupPerceiveSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(ctx: HydrateOutput): string {
  const { invoice, customerStats, priorReminderCount, priorReminders } = ctx.entity;
  // Memory lines surface as `[i] scope·polarity (confidence X): content`.
  // Operator-authored playbook rules carry scope=playbook so the LLM can
  // distinguish operator intent from Sally's own observations.
  const memoriesText = ctx.memories.length
    ? ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';
  const priorText = priorReminders.length
    ? priorReminders.map((p) => `  • ${p.sentAt}: "${p.subject ?? '(no subject)'}" (by ${p.principalLabel})`).join('\n')
    : '  (none)';

  return `Classify the state of this overdue invoice and summarize context for downstream reasoning.

Invoice:
  Number:       ${invoice.invoiceNumber}
  Customer:     ${invoice.customerName} (id ${invoice.customerId})
  Amount:       $${invoice.amount.toFixed(2)}
  Issue date:   ${invoice.issueDate}
  Due date:     ${invoice.dueDate}
  Days from due: ${invoice.daysFromDue} (negative = not yet due, positive = past due)
  Status:       ${invoice.status}

Customer payment history:
  Open invoices: ${customerStats.openInvoiceCount}
  Open balance:  $${(customerStats.openBalanceCents / 100).toFixed(2)}
  Avg days late: ${customerStats.avgDaysLate?.toFixed(1) ?? 'unknown'}
  DSO (days):    ${customerStats.dsoDays ?? 'unknown'}

Prior reminders (within 30 days for this invoice):
${priorText}
  Total prior reminders: ${priorReminderCount}

Memory (operator rules + prior corrections + outcome lessons; treat playbook as operator intent, entity/pattern as Sally's own observations):
${memoriesText}

Return a PerceiveVoice object with invoiceState, daysFromDue, lastContact, paymentHistorySignal, promiseToPayOnFile, summary (<=280 chars), and confidence.`;
}
