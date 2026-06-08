import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { InAppNotificationsModule } from '../../../domains/notifications/notifications.module';
import { NotificationJobsHandler } from '../../../domains/notifications/notification-cleanup.processor';
import { NotificationsQueueProcessor } from './notifications-queue.processor';

/**
 * Wires the single `notifications` queue dispatcher. Imports the module that
 * exports the housekeeping handler and assembles it into the queue's
 * handler-array token via an explicit factory.
 *
 * Register additional notification job handlers here as your app grows.
 */
@Module({
  imports: [QueueModule, forwardRef(() => InAppNotificationsModule)],
  providers: [
    NotificationsQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.NOTIFICATIONS),
      useFactory: (jobs: NotificationJobsHandler): QueueJobHandler[] => [jobs],
      inject: [NotificationJobsHandler],
    },
  ],
})
export class NotificationsQueueModule {}
