import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

/**
 * The single `WorkerHost` on the `vendor-data` queue. Routes by job name to the
 * five handlers (TMS sync, oauth-refresh, load-board-poll, edi-tender-expiry,
 * lane-generation) — no competing-consumer race. Concurrency 3: vendor-rate-
 * limited; per-handler circuit breakers isolate a failing vendor.
 */
@Injectable()
@Processor(QUEUE_NAMES.VENDOR_DATA, { concurrency: 3 })
export class VendorDataQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(VendorDataQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.VENDOR_DATA)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
