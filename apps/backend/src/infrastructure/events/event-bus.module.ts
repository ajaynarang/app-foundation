import { Global, Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../database/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { EventPersistenceSubscriber } from './event-persistence.subscriber';
import { DomainEventService } from './domain-event.service';
import { DurableEventProcessor } from './durable-event.processor';
import { TenantIdResolver } from './tenant-id-resolver.service';
import { OutboundWebhooksModule } from '../outbound-webhooks/outbound-webhooks.module';

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
    forwardRef(() => QueueModule),
    forwardRef(() => OutboundWebhooksModule),
  ],
  providers: [EventPersistenceSubscriber, DomainEventService, DurableEventProcessor, TenantIdResolver],
  exports: [EventEmitterModule, DomainEventService, EventPersistenceSubscriber, TenantIdResolver],
})
export class EventBusModule {}
