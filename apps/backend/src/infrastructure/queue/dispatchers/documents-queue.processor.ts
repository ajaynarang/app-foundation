import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

/**
 * The single `WorkerHost` on the `documents` queue. Routes each job to the
 * handler that owns its name (`ratecon` → RateconJobHandler,
 * `parse-attachment` → EmailIntakeJobHandler). Being the only `@Processor` for
 * this queue, it wins every job — no competing-consumer race.
 *
 * Concurrency 5: document parsing is embarrassingly parallel; the real ceiling
 * is the AI vendor rate limit, not the worker count.
 */
@Injectable()
@Processor(QUEUE_NAMES.DOCUMENTS, { concurrency: 5 })
export class DocumentsQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(DocumentsQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.DOCUMENTS)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
