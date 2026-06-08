import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { SAFETY_DETECT_JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../infrastructure/queue/job-handler.contract';
import { LoadMonitoringService } from './monitoring/services/load-monitoring.service';

/**
 * Owns the `load-monitoring` cron sweep on the `safety-detect` queue. A plain
 * handler — the single SafetyDetectQueueProcessor dispatcher routes jobs to it
 * by name (the sibling ShieldAuditJobHandler owns `audit`), so neither can grab
 * and silently drop the other's job.
 */
@Injectable()
export class LoadMonitoringJobHandler implements QueueJobHandler {
  readonly jobNames = [SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING];
  private readonly logger = new Logger(LoadMonitoringJobHandler.name);

  constructor(private readonly loadMonitoringService: LoadMonitoringService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    return this.loadMonitoringService.monitorActiveLoads();
  }
}
