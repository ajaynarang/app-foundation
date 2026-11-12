import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_FROZEN_24H } from '@appshore/kernel/constants/cache.constants';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { NotificationTriggersService } from '../../../notifications/notification-triggers.service';

/** The once-a-day claim per workspace. */
export function budgetReachedClaimKey(tenantId: number): string {
  return buildKey('app:ai-routing', 'budget-reached', tenantId);
}

/**
 * When a workspace's platform-paid AI spend hits its hard cap (`AI_BUDGET_HARD_BREACHED`), tell its owners and admins,
 * at most once a day per workspace: a capped workspace raises the signal on every AI call it attempts. The claim is an
 * atomic Redis `SET NX`, so two replicas never both notify. A failure here is logged; it never touches the AI call.
 */
@Injectable()
export class AiBudgetNudgeListener {
  private readonly logger = new Logger(AiBudgetNudgeListener.name);

  constructor(
    private readonly cache: AppCacheService,
    private readonly notifications: NotificationTriggersService,
  ) {}

  @OnEvent(DOMAIN_EVENTS.AI_BUDGET_HARD_BREACHED, { async: true })
  async onHardBreach(event: DomainEvent<Record<string, unknown>>): Promise<void> {
    const tenantId = Number(event.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) return;
    try {
      const first = await this.cache.claim(budgetReachedClaimKey(tenantId), true, CACHE_TTL_FROZEN_24H);
      if (!first) return;
      await this.notifications.aiBudgetReached(tenantId);
    } catch (err) {
      this.logger.warn(`AI budget notification failed for workspace ${tenantId}: ${(err as Error).message}`);
    }
  }
}
