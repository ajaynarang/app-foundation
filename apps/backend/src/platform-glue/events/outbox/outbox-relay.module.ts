import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { OutboxRelay } from '@appshore/platform/infrastructure/events/outbox-relay.service';
import { OutboxRelayJobHandler } from '@appshore/platform/infrastructure/events/outbox-relay.handler';
import { QueueModule } from '../../queue/queue.module';
import { OutboxRelayScheduler } from './outbox-relay.scheduler';

/**
 * The outbox relay (ADR "Outbox and deadlines"): the platform's relay and its bulk-ops handler, and the
 * app-side tick that drives it. `OutboxService` itself is global (EventBusModule). The handler is wired into
 * the bulk-ops dispatcher's factory; `bulk-ops-handlers.spec.ts` fails if it is not.
 */
@Module({
  imports: [PrismaModule, QueueModule],
  providers: [OutboxRelay, OutboxRelayJobHandler, OutboxRelayScheduler],
  exports: [OutboxRelayJobHandler],
})
export class OutboxRelayModule {}
