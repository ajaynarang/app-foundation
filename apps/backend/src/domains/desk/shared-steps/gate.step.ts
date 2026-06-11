import { DeskEpisodeStepKind } from '@prisma/client';
import { scopeTier } from '@app/shared-types';

import { nestApp } from '../core/inngest/nest-context';
import { ScopeRegistryService } from '../../ai/agent-contract/scope-registry.service';
import { DeskStepWriter } from '../core/episode/desk-step-writer.service';
import { ApprovalService } from '../core/approval/approval.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { findResponsibilityDefinition } from '../responsibilities';
import type { ConditionsResult } from '../responsibilities/definition.types';

import { decideGate, type GateDecisionInput } from '../core/gate/gate.algorithm';
import type { GateStepOutput, SharedHydrateOutput } from './step.types';

/** A responsibility with no conditions schema → conditions are always met. */
const NO_CONDITIONS: ConditionsResult = { conditionsMet: true, checks: {} };

/**
 * gate step — runtime-inserted before every `execute`.
 *
 * Composes:
 *   1. ScopeRegistryService.scopeForTool() — fresh lookup so drift is
 *      impossible (no hand-maintained list)
 *   2. The episode's responsibility evaluator (from RESPONSIBILITY_REGISTRY)
 *      → ConditionsResult. Absent (no conditions schema) ⇒ conditions met.
 *   3. Pure decideGate() from gate.algorithm — evaluates trust × conditions
 *      × confidence × tier
 *   4. Writes a step row with the decision
 *   5. If gated: creates a DeskApproval (via ApprovalService) and returns
 *      { needsApproval: true, approvalId }
 *   6. If not gated: returns { needsApproval: false }
 *
 * Responsibility-agnostic: gate has no per-responsibility branch. A new
 * responsibility supplies its own `conditionsEvaluator` on its registry
 * definition and the gate picks it up by key — zero edits here.
 *
 * The workflow (P1.7) uses the return to either suspend via
 * step.waitForEvent or proceed directly to the execute step.
 */
export async function gateStep(input: {
  episodeId: string;
  tool: string;
  proposedArgs: Record<string, unknown>;
  /** The proposed action surfaced on the approval row — e.g. a drafted
   *  email/message for a send act. Job-blind: any responsibility's draft
   *  shape is a plain record. For non-draft acts, the caller passes the
   *  raw args. */
  proposedAction?: Record<string, unknown>;
}): Promise<GateStepOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const scopeRegistry = app.get(ScopeRegistryService);
  const approvalService = app.get(ApprovalService);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      id: true,
      trustLevelSnapshot: true,
      conditionsSnapshot: true,
      responsibility: { select: { key: true } },
    },
  });

  const responsibilityKey = episode.responsibility.key;
  const definition = findResponsibilityDefinition(responsibilityKey);

  // Look up scope from the registry (the @RequiresScope on the @Tool class
  // is the single source of truth).
  const toolScope = scopeRegistry.scopeForTool(input.tool) ?? null;

  // Pull the most-recent LLM confidence from prior steps in this episode.
  const lastLlm = await prisma.deskEpisodeStep.findFirst({
    where: {
      episodeId: input.episodeId,
      kind: { in: [DeskEpisodeStepKind.PERCEIVE, DeskEpisodeStepKind.DECIDE, DeskEpisodeStepKind.DRAFT] },
      confidence: { not: null },
    },
    orderBy: { sequence: 'desc' },
    select: { confidence: true },
  });

  // Pull the hydrate output for the conditions evaluator. We re-read it
  // rather than thread it through every step call so gate stays self-
  // contained and robust to workflow refactors.
  const hydrateRow = await prisma.deskEpisodeStep.findFirst({
    where: { episodeId: input.episodeId, kind: DeskEpisodeStepKind.HYDRATE },
    orderBy: { sequence: 'asc' },
    select: { output: true },
  });
  const hydrateOutput = (hydrateRow?.output ?? null) as unknown as SharedHydrateOutput | null;
  if (!hydrateOutput) {
    throw new Error(`gate: no hydrate step output found for episode ${input.episodeId}`);
  }

  // Run the responsibility's own conditions evaluator. The gate is
  // job-blind: it hands the responsibility its OWN hydrate output verbatim
  // and the evaluator reads whatever fields its rules need. Absent (no
  // conditions schema) ⇒ conditions are met; the trust/confidence rules
  // in decideGate still apply.
  const conditionsResult: ConditionsResult = definition?.conditionsEvaluator
    ? definition.conditionsEvaluator(episode.conditionsSnapshot, hydrateOutput)
    : NO_CONDITIONS;

  // Open the gate step row
  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.GATE,
    toolName: input.tool,
    toolScope: toolScope ?? null,
    toolTier: toolScope ? scopeTier(toolScope) : null,
  });

  const gateInput: GateDecisionInput = {
    trustLevel: episode.trustLevelSnapshot,
    toolScope,
    conditionsResult,
    lastLlmConfidence: lastLlm?.confidence ?? null,
  };

  const decision = decideGate(gateInput);

  if (decision.gated) {
    const approval = await approvalService.create({
      episodeId: input.episodeId,
      stepId: step.id,
      proposedAction: input.proposedAction ?? input.proposedArgs,
    });

    await stepWriter.gated({
      stepId: step.id,
      gateDecision: {
        ...decision,
        approvalId: approval.id,
      },
    });

    return {
      needsApproval: true,
      approvalId: approval.id,
      rule: decision.rule,
    };
  }

  // Not gated — mark step succeeded + record the decision
  await stepWriter.succeeded({
    stepId: step.id,
    gateDecision: decision,
  });

  return { needsApproval: false, rule: decision.rule };
}
