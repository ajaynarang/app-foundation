import { Global, Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { EventPersistenceSubscriber } from './event-persistence.subscriber';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { DurableEventProcessor } from './durable-event.processor';
import { TenantIdResolver } from '@appshore/platform/infrastructure/events/tenant-id-resolver.service';
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
  providers: [EventPersistenceSubscriber, DomainEventService, DurableEventProcessor, TenantIdResolver],
  exports: [EventEmitterModule, DomainEventService, EventPersistenceSubscriber, TenantIdResolver],
})
export class EventBusModule {}
