import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { PlatformNotificationsModule } from '@appshore/platform/infrastructure/notifications/notifications.module';
import { CacheModule } from '../../platform-glue/cache/cache.module';
import { SseModule } from '../../platform-glue/sse/sse.module';
import { QueueModule } from '../../platform-glue/queue/queue.module';
import { NotificationsController } from './notifications.controller';
import { InAppNotificationService } from './notifications.service';
import { NotificationTriggersService } from './notification-triggers.service';
import { NotificationJobsHandler } from './notification-cleanup.processor';

/**
 * The app's side of notifications: the inbox, the cleanup sweep, and the named
 * triggers that speak this product's vocabulary. Channels, policy resolution,
 * delivery and the ledger are the platform's — see PlatformNotificationsModule.
 */
@Module({
  imports: [PrismaModule, CacheModule, SseModule, QueueModule, PlatformNotificationsModule],
  controllers: [NotificationsController],
  providers: [InAppNotificationService, NotificationTriggersService, NotificationJobsHandler],
  exports: [
    PlatformNotificationsModule,
    InAppNotificationService,
    NotificationTriggersService,
    NotificationJobsHandler,
  ],
})
export class InAppNotificationsModule {}
