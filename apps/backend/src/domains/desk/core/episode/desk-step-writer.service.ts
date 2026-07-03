import { Injectable, Logger } from '@nestjs/common';
import { DeskEpisodeStepStatus, type DeskEpisodeStepKind, type Prisma } from '@appshore/db';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';

const STEP_STATUS = DeskEpisodeStepStatus;

/**
 * Single writer for `desk_episode_steps` rows. Every step handler uses
 * this — open() at the start, succeeded() / failed() / gated() at the end.
 *
 * Why a dedicated service instead of inline Prisma calls in each step:
 *   - `sequence` must be monotonic per episode; centralizing the COUNT
 *     query keeps the logic in one place
 *   - Every step follows the same open/end pattern; DRY
 *   - Tests mock this one service instead of Prisma everywhere
 */
@Injectable()
export class DeskStepWriter {
  private readonly logger = new Logger(DeskStepWriter.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Insert a `status='RUNNING'` step row. Returns the row (id + sequence)
   * so the caller can feed them back into succeeded() / failed() / gated().
   */
  async open(input: {
    episodeId: string;
    kind: DeskEpisodeStepKind;
    agentId?: number | null;
    model?: string | null;
    promptKey?: string | null;
    toolName?: string | null;
    toolScope?: string | null;
    toolTier?: string | null;
  }) {
    const sequence = await this.nextSequence(input.episodeId);
    return this.prisma.deskEpisodeStep.create({
      data: {
        id: generateUuidV7(),
        episodeId: input.episodeId,
        sequence,
        kind: input.kind,
        status: STEP_STATUS.RUNNING,
        agentId: input.agentId ?? null,
        model: input.model ?? null,
        promptKey: input.promptKey ?? null,
        toolName: input.toolName ?? null,
        toolScope: input.toolScope ?? null,
        toolTier: input.toolTier ?? null,
      },
    });
  }

  /** Mark a step succeeded + populate outputs. */
  async succeeded(input: {
    stepId: string;
    output?: Record<string, unknown> | null;
    confidence?: number | null;
    /**
     * FK into `ai_invocations` written by AiTelemetryService — the single
     * source of truth for this step's token counts + USD cost. Join here
     * for cost-per-step. Optional because non-LLM step kinds (HYDRATE /
     * GATE / EXECUTE / CLOSE) have no invocation.
     */
    aiInvocationId?: string | null;
    toolArgs?: Record<string, unknown> | null;
    toolResult?: Record<string, unknown> | null;
    gateDecision?: Record<string, unknown> | null;
  }) {
    const startedAt = await this.getStartedAt(input.stepId);
    return this.prisma.deskEpisodeStep.update({
      where: { id: input.stepId },
      data: {
        status: STEP_STATUS.SUCCEEDED,
        output: (input.output ?? undefined) as Prisma.InputJsonValue | undefined,
        confidence: input.confidence ?? null,
        aiInvocationId: input.aiInvocationId ?? null,
        toolArgs: (input.toolArgs ?? undefined) as Prisma.InputJsonValue | undefined,
        toolResult: (input.toolResult ?? undefined) as Prisma.InputJsonValue | undefined,
        gateDecision: (input.gateDecision ?? undefined) as Prisma.InputJsonValue | undefined,
        finishedAt: new Date(),
        durationMs: startedAt ? Date.now() - startedAt.getTime() : null,
      },
    });
  }

  /** Mark a step failed + record error. */
  async failed(input: { stepId: string; errorMessage: string; aiInvocationId?: string | null }) {
    const startedAt = await this.getStartedAt(input.stepId);
    return this.prisma.deskEpisodeStep.update({
      where: { id: input.stepId },
      data: {
        status: STEP_STATUS.FAILED,
        errorMessage: input.errorMessage,
        aiInvocationId: input.aiInvocationId ?? null,
        finishedAt: new Date(),
        durationMs: startedAt ? Date.now() - startedAt.getTime() : null,
      },
    });
  }

  /**
   * Mark a gate step as `GATED` and attach the decision JSON. Unlike
   * succeeded(), the episode doesn't advance — the workflow will suspend
   * via `step.waitForEvent` and the next approval event wakes it.
   */
  async gated(input: { stepId: string; gateDecision: Record<string, unknown> }) {
    const startedAt = await this.getStartedAt(input.stepId);
    return this.prisma.deskEpisodeStep.update({
      where: { id: input.stepId },
      data: {
        status: STEP_STATUS.GATED,
        gateDecision: input.gateDecision as Prisma.InputJsonValue,
        finishedAt: new Date(),
        durationMs: startedAt ? Date.now() - startedAt.getTime() : null,
      },
    });
  }

  /** Mark a step skipped (branch not taken). */
  async skipped(input: { stepId: string; reason?: string }) {
    return this.prisma.deskEpisodeStep.update({
      where: { id: input.stepId },
      data: {
        status: STEP_STATUS.SKIPPED,
        output: input.reason ? { reason: input.reason } : undefined,
        finishedAt: new Date(),
      },
    });
  }

  private async nextSequence(episodeId: string): Promise<number> {
    const last = await this.prisma.deskEpisodeStep.findFirst({
      where: { episodeId },
      orderBy: { sequence: 'desc' },
      select: { sequence: true },
    });
    return (last?.sequence ?? -1) + 1;
  }

  private async getStartedAt(stepId: string): Promise<Date | null> {
    const row = await this.prisma.deskEpisodeStep.findUnique({
      where: { id: stepId },
      select: { startedAt: true },
    });
    return row?.startedAt ?? null;
  }
}
