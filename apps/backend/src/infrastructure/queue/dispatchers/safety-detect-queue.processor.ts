import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

/**
 * The single `WorkerHost` on the `safety-detect` queue. Routes each job to the
 * handler that owns its name (`audit` → ShieldAuditJobHandler,
 * `load-monitoring` → LoadMonitoringJobHandler). Being the only `@Processor` for
 * this queue, it wins every job — fixing the competing-consumer race that
 * stranded scheduled Shield audits in QUEUED forever.
 */
@Injectable()
@Processor(QUEUE_NAMES.SAFETY_DETECT, { concurrency: 2 })
export class SafetyDetectQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(SafetyDetectQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.SAFETY_DETECT)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
