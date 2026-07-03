import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DESK_OUTCOMES } from '../../shared-steps/outcomes';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { SnoozeDuration } from '../types';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { closeStep } from '../../shared-steps/close.step';

/**
 * Canned snooze durations mapped to millisecond offsets. `forever` → `null`
 * suppressUntil (permanent until explicitly cleared). Matches design spec D16.
 */
const DAY_MS = 86_400_000;
const DURATION_MS: Record<SnoozeDuration, number | null> = {
  '1d': DAY_MS,
  '3d': 3 * DAY_MS,
  '1w': 7 * DAY_MS,
  '1mo': 30 * DAY_MS,
  forever: null,
};

/**
 * SuppressionService — owner of DeskEntitySuppression lifecycle.
 *
 * Two surfaces:
 *   • snooze(...)   — POST /desk/episodes/:id/snooze
 *       Closes the episode with outcome=rejected_by_operator and creates
 *       (or extends) a desk_entity_suppressions row on the episode's
 *       (tenantId, responsibilityKey, entityType, entityId) tuple.
 *       TriggerService consults these rows before upserting new episodes
 *       on the next sweep — snoozed entities never re-surface until the
 *       window elapses or the suppression is cleared.
 *
 *   • unsnooze(...) — POST /desk/suppressions/:id/unsnooze
 *       Sets unsuppressed_at + unsuppressed_by_user_id. Next scheduled
 *       sweep will re-open an episode for the entity if it's still
 *       eligible (e.g. invoice still overdue).
 *
 * Double-snooze extends existing active suppression to `max(current, new)`
 * — never shortens. `null` (forever) beats any timestamp. This prevents a
 * operator who already said "hide for a month" from accidentally
 * shortening the window by clicking "1 day" the next morning.
 *
 * DomainEvents:
 *   • app.desk.episode.snoozed      — when snooze() completes
 *   • app.desk.suppression.cleared  — when unsnooze() completes
 * Both wrap `new DomainEvent(...)` so wildcard subscribers
 * (CacheInvalidationSubscriber, DomainEventSseBridge, WebhookDispatcher)
 * receive the canonical event envelope.
 */
@Injectable()
export class SuppressionService {
  private readonly logger = new Logger(SuppressionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  async snooze(input: {
    episodeId: string;
    tenantId: number;
    userId: number;
    duration: SnoozeDuration;
    reason?: string;
  }) {
    // 1. Resolve episode within the tenant — 404 for missing or cross-tenant.
    const episode = await this.prisma.deskEpisode.findFirst({
      where: { id: input.episodeId, tenantId: input.tenantId },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        responsibility: { select: { key: true } },
      },
    });
    if (!episode) throw new NotFoundException('Episode not found');

    // 2. Reject snooze on non-entity episodes. The suppression tuple needs a
    //    real (entityType, entityId) pair — empty-string fallbacks create
    //    ghost rows the partial unique index can't meaningfully enforce.
    if (!episode.entityType || !episode.entityId) {
      throw new BadRequestException('Cannot snooze an episode without an entity reference');
    }

    // 2. Compute requested suppressUntil — `forever` → null.
    const ms = DURATION_MS[input.duration];
    const requestedUntil = ms === null ? null : new Date(Date.now() + ms);

    // 3. Look for an existing active suppression on the same tuple.
    //    Partial unique index (unsuppressed_at IS NULL) guarantees at most
    //    one active row per (tenant, responsibility, entity).
    const existing = await this.prisma.deskEntitySuppression.findFirst({
      where: {
        tenantId: input.tenantId,
        responsibilityKey: episode.responsibility.key,
        entityType: episode.entityType ?? '',
        entityId: episode.entityId ?? '',
        unsuppressedAt: null,
      },
    });

    // 4. Extend existing to max(current, new) — never shorten.
    //    `null` (forever) beats any timestamp in both directions.
    let suppression;
    if (existing) {
      const finalUntil =
        existing.suppressUntil === null || requestedUntil === null
          ? null
          : new Date(Math.max(existing.suppressUntil.getTime(), requestedUntil.getTime()));
      suppression = await this.prisma.deskEntitySuppression.update({
        where: { id: existing.id },
        data: {
          suppressUntil: finalUntil,
          // Only overwrite reason if caller supplied one — otherwise keep the
          // prior operator note so audit stays meaningful across multiple snoozes.
          reason: input.reason ?? existing.reason,
        },
      });
    } else {
      suppression = await this.prisma.deskEntitySuppression.create({
        data: {
          tenantId: input.tenantId,
          responsibilityKey: episode.responsibility.key,
          entityType: episode.entityType ?? '',
          entityId: episode.entityId ?? '',
          suppressUntil: requestedUntil,
          reason: input.reason ?? null,
          setByUserId: input.userId,
          sourceEpisodeId: episode.id,
        },
      });
    }

    // 5. Close the episode — snooze is a distinct operator decision (D14),
    //    not an approval reject, so we terminate directly rather than going
    //    through ApprovalService.decide. Outcome = rejected_by_operator so
    //    this shows up under Handled → Rejected with a "snoozed until X"
    //    badge rendered from the activeSuppression join. transition='snooze'
    //    drives a CORRECT memory write that captures the snooze duration.
    await closeStep({
      episodeId: episode.id,
      outcome: DESK_OUTCOMES.REJECTED_BY_OPERATOR,
      terminalStatus: 'REJECTED_BY_OPERATOR',
      outcomeNote: input.reason ?? undefined,
      transition: 'snooze',
    });

    // 6. Emit the DomainEvent. Wildcard subscribers pick this up for cache
    //    invalidation + SSE broadcast (Desk UI re-renders without polling).
    this.events.emit(
      DOMAIN_EVENTS.DESK_EPISODE_SNOOZED,
      new DomainEvent(DOMAIN_EVENTS.DESK_EPISODE_SNOOZED, String(input.tenantId), {
        episodeId: episode.id,
        suppressionId: suppression.id,
        suppressUntil: suppression.suppressUntil ? suppression.suppressUntil.toISOString() : null,
      }),
    );

    // 7. Structured log for audit trail (grep by `desk-snooze`).
    this.logger.log(
      `desk-snooze episodeId=${episode.id} suppressionId=${suppression.id} duration=${input.duration} until=${suppression.suppressUntil?.toISOString() ?? 'forever'} byUser=${input.userId}`,
    );

    return suppression;
  }

  async unsnooze(suppressionId: string, tenantId: number, userId: number) {
    // Tenant-scoped lookup — the id alone is not a capability. UUIDs leak
    // through logs / SSE / webhooks, and every service-layer read MUST
    // include tenantId per app-backend-patterns §3. Cross-tenant clear
    // is treated identically to missing (same 404) so we don't signal
    // existence to a caller outside the owning tenant.
    const row = await this.prisma.deskEntitySuppression.findFirst({
      where: { id: suppressionId, tenantId, unsuppressedAt: null },
    });
    if (!row) {
      throw new NotFoundException('Suppression not found or already cleared');
    }

    const updated = await this.prisma.deskEntitySuppression.update({
      where: { id: row.id },
      data: {
        unsuppressedAt: new Date(),
        unsuppressedByUserId: userId,
      },
    });

    this.events.emit(
      DOMAIN_EVENTS.DESK_SUPPRESSION_CLEARED,
      new DomainEvent(DOMAIN_EVENTS.DESK_SUPPRESSION_CLEARED, String(tenantId), {
        suppressionId: row.id,
      }),
    );

    this.logger.log(`desk-unsnooze suppressionId=${row.id} byUser=${userId}`);
    return updated;
  }
}
