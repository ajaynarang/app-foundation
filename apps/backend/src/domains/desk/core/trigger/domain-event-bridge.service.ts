import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

/**
 * DomainEventBridge — listens to domain events that might affect open Desk
 * episodes and reacts (e.g. close an open episode when its subject is
 * resolved out-of-band).
 *
 * This is an extension point. The starter ships it WIRED but with no
 * listeners. Add `@OnEvent('<your.event>')` handlers here to react to domain
 * events — typically to CLOSE open episodes via a direct Prisma update.
 *
 * AUTONOMY INVARIANT: a bridge that CLOSES episodes is always safe. If you ever
 * extend this to START a responsibility run (call `TriggerService.runByKey`
 * off a domain event), that path is a non-manual trigger and MUST first gate on
 * `DeskResponsibilityService.canRunAutonomously(tenantId, key)` — exactly like
 * the scheduler — so a domain event can't run a responsibility while the tenant
 * master switch or the per-responsibility autonomy switch is off.
 */
@Injectable()
export class DomainEventBridge {
  // Logger + Prisma are injected so handlers you add have everything they need.
  protected readonly logger = new Logger(DomainEventBridge.name);

  constructor(protected readonly prisma: PrismaService) {}

  // Example (uncomment + adapt):
  //
  // @OnEvent('your.entity.resolved')
  // async onEntityResolved(event: { tenantId: number; data: { entityId: string } }) {
  //   await this.prisma.deskEpisode.updateMany({
  //     where: {
  //       tenantId: event.tenantId,
  //       entityId: event.data.entityId,
  //       status: { in: [...OPEN_EPISODE_STATUSES] },
  //     },
  //     data: { status: 'RESOLVED', outcome: DESK_OUTCOMES.NO_ACTION_NEEDED, closedAt: new Date() },
  //   });
  // }
}
