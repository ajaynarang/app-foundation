import { Inject, Injectable, Logger } from '@nestjs/common';
import { Processor } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../queue.constants';
import { BaseQueueDispatcher } from '../base-queue-dispatcher';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DeadLetterService } from '../dead-letter.service';

/**
 * The single `WorkerHost` on the `geo-compute` queue. Routes by job name
 * (`route-progress`/`update-progress` → RoutePlanProgressJobHandler,
 * `load-mileage-recalc` → LoadMileageJobHandler) — no competing-consumer race.
 */
@Injectable()
@Processor(QUEUE_NAMES.GEO_COMPUTE, { concurrency: 3 })
export class GeoComputeQueueProcessor extends BaseQueueDispatcher {
  protected readonly logger = new Logger(GeoComputeQueueProcessor.name);

  constructor(
    @Inject(jobHandlersToken(QUEUE_NAMES.GEO_COMPUTE)) handlers: QueueJobHandler[],
    deadLetter: DeadLetterService,
  ) {
    super(handlers, deadLetter);
  }
}
