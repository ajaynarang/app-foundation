import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { QueueModule } from '../../../platform-glue/queue/queue.module';
import { QUEUE_NAMES, BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';

export { SyncJobType, SyncJobData, SyncResult } from './sync-job.types';

/**
 * Registers BullMQ repeatable jobs that aren't owned by a specific domain
 * module — currently just the system-wide maintenance/job-cleanup sweep on the
 * `bulk-ops` queue. Integration sync jobs are enqueued on demand by the
 * integrations domain via `routeIntegrationJob`.
 */
@Module({
  imports: [PrismaModule, QueueModule],
  providers: [],
  exports: [],
})
export class SyncQueueModule implements OnModuleInit {
  private readonly logger = new Logger(SyncQueueModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.registerRepeatableJobs();
  }

  async registerRepeatableJobs(): Promise<void> {
    this.logger.log('Registering repeatable jobs...');

    try {
      const registered = await this.registerMaintenanceJobCleanup();
      this.logger.log(`Registered ${registered} repeatable jobs total`);
    } catch (error) {
      this.logger.error('Failed to register repeatable jobs', error instanceof Error ? error.stack : error);
    }
  }

  /**
   * Register the maintenance/job-cleanup repeatable job on the BULK_OPS queue.
   */
  private async registerMaintenanceJobCleanup(): Promise<number> {
    const jobName = BULK_OPS_JOB_NAMES.JOB_CLEANUP;

    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: { category: 'maintenance', jobType: jobName },
      },
    });
    if (!schedule?.isEnabled) return 0;

    // Check if already registered by another module
    const existingJobs = await this.bulkOpsQueue.getRepeatableJobs();
    const alreadyScheduled = existingJobs.some((job) => job.name === jobName);
    if (alreadyScheduled) return 0;

    const repeatOpts =
      schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

    const envelope = buildJobEnvelope(
      {},
      {
        tenantId: 'system',
        source: 'cron',
      },
    );

    await this.bulkOpsQueue.add(jobName, envelope, {
      repeat: repeatOpts,
      jobId: `maintenance-${jobName}`,
      attempts: 1,
      removeOnFail: { age: 86400 },
    });

    return 1;
  }
}
