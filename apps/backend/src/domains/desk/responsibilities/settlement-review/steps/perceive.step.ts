import { DeskEpisodeStepKind } from '@prisma/client';
import { SettlementReview } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import type { SettlementReviewHydrateOutput, SettlementReviewPerceiveOutput } from '../step.types';

/**
 * perceive step — LLM summarizes the settlement + which anomaly signals
 * tripped. Haiku (fast) is enough; we're summarizing already-hydrated facts
 * and mirroring the deterministic signals (not recomputing them).
 */
export async function perceiveStep(input: {
  episodeId: string;
  ctx: SettlementReviewHydrateOutput;
}): Promise<SettlementReviewPerceiveOutput> {
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

  return runStructuredLlmStep<SettlementReviewPerceiveOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.PERCEIVE,
    promptKey: 'desk.settlement_review.perceive.v1',
    model: 'fast',
    schema: SettlementReview.SettlementReviewPerceiveSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });
}

function buildUserMessage(ctx: SettlementReviewHydrateOutput): string {
  const { settlement, baseline, signals } = ctx.entity;
  const memoriesText = ctx.memories.length
    ? ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  const trippedKinds = SettlementReview.anomalyKinds(signals);
  const signalsText =
    trippedKinds.length > 0
      ? trippedKinds.join(', ')
      : signals.offAverage === null
        ? 'none tripped (no average baseline yet — offAverage not applicable)'
        : 'none tripped';

  const avgText =
    baseline.avgNetPayCents != null
      ? `$${(baseline.avgNetPayCents / 100).toFixed(2)} over last ${baseline.sampleSize}`
      : 'no baseline yet (new driver)';

  return `Summarize this DRAFT driver settlement and mirror the precomputed anomaly signals.

Settlement:
  Number:      ${settlement.settlementNumber}
  Driver:      ${settlement.driverName} (${settlement.driverId})
  Period:      ${settlement.periodStart ?? '?'} – ${settlement.periodEnd ?? '?'}
  Gross:       $${(settlement.grossPayCents / 100).toFixed(2)}
  Deductions:  $${(settlement.deductionsCents / 100).toFixed(2)}
  Net pay:     $${(settlement.netPayCents / 100).toFixed(2)}
  Loads:       ${settlement.lineItems.length}
  Deductions:  ${settlement.deductions.length}
  Age:         ${settlement.ageDays} days

Driver net-pay average: ${avgText}

Precomputed anomaly signals (deterministic — MIRROR these, do not recompute):
  ${signalsText}

Memory (operator rules + past flags/cautions for this driver):
${memoriesText}

Return a PerceiveVoice object with summary (≤280 chars), trippedSignals, looksClean, and confidence.`;
}
