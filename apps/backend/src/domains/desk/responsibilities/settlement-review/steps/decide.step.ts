import { DeskEpisodeStepKind } from '@prisma/client';
import { SettlementReview } from '@app/shared-types';

import { PromptingService } from '../../../../prompting/prompting.service';
import { StructuredOutputService } from '../../../../ai/infrastructure/providers/structured-output.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { runStructuredLlmStep } from '../../../shared-steps/_llm-step.helper';
import { enforceAnomalyGuard } from '../anomaly-guard';
import type {
  SettlementReviewDecideOutput,
  SettlementReviewHydrateOutput,
  SettlementReviewPerceiveOutput,
} from '../step.types';

/**
 * decide step — LLM picks the action: approve | flag_anomaly | no_action.
 *
 * Sonnet (standard). The prompt states the hard rule "any anomaly ⇒ never
 * approve", but the WORKFLOW also enforces it deterministically in code after
 * this step runs (see enforceAnomalyGuard / the workflow). Anomalies are math,
 * not LLM judgment — the code guard is the source of truth.
 */
export async function decideStep(input: {
  episodeId: string;
  ctx: SettlementReviewHydrateOutput;
  perception: SettlementReviewPerceiveOutput;
}): Promise<SettlementReviewDecideOutput> {
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

  const raw = await runStructuredLlmStep<SettlementReviewDecideOutput>({
    episodeId: input.episodeId,
    agentId: episode.ownerAgentId,
    kind: DeskEpisodeStepKind.DECIDE,
    promptKey: 'desk.settlement_review.decide.v1',
    model: 'standard',
    schema: SettlementReview.SettlementReviewDecideSchema,
    userMessage,
    extractConfidence: (out) => out.confidence,
    structuredOutput: structured,
    prompting,
    stepWriter,
    prisma,
  });

  // DETERMINISTIC GUARD — anomalies are math, not judgment. If ANY anomaly
  // signal tripped, the action CANNOT be 'approve'. Force flag_anomaly here in
  // code regardless of what the LLM returned. This is the hard layer beneath
  // the prompt's soft rule. See anomaly-guard.ts.
  return enforceAnomalyGuard(raw, input.ctx.entity.signals);
}

function buildUserMessage(input: {
  ctx: SettlementReviewHydrateOutput;
  perception: SettlementReviewPerceiveOutput;
  trustLevel: string;
}): string {
  const { settlement, baseline, signals } = input.ctx.entity;
  const memoriesText = input.ctx.memories.length
    ? input.ctx.memories
        .map((m, i) => `[${i + 1}] ${m.scope}·${m.polarity} (confidence ${m.confidence.toFixed(2)}): ${m.content}`)
        .join('\n')
    : '(none)';

  const trippedKinds = SettlementReview.anomalyKinds(signals);
  const anomalyText =
    trippedKinds.length > 0
      ? `TRIPPED: ${trippedKinds.join(', ')} → you MUST flag_anomaly, you CANNOT approve.`
      : signals.offAverage === null
        ? 'none (no average baseline — offAverage not applicable, NOT an anomaly)'
        : 'none — clean, eligible for approve';

  const avgText =
    baseline.avgNetPayCents != null
      ? `$${(baseline.avgNetPayCents / 100).toFixed(2)} over last ${baseline.sampleSize}`
      : 'no baseline yet (new driver)';

  return `Decide the action for this DRAFT driver settlement.

Perceived state:
  Summary:        ${input.perception.summary}
  Looks clean:    ${input.perception.looksClean}
  Perceive confidence: ${input.perception.confidence.toFixed(2)}

Settlement facts:
  Number:   ${settlement.settlementNumber}
  Driver:   ${settlement.driverName}
  Net pay:  $${(settlement.netPayCents / 100).toFixed(2)}
  Gross:    $${(settlement.grossPayCents / 100).toFixed(2)}
  Loads:    ${settlement.lineItems.length}
  Age:      ${settlement.ageDays} days
  Driver average: ${avgText}

Anomaly signals (deterministic): ${anomalyText}

Tenant trust level: ${input.trustLevel}

Memory (operator rules + past flags/cautions for this driver):
${memoriesText}

Pick one action:
  • approve       — clean, no anomaly, within range → offer one-tap approval
  • flag_anomaly  — any anomaly tripped → flag the specific reason (set anomalyKind)
  • no_action     — nothing to do (rare)

Return a DecideVoice object with action, reasoning, anomalyKind (if flag_anomaly), and confidence.`;
}
