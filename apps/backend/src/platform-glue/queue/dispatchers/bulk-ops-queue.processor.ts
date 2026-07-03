import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { BaseQueueDispatcher } from '@appshore/platform/infrastructure/queue/base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';

/**
 * The single `WorkerHost` on the `bulk-ops` queue. Routes by job name to the
 * cleanup handlers (data-retention/job-cleanup, uploads-cleanup,
 * login-events-cleanup) — no competing-consumer race.
 */
@Injectable()
@Processor(QUEUE_NAMES.BULK_OPS, { concurrency: 1 })
export class BulkOpsQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(BulkOpsQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.BULK_OPS)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
