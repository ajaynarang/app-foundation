import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../database/prisma.module';
import { PrismaService } from '../database/prisma.service';
import { QueueModule } from './queue.module';
import { QUEUE_NAMES, BULK_OPS_JOB_NAMES } from './queue.constants';
import { buildJobEnvelope } from './job-envelope.helper';
import { DataRetentionJobHandler } from './data-retention.processor';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [DataRetentionJobHandler],
  exports: [DataRetentionJobHandler],
})
export class DataRetentionModule implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const jobName = BULK_OPS_JOB_NAMES.DATA_RETENTION;
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: { category: 'maintenance', jobType: jobName },
      },
    });
    if (!schedule?.isEnabled) return;

    const existingJobs = await this.bulkOpsQueue.getRepeatableJobs();
    if (!existingJobs.some((j) => j.name === jobName)) {
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
      this.logger.log('Data retention cleanup job scheduled from DB config');
    }
  }
}
