import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

/**
 * The single `WorkerHost` on the `finance` queue. Routes by job name to the
 * accounting-sync handler (invoice/settlement/payment/…), the trial-expiry cron,
 * and the add-on usage-reset cron — no competing-consumer race.
 */
@Injectable()
@Processor(QUEUE_NAMES.FINANCE, { concurrency: 3 })
export class FinanceQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(FinanceQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.FINANCE)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
