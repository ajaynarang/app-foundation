import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { BaseQueueDispatcher } from '@appshore/platform/infrastructure/queue/base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';

/**
 * The single `WorkerHost` on the `notifications` queue. Routes by job name to
 * AlertNotificationsJobHandler (alert-* + shift-summary) or NotificationJobsHandler
 * (cleanup, document-expiry, invoice-overdue) — no competing-consumer race.
 */
@Injectable()
@Processor(QUEUE_NAMES.NOTIFICATIONS, { concurrency: 1 })
export class NotificationsQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(NotificationsQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.NOTIFICATIONS)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
