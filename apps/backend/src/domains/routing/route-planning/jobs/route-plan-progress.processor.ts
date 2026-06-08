import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RoutePlanStatus } from '@prisma/client';
import type { JobEnvelope } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GEO_COMPUTE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { RoutePlanProgressService } from '../services/route-plan-progress.service';

interface UpdateProgressPayload {
  planId: number;
}

/**
 * Processes route-plan progress updates on the shared GEO_COMPUTE queue.
 *
 * Two job names are handled:
 *   - `GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS` (repeatable cron) — sweeps every
 *     active route plan.
 *   - `'update-progress'` (ad-hoc) — recomputes a single plan; payload is
 *     wrapped in `JobEnvelope<UpdateProgressPayload>`.
 *
 * Other job names (e.g. `LOAD_MILEAGE_RECALC`) belong to a sibling processor
 * on the same queue and are short-circuited here.
 */
/**
 * Owns `route-progress` (cron sweep) and the legacy `update-progress` (single
 * plan) job names on the `geo-compute` queue. A plain handler — the single
 * GeoComputeQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class RoutePlanProgressJobHandler implements QueueJobHandler {
  readonly jobNames = [GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS, 'update-progress'];
  private readonly logger = new Logger(RoutePlanProgressJobHandler.name);

  constructor(
    private readonly routePlanProgressService: RoutePlanProgressService,
    private readonly prisma: PrismaService,
  ) {}

  async run(job: Job<JobEnvelope<unknown>>): Promise<void> {
    if (job.name === 'update-progress') {
      // Legacy single-plan update (still supported for manual triggers).
      const payload = (job.data?.payload ?? job.data) as Partial<UpdateProgressPayload>;
      if (typeof payload?.planId !== 'number') {
        this.logger.warn(`update-progress job ${job.id} missing planId — skipping`);
        return;
      }
      return this.processSinglePlan(payload.planId);
    }
    return this.processAllActivePlans();
  }

  private async processAllActivePlans(): Promise<void> {
    const activePlans = await this.prisma.routePlan.findMany({
      where: { isActive: true, status: RoutePlanStatus.ACTIVE },
      select: { id: true, planId: true },
    });

    if (activePlans.length === 0) return;

    this.logger.debug(`Updating progress for ${activePlans.length} active route plans`);

    for (const plan of activePlans) {
      try {
        await this.routePlanProgressService.updateProgress(plan.id);
      } catch (err) {
        this.logger.error(`Route plan progress update failed for plan ${plan.planId}: ${err}`);
      }
    }
  }

  private async processSinglePlan(planId: number): Promise<void> {
    try {
      await this.routePlanProgressService.updateProgress(planId);
    } catch (err) {
      this.logger.error(`Route plan progress update failed for plan ${planId}: ${err}`);
      throw err;
    }
  }
}
