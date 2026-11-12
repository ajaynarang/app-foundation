import { Global, Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { EventPersistenceSubscriber } from './event-persistence.subscriber';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DurableEventProcessor } from './durable-event.processor';
import { TenantIdResolver } from '@appshore/platform/infrastructure/events/tenant-id-resolver.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { OutboundWebhooksModule } from '../webhooks/outbound-webhooks.module';

@Global()
@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      ignoreErrors: false,
    }),
    PrismaModule,
    forwardRef(() => OutboundWebhooksModule),
  ],
  // OutboxService is global: every write that raises a domain event stages it here (ADR "Outbox and deadlines").
  providers: [EventPersistenceSubscriber, DomainEventService, OutboxService, DurableEventProcessor, TenantIdResolver],
  exports: [EventEmitterModule, DomainEventService, OutboxService, EventPersistenceSubscriber, TenantIdResolver],
})
export class EventBusModule {}
