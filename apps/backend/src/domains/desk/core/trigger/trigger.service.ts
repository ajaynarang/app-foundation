import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { InngestClientService } from '../inngest/inngest.client';
import { OPEN_EPISODE_STATUSES, EpisodeStatusSchema } from '../types';
import { findQuietTicketsForTenant } from '../../responsibilities/support-followup/fan-out';
import { SupportFollowupConditionsSchema } from '../../responsibilities/support-followup/schemas';
import { SUPPORT_FOLLOWUP_KEY, SUPPORT_TICKET_ENTITY } from '../../responsibilities/support-followup/step.types';

const EPISODE_STATUS = EpisodeStatusSchema.enum;

/**
 * TriggerService — the entry point that opens episodes + publishes Inngest
 * events for responsibility runs.
 *
 * This is the generic engine. The starter wires one run method, the reference
 * job's (`runSupportFollowupForTenant`); `runByKey` fail-closes on any other
 * key. To add a responsibility:
 *   1. Register its definition in `responsibilities/index.ts`.
 *   2. Add a fan-out + per-entity `upsertEpisode` + `inngest.send` loop here
 *      (one `run<X>ForTenant` method, shaped like the reference job's), and
 *      wire it into `runByKey`.
 *
 * `upsertEpisode` (partial-unique dedupe + suppression + open-episode reuse +
 * SSE refresh event) is fully generic and reusable by every responsibility.
 */
