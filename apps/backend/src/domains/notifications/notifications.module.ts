import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { InAppNotificationService } from './notifications.service';
import { NotificationDeliveryService } from './delivery.service';
import { ChannelResolutionService } from './channel-resolution.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { NotificationJobsHandler } from './notification-cleanup.processor';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../platform-glue/cache/cache.module';
import { SseModule } from '../../platform-glue/sse/sse.module';
import { PushModule } from '@appshore/platform/infrastructure/push/push.module';
import { SmsModule } from '@appshore/platform/infrastructure/sms/sms.module';
import { QueueModule } from '../../platform-glue/queue/queue.module';

@Module({
  imports: [PrismaModule, CacheModule, SseModule, PushModule, SmsModule, QueueModule],
  controllers: [NotificationsController],
  providers: [
    InAppNotificationService,
    NotificationDeliveryService,
    ChannelResolutionService,
    NotificationTriggersService,
    NotificationJobsHandler,
  ],
  exports: [
    InAppNotificationService,
    NotificationJobsHandler,
    NotificationDeliveryService,
    ChannelResolutionService,
    NotificationTriggersService,
  ],
})
export class InAppNotificationsModule {}
