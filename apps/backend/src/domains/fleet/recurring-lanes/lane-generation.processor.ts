import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { RecurringLaneStatusSchema } from '@sally/shared-types';
import { VENDOR_DATA_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';
import { VendorCircuitBreakerService } from '../../../infrastructure/queue/vendor-circuit-breaker.service';
import { JobService } from '../../../infrastructure/queue/job.service';
import { RecurringLanesService } from './services/recurring-lanes.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TimezoneService } from '../../../shared/services/timezone.service';

const RECURRING_LANE_STATUS = RecurringLaneStatusSchema.enum;
const LANES_VENDOR = 'sally-lanes';

interface RetrySinglePayload {
  retryJobId: number;
  recurringLaneDbId: number;
  tenantId: number;
}

/**
 * Owns recurring-lane auto-generation on the `vendor-data` queue
 * (LANES_AUTO_GENERATION cron + LANES_RETRY_SINGLE retry). A plain handler — the
 * single VendorDataQueueProcessor dispatcher routes by name. Circuit breaker:
 * lane generation isn't a vendor call, but a persistent DB outage should back
 * off; `sally-lanes` is the failure domain so it doesn't drag the queue down.
 */
@Injectable()
export class LaneGenerationJobHandler implements QueueJobHandler {
  readonly jobNames = [VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION, VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE];
  private readonly logger = new Logger(LaneGenerationJobHandler.name);

  constructor(
    private readonly recurringLanesService: RecurringLanesService,
    private readonly prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly circuitBreaker: VendorCircuitBreakerService,
    private readonly timezoneService: TimezoneService,
  ) {}

  async run(job: Job): Promise<any> {
    if (await this.circuitBreaker.isOpen(LANES_VENDOR)) {
      throw new Error('Vendor circuit open for sally-lanes — deferring lane generation');
    }

    try {
      const result =
        job.name === VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE
          ? await this.processRetrySingle(job as Job<JobEnvelope<RetrySinglePayload>>)
          : await this.processBatchScan();
      await this.circuitBreaker.recordSuccess(LANES_VENDOR);
      return result;
    } catch (err) {
      await this.circuitBreaker.recordFailure(LANES_VENDOR);
      throw err;
    }
  }

  /** Retry a single failed lane generation (triggered from retry button). */
  private async processRetrySingle(job: Job<JobEnvelope<RetrySinglePayload>>) {
    const { retryJobId, recurringLaneDbId, tenantId } = job.data.payload;
    this.logger.log(`Retrying lane generation for Job ${retryJobId}, lane DB ID ${recurringLaneDbId}`);

    const existingJob = await this.jobService.getJob(retryJobId);
    if (!existingJob) {
      this.logger.error(`Retry job record ${retryJobId} not found`);
      return { generated: 0, errors: 1 };
    }

    await this.jobService.markProcessing(retryJobId);

    try {
      const load = await this.recurringLanesService.generateLoad(recurringLaneDbId, tenantId);
      await this.jobService.markCompleted(retryJobId, {
        loadNumber: load.loadNumber,
        laneId: (existingJob.inputData as any)?.laneId,
        laneName: (existingJob.inputData as any)?.laneName,
        customerName: (existingJob.inputData as any)?.customerName,
      });
      this.logger.log(`Retry succeeded for Job ${retryJobId}`);
      return { generated: 1, errors: 0 };
    } catch (error) {
      await this.jobService.markFailed(retryJobId, (error as Error).message, {
        stack: (error as Error).stack,
      });
      this.logger.error(`Retry failed for Job ${retryJobId}: ${(error as Error).message}`);
      return { generated: 0, errors: 1 };
    }
  }

  /** Batch scan for all due recurring lanes and generate loads. */
  private async processBatchScan(): Promise<{ generated: number; skipped: number; errors: number }> {
    this.logger.log('Starting recurring lane generation scan');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Widen the DB query by +1 day so tenants AHEAD of UTC (already on the next
    // civil date locally) aren't excluded; the precise per-tenant filter below
    // keeps only the lanes whose generation date has truly arrived locally.
    const upperBound = new Date();
    upperBound.setHours(0, 0, 0, 0);
    upperBound.setDate(upperBound.getDate() + 1);

    const candidates = await this.prisma.recurringLane.findMany({
      where: {
        autoCreate: true,
        status: RECURRING_LANE_STATUS.ACTIVE,
        deletedAt: null,
        nextGenerationDate: { lte: upperBound },
      },
      include: {
        stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
      },
    });

    // Keep a lane only when its generation date has arrived in ITS tenant's
    // local timezone. Cache the tz per tenant to avoid repeated lookups.
    const tzByTenant = new Map<number, string>();
    const lanes: typeof candidates = [];
    for (const lane of candidates) {
      let tz = tzByTenant.get(lane.tenantId);
      if (!tz) {
        tz = await this.timezoneService.resolveTenantTimezone(lane.tenantId);
        tzByTenant.set(lane.tenantId, tz);
      }
      const tenantToday = this.timezoneService.localDate(tz); // YYYY-MM-DD
      const genDate = lane.nextGenerationDate?.toISOString().slice(0, 10); // @db.Date → civil date
      if (genDate && genDate <= tenantToday) lanes.push(lane);
    }

    let generated = 0;
    let skipped = 0;
    let errors = 0;

    // Collect paused tenants to skip
    const tenantIds = [...new Set(lanes.map((l) => l.tenantId))];
    const pausedTenants = new Set<number>();
    for (const tid of tenantIds) {
      const t = await this.prisma.tenant.findUnique({
        where: { id: tid },
        select: { jobsPaused: true },
      });
      if (t?.jobsPaused) pausedTenants.add(tid);
    }

    for (const lane of lanes) {
      if (pausedTenants.has(lane.tenantId)) {
        this.logger.log(`Skipping lane ${lane.laneId} — tenant ${lane.tenantId} is paused`);
        skipped++;
        continue;
      }

      // Auto-expire lanes past their effective date
      if (lane.effectiveUntil && new Date(lane.effectiveUntil) < today) {
        await this.prisma.recurringLane.update({
          where: { id: lane.id },
          data: {
            status: RECURRING_LANE_STATUS.EXPIRED,
            nextGenerationDate: null,
            nextScheduledRunDate: null,
          },
        });
        this.logger.log(`Auto-expired lane ${lane.laneId} — past effective date`);
        skipped++;
        continue;
      }

      if (lane.skipNextGeneration) {
        const nextRunDate = this.recurringLanesService.computeNextRunDate(
          lane.scheduleType,
          lane.scheduleDays as number[] | null,
          lane.nextScheduledRunDate,
        );
        const nextGenDate = await this.recurringLanesService.deriveGenerationDate(nextRunDate, lane.tenantId);
        await this.prisma.recurringLane.update({
          where: { id: lane.id },
          data: {
            skipNextGeneration: false,
            nextScheduledRunDate: nextRunDate,
            nextGenerationDate: nextGenDate,
          },
        });
        skipped++;
        this.logger.log(`Skipped generation for lane ${lane.laneId} (skip flag set)`);
        continue;
      }

      // Create a Job record for this lane generation attempt
      let jobRecord;
      try {
        jobRecord = await this.jobService.createJob({
          tenantId: lane.tenantId,
          submittedBy: null,
          category: 'vendor',
          type: 'auto-generation',
          inputData: {
            laneId: lane.laneId,
            laneName: lane.name,
            customerName: lane.customerName,
            scheduleType: lane.scheduleType,
            recurringLaneDbId: lane.id,
          },
        });
      } catch (jobError) {
        errors++;
        this.logger.error(`Failed to create job record for lane ${lane.laneId}: ${(jobError as Error).message}`);
        continue;
      }

      try {
        await this.jobService.markProcessing(jobRecord.id);

        const load = await this.recurringLanesService.generateLoad(lane.id, lane.tenantId);

        await this.jobService.markCompleted(jobRecord.id, {
          loadNumber: load.loadNumber,
          laneId: lane.laneId,
          laneName: lane.name,
          customerName: lane.customerName,
        });

        generated++;
        this.logger.log(`Generated load from lane ${lane.laneId}`);
      } catch (error) {
        const errorMessage = (error as Error).message;
        await this.jobService.markFailed(jobRecord.id, errorMessage, {
          stack: (error as Error).stack,
          laneId: lane.laneId,
        });
        errors++;
        this.logger.error(`Failed to generate load for lane ${lane.laneId}: ${errorMessage}`);
      }
    }

    this.logger.log(`Lane generation complete: ${generated} generated, ${skipped} skipped, ${errors} errors`);

    return { generated, skipped, errors };
  }
}
