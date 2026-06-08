import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { OperationsModule } from '../../../domains/operations/operations.module';
import { InAppNotificationsModule } from '../../../domains/operations/notifications/notifications.module';
import { AlertNotificationsJobHandler } from '../../../domains/operations/alert-notifications.processor';
import { NotificationJobsHandler } from '../../../domains/operations/notifications/notification-cleanup.processor';
import { NotificationsQueueProcessor } from './notifications-queue.processor';

/**
 * Wires the single `notifications` queue dispatcher. Imports the modules that
 * export the two handler classes and assembles them into the queue's
 * handler-array token via an explicit factory.
 */
@Module({
  imports: [QueueModule, forwardRef(() => OperationsModule), forwardRef(() => InAppNotificationsModule)],
  providers: [
    NotificationsQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.NOTIFICATIONS),
      useFactory: (alerts: AlertNotificationsJobHandler, jobs: NotificationJobsHandler): QueueJobHandler[] => [
        alerts,
        jobs,
      ],
      inject: [AlertNotificationsJobHandler, NotificationJobsHandler],
    },
  ],
})
export class NotificationsQueueModule {}
