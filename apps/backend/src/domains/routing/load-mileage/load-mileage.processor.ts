import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { GEO_COMPUTE_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';
import { LoadMileageService } from './load-mileage.service';

interface RecalcPayload {
  loadId: number;
}

/**
 * Owns `load-mileage-recalc` on the `geo-compute` queue. A plain handler — the
 * single GeoComputeQueueProcessor dispatcher routes by name and owns the shared
 * completed/failed (dead-letter) events.
 */
@Injectable()
export class LoadMileageJobHandler implements QueueJobHandler {
  readonly jobNames = [GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC];
  private readonly logger = new Logger(LoadMileageJobHandler.name);

  constructor(private readonly loadMileageService: LoadMileageService) {}

  async run(job: Job<JobEnvelope<RecalcPayload>>): Promise<void> {
    const payload = (job.data?.payload ?? (job.data as unknown as RecalcPayload)) as Partial<RecalcPayload>;
    if (typeof payload?.loadId !== 'number') {
      this.logger.warn(`load-mileage-recalc job ${job.id} missing loadId — skipping`);
      return;
    }
    await this.loadMileageService.recompute(payload.loadId);
  }
}
