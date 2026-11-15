import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { BaseQueueDispatcher } from '@appshore/platform/infrastructure/queue/base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DeadLetterService } from '@appshore/platform/infrastructure/queue/dead-letter.service';

/**
 * The single `WorkerHost` on the `ai-background` queue: AI work nobody is waiting on (embedding a changed record
 * for search). Two at a time, so a slow provider call does not stall the next job. Routes by job name.
 */
@Injectable()
@Processor(QUEUE_NAMES.AI_BACKGROUND, { concurrency: 2 })
export class AiBackgroundQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(AiBackgroundQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.AI_BACKGROUND)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
