import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

export const OUTBOX_RELAY_TICK_JOB_ID = 'maintenance-outbox-relay';
export const DEFAULT_OUTBOX_RELAY_INTERVAL_MS = 10_000;
/** The bulk-ops schedules live under `maintenance`, so the admin schedules screen can pause or retune it. */
const SCHEDULE_CATEGORY = 'maintenance';

/**
 * Registers the outbox relay tick (ADR "Outbox and deadlines") on `bulk-ops`, every 10 s by default.
 *
 * Unlike the cleanup jobs, the relay runs with NO `jobSchedule` row: it is crash recovery, not an opt-in
 * chore. A row ('maintenance', 'outbox-relay') is honoured on every boot — `isEnabled: false` removes the
 * repeatable, a changed `intervalMs` re-registers it.
 */
@Injectable()
export class OutboxRelayScheduler implements OnModuleInit {
  private readonly logger = new Logger(OutboxRelayScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private readonly bulkOps: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobName = BULK_OPS_JOB_NAMES.OUTBOX_RELAY;
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category: SCHEDULE_CATEGORY, jobType: jobName } },
    });
    const enabled = !schedule || schedule.isEnabled;
    const every = schedule?.intervalMs ?? DEFAULT_OUTBOX_RELAY_INTERVAL_MS;
    const existing = (await this.bulkOps.getRepeatableJobs()).find((repeatable) => repeatable.name === jobName);

    if (!enabled) {
      if (existing) {
        await this.bulkOps.removeRepeatableByKey(existing.key);
        this.logger.log('Outbox relay tick removed (disabled via jobSchedule)');
      }
      return;
    }
    if (existing) {
      if (Number(existing.every) === every) return;
      await this.bulkOps.removeRepeatableByKey(existing.key);
    }
    await this.bulkOps.add(jobName, buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }), {
      repeat: { every },
      jobId: OUTBOX_RELAY_TICK_JOB_ID,
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
    this.logger.log(`Outbox relay tick scheduled every ${every}ms`);
  }
}
