import { Logger } from '@nestjs/common';
import { DeskEpisodeStepKind } from '@prisma/client';

import { nestApp } from '../core/inngest/nest-context';
import { DeskStepWriter } from '../core/episode/desk-step-writer.service';
import { DeskMemoryReinforcer } from '../core/memory/desk-memory-reinforcer.service';
import { DeskMemoryWriterService } from '../core/memory/desk-memory-writer.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';

import { TERMINAL_STATUS_BY_OUTCOME, type DeskOutcome } from './outcomes';
import type { CloseInput, CloseOutput, SharedHydrateOutput } from './step.types';

const logger = new Logger('closeStep');

/**
 * close step — terminal. Sets episode status + outcome, writes one
 * desk_episode_steps row with kind='close'. When the caller supplies
 * a `transition`, also:
 *   1. Writes a memory via DeskMemoryWriterService (8 close transitions
 *      drive scope+polarity+confidence per design doc).
 *   2. Reinforces every memory hydrate retrieved this run via
 *      DeskMemoryReinforcer.
 *
 * Memory writes + reinforcement are advisory: failures log + continue;
 * they never break the operational episode-close path. The episode
 * status update remains the source of truth.
 */
export async function closeStep(input: CloseInput): Promise<CloseOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const memoryWriter = app.get(DeskMemoryWriterService);
  const reinforcer = app.get(DeskMemoryReinforcer);
  const events = app.get(DomainEventService);

  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.CLOSE,
  });

  try {
    const terminalStatus =
      input.terminalStatus ?? TERMINAL_STATUS_BY_OUTCOME[input.outcome as DeskOutcome] ?? 'RESOLVED';
    const closedAt = new Date();

    const episode = await prisma.deskEpisode.update({
      where: { id: input.episodeId },
      data: {
        status: terminalStatus,
        outcome: input.outcome,
        outcomeNote: input.outcomeNote ?? null,
        closedAt,
      },
      select: {
        id: true,
        tenantId: true,
        ownerAgentId: true,
        entityType: true,
        entityId: true,
        retrievedMemoryIds: true,
        responsibility: { select: { key: true } },
      },
    });

    if (input.transition) {
      const responsibilityKey = episode.responsibility.key;
      const hydrateOutput = await loadHydrateOutput(prisma, episode.id);
      const entityRef = buildEntityRef(episode, hydrateOutput);
      const hydrateContext = serializeHydrate(hydrateOutput);

      // Memory write — best-effort. Log + continue on failure; never
      // break the operational close path.
      await memoryWriter
        .write({
          tenantId: episode.tenantId,
          agentId: episode.ownerAgentId,
          episodeId: episode.id,
          transition: input.transition,
          entityRef,
          hydrateContext,
          outcome: input.outcome,
          outcomeNote: input.outcomeNote,
          responsibilityKey,
        })
        .catch((err) => logger.warn(`memory.write failed for ${episode.id}: ${describeError(err)}`));

      // Reinforce the memories Sally actually used this run.
      if (episode.retrievedMemoryIds.length > 0) {
        await reinforcer
          .reinforce({
            retrievedMemoryIds: episode.retrievedMemoryIds,
            responsibilityKey,
            transition: input.transition,
            entityRef,
            outcome: input.outcome,
          })
          .catch((err) => logger.warn(`memory.reinforce failed for ${episode.id}: ${describeError(err)}`));
      }
    }

    await stepWriter.succeeded({
      stepId: step.id,
      output: {
        episodeId: episode.id,
        outcome: input.outcome,
        closedAt: closedAt.toISOString(),
      },
    });

    // Episode closed — tell the Desk UI to refresh the Needs-you + Handled
    // lists and the handoff counts live (SSE). Best-effort: a failed emit must
    // never break the operational close path.
    await events
      .emit(SALLY_EVENTS.DESK_EPISODE_CHANGED, episode.tenantId, {
        tenantId: episode.tenantId,
        episodeId: episode.id,
        status: terminalStatus,
      })
      .catch((err) => logger.warn(`DESK_EPISODE_CHANGED emit failed for ${episode.id}: ${describeError(err)}`));

    return {
      episodeId: episode.id,
      outcome: input.outcome,
      closedAt: closedAt.toISOString(),
    };
  } catch (err) {
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * Build the entityRef used by the memory writer + reinforcer. Merges the
 * responsibility's relationship keys (from its hydrate output's
 * `relationshipRef`) so memories key at the counterparty level — customer
 * for invoices, driver for settlements — rather than only the one-off
 * entity. Job-blind: the shared close step never reads a per-responsibility
 * entity shape; each responsibility names its own keys on its hydrate output.
 */
function buildEntityRef(
  episode: { entityType: string | null; entityId: string | null },
  hydrate: SharedHydrateOutput | null,
): Record<string, unknown> {
  const ref: Record<string, unknown> = {};
  if (episode.entityType) ref.entityType = episode.entityType;
  if (episode.entityId) ref.entityId = episode.entityId;
  if (hydrate?.relationshipRef) {
    for (const [key, value] of Object.entries(hydrate.relationshipRef)) {
      if (value) ref[key] = value;
    }
  }
  return ref;
}

async function loadHydrateOutput(prisma: PrismaService, episodeId: string): Promise<SharedHydrateOutput | null> {
  const row = await prisma.deskEpisodeStep.findFirst({
    where: { episodeId, kind: DeskEpisodeStepKind.HYDRATE },
    orderBy: { sequence: 'asc' },
    select: { output: true },
  });
  return (row?.output ?? null) as unknown as SharedHydrateOutput | null;
}

function serializeHydrate(hydrate: SharedHydrateOutput | null): string {
  if (!hydrate) return '';
  try {
    return JSON.stringify(hydrate);
  } catch {
    return '';
  }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
