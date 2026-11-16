import { DeskEpisodeStepKind, MemoryPolarity } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { DeskMemoryService } from '../../../core/memory/desk-memory.service';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';

import { wholeDaysBetween } from '../fan-out';
import { evaluatePreflight } from '../preflight';
import { SupportFollowupConditionsSchema } from '../schemas';
import { SUPPORT_TICKET_ENTITY, type HydrateInput, type HydrateOutput } from '../step.types';

const THREAD_MESSAGES = 10;
const DESCRIPTION_CHARS = 2_000;
const MESSAGE_CHARS = 1_000;

/**
 * hydrate: everything the later steps need, loaded once, with no model call.
 *
 *   1. The ticket and its last replies (tenant-scoped; internal notes are never loaded).
 *   2. How many follow-ups this job already sent on the ticket (its own closed episodes).
 *   3. The memories that apply.
 *   4. Preflight: is the ticket still open and still quiet?
 *
 * One step row either way, so a skipped episode still shows why.
 */
export async function hydrateStep(input: HydrateInput): Promise<HydrateOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const memoryService = app.get(DeskMemoryService);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      id: true,
      tenantId: true,
      ownerAgentId: true,
      responsibilityId: true,
      entityType: true,
      entityId: true,
      conditionsSnapshot: true,
    },
  });

  const step = await stepWriter.open({ episodeId: input.episodeId, kind: DeskEpisodeStepKind.HYDRATE });

  try {
    if (episode.entityType !== SUPPORT_TICKET_ENTITY || !episode.entityId) {
      throw new Error(
        `hydrate: support follow-up needs entityType=${SUPPORT_TICKET_ENTITY}; got ${episode.entityType}`,
      );
    }

    const row = await prisma.supportTicket.findFirst({
      where: { tenantId: episode.tenantId, ticketNumber: episode.entityId },
      select: {
        ticketNumber: true,
        subject: true,
        description: true,
        category: true,
        priority: true,
        status: true,
        createdAt: true,
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'desc' },
          take: THREAD_MESSAGES,
          select: { authorRole: true, content: true, createdAt: true },
        },
      },
    });
    if (!row) throw new Error(`hydrate: ticket ${episode.entityId} not found`);

    const now = new Date();
    const lastActivity = row.messages[0]?.createdAt ?? row.createdAt;
    const ticket: HydrateOutput['entity']['ticket'] = {
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      description: row.description.slice(0, DESCRIPTION_CHARS),
      category: row.category,
      priority: row.priority,
      status: row.status,
      openedAt: row.createdAt.toISOString(),
      daysQuiet: wholeDaysBetween(lastActivity, now),
    };
    const thread = [...row.messages].reverse().map((m) => ({
      authorRole: m.authorRole,
      content: m.content.slice(0, MESSAGE_CHARS),
      createdAt: m.createdAt.toISOString(),
    }));

    const priorFollowUpCount = await prisma.deskEpisode.count({
      where: {
        tenantId: episode.tenantId,
        responsibilityId: episode.responsibilityId,
        entityType: SUPPORT_TICKET_ENTITY,
        entityId: row.ticketNumber,
        outcome: DESK_OUTCOMES.FOLLOWUP_SENT,
      },
    });

    const memories = await memoryService.findRelevant({
      tenantId: episode.tenantId,
      agentId: episode.ownerAgentId,
      entityRef: { ticketNumber: ticket.ticketNumber, supportCategory: ticket.category },
      queryContext: `Support ticket ${ticket.ticketNumber} (${ticket.category}, ${ticket.priority}): "${ticket.subject}". No reply for ${ticket.daysQuiet} days.`,
      queryIntent: MemoryPolarity.REINFORCE,
      limit: 5,
    });
    // close.step reinforces exactly the memories this run used.
    if (memories.length > 0) {
      await prisma.deskEpisode.update({
        where: { id: episode.id },
        data: { retrievedMemoryIds: memories.map((m) => m.id) },
      });
    }

    const conditions = SupportFollowupConditionsSchema.parse(episode.conditionsSnapshot ?? {});
    const preflight = evaluatePreflight({
      status: ticket.status,
      daysQuiet: ticket.daysQuiet,
      staleAfterDays: conditions.staleAfterDays,
    });

    const output: HydrateOutput = {
      entity: { ticket, thread, priorFollowUpCount },
      memories,
      preflight,
      // Lessons are kept per ticket category, not per one-off ticket.
      relationshipRef: { supportCategory: ticket.category },
    };

    await stepWriter.succeeded({ stepId: step.id, output: output as unknown as Record<string, unknown> });
    return output;
  } catch (err) {
    await stepWriter.failed({ stepId: step.id, errorMessage: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
