import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { QueueModule } from '../queue/queue.module';
import { WebhookSubscriptionService } from './subscription.service';
import { WebhookDispatcher } from './dispatcher.service';
import { WebhookDeliveryProcessor } from './delivery.processor';
import { SubscriptionController } from './subscription.controller';

@Module({
  imports: [
    PrismaModule,
    // QueueModule registers all 14 queues centrally (including WEBHOOKS) and
    // exports DeadLetterService for the @OnWorkerEvent('failed') handler.
    // forwardRef breaks the module cycle: OutboundWebhooks → Queue → Cache →
    // EventBus → (forwardRef) OutboundWebhooks. EventBus already forwardRefs
    // both its back-edges; this edge needs it too, or QueueModule resolves to
    // `undefined` at scan time and the whole app fails to boot.
    forwardRef(() => QueueModule),
  ],
  controllers: [SubscriptionController],
  providers: [WebhookSubscriptionService, WebhookDispatcher, WebhookDeliveryProcessor],
  exports: [WebhookDispatcher],
})
export class OutboundWebhooksModule {}
