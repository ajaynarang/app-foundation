import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@appshore/db';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { InngestClientService } from '../inngest/inngest.client';
import { OPEN_EPISODE_STATUSES, EpisodeStatusSchema } from '../types';

const EPISODE_STATUS = EpisodeStatusSchema.enum;

/**
 * TriggerService — the entry point that opens episodes + publishes Inngest
 * events for responsibility runs.
 *
 * This is the generic engine. The starter ships with an EMPTY responsibility
 * registry, so `runByKey` has nothing to dispatch to and fail-closes on any
 * key. To add a responsibility:
 *   1. Register its definition in `responsibilities/index.ts`.
 *   2. Add a fan-out + per-entity `upsertEpisode` + `inngest.send` loop here
 *      (one `run<X>ForTenant` method), and wire it into `runByKey`.
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
    private readonly events: DomainEventService,
  ) {}

  /**
   * Generic dispatch — run whichever responsibility `key` names for one tenant.
   * The starter registry is empty, so every key fail-closes with a
   * BadRequestException. Wire `case '<your-key>': return this.run...` here as
   * you add responsibilities.
   *
   * `key` is typed `string` (not a narrowed union) because callers pass it
   * straight off the DB `desk_responsibilities.key` column.
   */
  async runByKey(key: string, _tenantId: number): Promise<RunResult> {
    switch (key) {
      // Register your responsibility run methods here, e.g.:
      //   case 'welcome':
      //     return this.runWelcomeForTenant(_tenantId);
      default:
        throw new BadRequestException(`No run method wired for responsibility ${key}`);
    }
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

    const created = await this.prisma.deskEpisode.create({
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
        // Inngest owns the temporal_workflow_id field conceptually; we store the
        // dedupe key for a stable cross-system reference the UI can deep-link to.
        temporalWorkflowId: `inngest:${input.dedupeKey}`,
      },
      select: { id: true },
    });

    // A new episode opened — tell the Desk UI to refresh the Needs-you list +
    // handoff counts live. Best-effort — never fail the trigger on a dropped
    // event.
    await this.events
      .emit(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, input.tenantId, {
        tenantId: input.tenantId,
        episodeId: created.id,
        status: EPISODE_STATUS.RUNNING,
      })
      .catch((err) =>
        this.logger.warn(`DESK_EPISODE_CHANGED emit failed for ${created.id}: ${(err as Error).message}`),
      );

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
