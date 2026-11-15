import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { PrismaService } from '../database/prisma.service';
import { DEADLINE_SWEEP_SCHEDULE_CATEGORY, DEFAULT_DEADLINE_SWEEP_INTERVAL_MS } from './deadline.types';

export const DEADLINE_SWEEP_TICK_JOB_ID = `${DEADLINE_SWEEP_SCHEDULE_CATEGORY}-${BULK_OPS_JOB_NAMES.DEADLINE_SWEEP}`;

/**
 * Registers the sweeper tick on `bulk-ops`, every 30 s by default. Like the outbox relay it runs with NO
 * jobSchedule row (timers must fire out of the box); a row ('maintenance', 'deadline-sweep') is honoured on
 * EVERY boot — `isEnabled: false` removes the repeatable job and a changed `intervalMs` re-registers it.
 * Needs the app's global QueueModule (the `bulk-ops` queue).
 */
@Injectable()
export class DeadlineSweepScheduler implements OnModuleInit {
  private readonly logger = new Logger(DeadlineSweepScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private readonly bulkOps: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobName = BULK_OPS_JOB_NAMES.DEADLINE_SWEEP;
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category: DEADLINE_SWEEP_SCHEDULE_CATEGORY, jobType: jobName } },
    });
    const enabled = !schedule || schedule.isEnabled;
    const every = schedule?.intervalMs ?? DEFAULT_DEADLINE_SWEEP_INTERVAL_MS;

    const existing = (await this.bulkOps.getRepeatableJobs()).find((repeatable) => repeatable.name === jobName);

    if (!enabled) {
      if (existing) {
        await this.bulkOps.removeRepeatableByKey(existing.key);
        this.logger.log('Deadline sweep tick removed (disabled via jobSchedule)');
      }
      return;
    }

    if (existing) {
      if (Number(existing.every) === every) return;
      await this.bulkOps.removeRepeatableByKey(existing.key); // interval re-tuned
    }

    await this.bulkOps.add(jobName, buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }), {
      repeat: { every },
      jobId: DEADLINE_SWEEP_TICK_JOB_ID,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(`Deadline sweep tick scheduled every ${every}ms`);
  }
}
