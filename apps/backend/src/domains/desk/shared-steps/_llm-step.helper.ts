import type { DeskEpisodeStepKind } from '@prisma/client';
import type { ZodSchema } from 'zod';
import type { ModelAlias } from '@sally/shared-types';

import { AiSurface } from '@prisma/client';

import { StructuredOutputService } from '../../ai/infrastructure/providers/structured-output.service';
import { AI_LINK_REF_TYPES } from '../../ai/infrastructure/telemetry/ai-telemetry.constants';
import { PromptingService } from '../../prompting/prompting.service';
import { DeskStepWriter } from '../core/episode/desk-step-writer.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/**
 * Thin helper for Desk LLM steps that need structured (Zod-validated)
 * output. v1 AR Follow-up's 3 LLM steps all fit this shape:
 *   perceive → ArFollowupPerceiveSchema
 *   decide   → ArFollowupDecideSchema
 *   draft    → ArFollowupDraftSchema
 *
 * If a future step needs free-text LLM output, add a sibling
 * `runFreeTextLlmStep` helper — don't generalize this one.
 *
 * Responsibilities:
 *   1. Open a step row (kind = perceive|decide|draft)
 *   2. Load system prompt via PromptingService (LangFuse + fallback)
 *   3. Call AI SDK generateText with structured output (Zod schema)
 *   4. Succeed/fail the step row
 *   5. Return the validated object
 *
 * LLM call transport is direct (AI SDK via StructuredOutputService) — same
 * as Sally chat today. When InvocationPipelineService gains a runLlm()
 * surface we migrate here; for now tool calls go via pipeline, LLM calls
 * go direct. Design-doc §4.2 captures this split.
 */

export interface RunStructuredLlmStepInput<TSchema extends ZodSchema, TOutput = unknown> {
  episodeId: string;
  agentId: number | null;
  kind: Extract<DeskEpisodeStepKind, 'PERCEIVE' | 'DECIDE' | 'DRAFT'>;
  promptKey: string;
  promptVariables?: Record<string, string>;
  model: ModelAlias;
  schema: TSchema;
  userMessage: string;
  timeoutMs?: number;
  /** Extract a confidence number from the validated output, if present. */
  extractConfidence?: (output: TOutput) => number | null | undefined;
  /** Services — passed in so step handlers don't each call nestApp. */
  structuredOutput: StructuredOutputService;
  prompting: PromptingService;
  stepWriter: DeskStepWriter;
  /**
   * Prisma client — used to resolve `tenantId` from the episode for the AI
   * cost ledger. Passed in (not looked up via `nestApp`) so this helper
   * remains pure and easy to unit-test.
   */
  prisma: PrismaService;
}

export async function runStructuredLlmStep<TOutput>(
  input: RunStructuredLlmStepInput<ZodSchema, TOutput>,
): Promise<TOutput> {
  const step = await input.stepWriter.open({
    episodeId: input.episodeId,
    kind: input.kind,
    agentId: input.agentId,
    model: input.model,
    promptKey: input.promptKey,
  });

  // Resolve tenantId from the episode so AI cost telemetry can attribute
  // the call. Episode existence is already guaranteed by stepWriter.open
  // — if the FK constraint passed, the row is there.
  const episode = await input.prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: { tenantId: true },
  });

  try {
    const systemPrompt = await input.prompting.getPrompt(input.promptKey, input.promptVariables);

    const result = await input.structuredOutput.extract<TOutput>({
      messages: [{ role: 'user', content: input.userMessage }],
      schema: input.schema,
      modelAlias: input.model,
      systemPrompt,
      timeoutMs: input.timeoutMs ?? 30_000,
      // Desk steps are billable, user-supervised work — enforce the hard cap.
      // A blocked step surfaces as a FAILED step (the catch below) carrying
      // the budget message, which routes the episode to human review.
      enforceBudget: true,
      aiContext: {
        tenantId: episode.tenantId,
        surface: AiSurface.DESK_STEP,
        agentId: input.agentId != null ? String(input.agentId) : undefined,
        linkRefType: AI_LINK_REF_TYPES.DESK_EPISODE_STEP,
        linkRefId: step.id,
      },
    });

    if (!result.object) {
      throw new Error(`${input.kind} step: LLM returned no structured output (schema validation failed)`);
    }

    const confidence = input.extractConfidence?.(result.object) ?? null;

    await input.stepWriter.succeeded({
      stepId: step.id,
      output: result.object as unknown as Record<string, unknown>,
      confidence: confidence ?? null,
      aiInvocationId: result.aiInvocationId ?? null,
    });
    return result.object;
  } catch (err) {
    await input.stepWriter.failed({
      stepId: step.id,
      errorMessage: err instanceof Error ? err.message : String(err),
      // The error may carry an aiInvocationId stamped by the wrapper when
      // the failed model call was recorded. Stash it so failed steps still
      // join the cost ledger.
      aiInvocationId:
        err && typeof err === 'object' && 'aiInvocationId' in err
          ? ((err as Record<string, unknown>).aiInvocationId as string)
          : null,
    });
    throw err;
  }
}