@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inngest: InngestClientService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Generic dispatch — run whichever responsibility `key` names for one tenant.
   * A key with no run method fail-closes with a BadRequestException. Wire
   * `case '<your-key>': return this.run...` here as you add responsibilities.
   *
   * `key` is typed `string` (not a narrowed union) because callers pass it
   * straight off the DB `desk_responsibilities.key` column.
   */
  async runByKey(key: string, tenantId: number): Promise<RunResult> {
    switch (key) {
      case SUPPORT_FOLLOWUP_KEY:
        return this.runSupportFollowupForTenant(tenantId);
      // Register your responsibility run methods here.
      default:
        throw new BadRequestException(`No run method wired for responsibility ${key}`);
    }
  }

  /**
   * The reference job's run: one episode per quiet support ticket, then one Inngest event per episode. Called by
   * "Run now" and by the scheduler. Every run method has the same four guards (seeded, enabled, available, a
   * supervisor to act for), the same dedupe and suppression (in `upsertEpisode`), and its own fan-out.
   */
  async runSupportFollowupForTenant(tenantId: number): Promise<RunResult> {
    const key = SUPPORT_FOLLOWUP_KEY;
    const responsibility = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: {
        id: true,
        agentId: true,
        enabled: true,
        lifecycle: true,
        trustLevel: true,
        conditions: true,
        agent: { select: { supervisorUserId: true } },
      },
    });

    if (!responsibility) {
      this.logger.warn(`${key} not seeded for tenant ${tenantId}`);
      return { episodesOpened: 0, skipped: 'responsibility_not_seeded' };
    }
    if (!responsibility.enabled || responsibility.lifecycle !== 'AVAILABLE') {
      return { episodesOpened: 0, skipped: responsibility.enabled ? 'not_available' : 'disabled' };
    }
    // The execute step acts for the agent's supervisor. Without one, stop here instead of failing every episode.
    if (responsibility.agent.supervisorUserId == null) {
      this.logger.warn(`${key} tenant ${tenantId}: agent has no supervisor, skipping`);
      return { episodesOpened: 0, skipped: 'no_supervisor' };
    }

    // The operator's own wait decides which tickets count as quiet.
    const conditions = SupportFollowupConditionsSchema.parse(responsibility.conditions ?? {});
    const tickets = await findQuietTicketsForTenant(this.prisma, tenantId, {
      staleAfterDays: conditions.staleAfterDays,
    });

    const firedAt = new Date();
    const today = firedAt.toISOString().slice(0, 10);
    let opened = 0;
    let reused = 0;

    for (const ticket of tickets) {
      const dedupeKey = `${key}:${SUPPORT_TICKET_ENTITY}:${ticket.ticketNumber}`;
      const episode = await this.upsertEpisode({
        tenantId,
        responsibilityKey: key,
        entityType: SUPPORT_TICKET_ENTITY,
        entityId: ticket.ticketNumber,
        entityLabel: `${ticket.ticketNumber} · ${ticket.subject.slice(0, 80)} · quiet ${ticket.daysQuiet}d`,
        responsibilityId: responsibility.id,
        ownerAgentId: responsibility.agentId,
        trustLevelSnapshot: responsibility.trustLevel,
        conditionsSnapshot: responsibility.conditions,
        trigger: { kind: 'SCHEDULED', label: 'Support follow-up sweep', source: 'trigger.service', firedAt },
        dedupeKey,
      });
      // Suppressed for this ticket: no episode, no event.
      if ('skipped' in episode) continue;
      if (episode.isNew) opened++;
      else reused++;

      // The date is in the key, so a ticket can be picked up again on a later day once its earlier run has closed.
      const idempotencyKey = `${dedupeKey}:${today}`;
      await this.inngest.send(
        'app/desk.support_followup.run',
        { episodeId: episode.id, tenantId, ticketNumber: ticket.ticketNumber, idempotencyKey },
        { id: idempotencyKey },
      );
    }

    this.logger.log(`${key} tenant ${tenantId}: opened=${opened} reused=${reused} (${tickets.length} quiet tickets)`);
    return { episodesOpened: opened, episodesReused: reused };
  }

  /**
   * Upsert an episode using the partial unique index on dedupeKey. If an open
   * episode already exists for the same (tenantId, dedupeKey), we reuse it
   * rather than failing — "recurring triggers wake existing episodes".
   *
   * Before the upsert, we consult `desk_entity_suppressions`. An active,
   * unexpired, unsuppressed row short-circuits the trigger — the caller does
   * not count this as opened or reused and does NOT publish an Inngest event.
   *
   * This method is the reusable building block every responsibility's fan-out
   * loop should call. Kept `protected` so responsibility run methods added to
   * this service can use it.
   */
  protected async upsertEpisode(input: {
    tenantId: number;
    responsibilityKey: string;
    entityType: string;
    entityId: string;
    /** Human-readable label shown on the episode card; responsibility-shaped. */
    entityLabel: string;
    responsibilityId: number;
    ownerAgentId: number;
    trustLevelSnapshot: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
    conditionsSnapshot: Prisma.InputJsonValue;
    trigger: {
      kind: 'SCHEDULED' | 'DOMAIN_EVENT' | 'WEBHOOK' | 'MANUAL';
      label: string;
      source: string;
      firedAt: Date;
    };
    dedupeKey: string;
  }): Promise<{ id: string; isNew: boolean } | { skipped: 'suppressed'; suppressionId: string }> {
    // Suppression skip — covered by the partial index
    // `idx_desk_entity_suppressions_lookup` (WHERE unsuppressed_at IS NULL).
    const activeSuppression = await this.prisma.deskEntitySuppression.findFirst({
      where: {
        tenantId: input.tenantId,
        responsibilityKey: input.responsibilityKey,
        entityType: input.entityType,
        entityId: input.entityId,
        unsuppressedAt: null,
        OR: [{ suppressUntil: null }, { suppressUntil: { gt: new Date() } }],
      },
      select: { id: true, suppressUntil: true },
    });
    if (activeSuppression) {
      this.logger.log(
        `desk-trigger-skipped-suppressed tenant=${input.tenantId} dedupe=${input.dedupeKey} until=${activeSuppression.suppressUntil?.toISOString() ?? 'forever'}`,
      );
      return { skipped: 'suppressed', suppressionId: activeSuppression.id };
    }

    // Look for an already-open episode for this entity. The partial unique
    // index enforces uniqueness on (tenantId, dedupeKey) WHERE status IN
    // ('RUNNING', 'WAITING_APPROVAL'), but we read first so we can return isNew.
    const existing = await this.prisma.deskEpisode.findFirst({
      where: {
        tenantId: input.tenantId,
        dedupeKey: input.dedupeKey,
        status: { in: [...OPEN_EPISODE_STATUSES] },
      },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, isNew: false };
    }

    // A new episode opened — the Desk UI refreshes the Needs-you list + handoff counts live. The event
    // commits with the episode (ADR "Outbox and deadlines"); publishing never fails the trigger.
    const created = await this.outbox.transaction(async (tx, emit) => {
      const row = await tx.deskEpisode.create({
        data: {
          id: generateUuidV7(),
          tenantId: input.tenantId,
          responsibilityId: input.responsibilityId,
          ownerAgentId: input.ownerAgentId,
          trustLevelSnapshot: input.trustLevelSnapshot,
          conditionsSnapshot: input.conditionsSnapshot,
          triggerKind: input.trigger.kind,
          triggerLabel: input.trigger.label,
          triggerSource: input.trigger.source,
          triggerFiredAt: input.trigger.firedAt,
          entityType: input.entityType,
          entityId: input.entityId,
          entityLabel: input.entityLabel,
          status: EPISODE_STATUS.RUNNING,
          dedupeKey: input.dedupeKey,
          // Inngest owns the workflow_id field conceptually; we store the
          // dedupe key for a stable cross-system reference the UI can deep-link to.
          workflowId: `inngest:${input.dedupeKey}`,
        },
        select: { id: true },
      });
      await emit(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, input.tenantId, {
        tenantId: input.tenantId,
        episodeId: row.id,
        status: EPISODE_STATUS.RUNNING,
      });
      return row;
    });

    return { id: created.id, isNew: true };
  }

  /** Reserved so the Inngest client stays wired even with no responsibilities. */
  protected get inngestClient(): InngestClientService {
    return this.inngest;
  }
}

export interface RunResult {
  episodesOpened: number;
  episodesReused?: number;
  skipped?: 'responsibility_not_seeded' | 'not_available' | 'disabled' | 'no_supervisor' | 'stale_audit';
}
