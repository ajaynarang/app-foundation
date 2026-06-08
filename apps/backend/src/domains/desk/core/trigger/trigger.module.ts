import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../infrastructure/database/prisma.module';
import { ShieldModule } from '../../../operations/shield/shield.module';
import { DeskInngestModule } from '../inngest/inngest.module';

import { DomainEventBridge } from './domain-event-bridge.service';
import { TriggerService } from './trigger.service';

/**
 * Desk trigger layer — fan-out + domain event bridge.
 *
 * - TriggerService: manual + future-scheduled entrypoint that publishes
 *   sally/desk.<responsibility>.run events. Document Expiry uses
 *   ShieldService for the stale-audit guard's audit trigger.
 * - DomainEventBridge: listens to sally.* domain events; v1 closes
 *   AR Follow-up episodes on invoice.paid.
 */
@Module({
  imports: [PrismaModule, DeskInngestModule, ShieldModule],
  providers: [TriggerService, DomainEventBridge],
  exports: [TriggerService],
})
export class DeskTriggerModule {}
