import { Module } from '@nestjs/common';

import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DeskInngestModule } from '../inngest/inngest.module';

import { DomainEventBridge } from './domain-event-bridge.service';
import { TriggerService } from './trigger.service';

/**
 * Desk trigger layer — fan-out + domain event bridge.
 *
 * - TriggerService: manual + scheduled entrypoint that opens episodes +
 *   publishes `<app>/desk.<responsibility>.run` Inngest events. The starter
 *   ships an empty responsibility registry, so it fail-closes on every key.
 * - DomainEventBridge: listens to domain events and can close/start episodes.
 */
@Module({
  imports: [PrismaModule, DeskInngestModule],
  providers: [TriggerService, DomainEventBridge],
  exports: [TriggerService],
})
export class DeskTriggerModule {}
