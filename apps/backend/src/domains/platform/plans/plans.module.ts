import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { TrialExpiryService } from './trial-expiry.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { FINANCE_JOB_NAMES, QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';

@Module({
  imports: [PrismaModule, CacheModule, QueueModule],
  controllers: [PlansController],
  providers: [PlansService, TrialExpiryService],
  exports: [PlansService, TrialExpiryService],
})
export class PlansModule implements OnModuleInit {
  private readonly logger = new Logger(PlansModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: {
          category: 'finance',
          jobType: FINANCE_JOB_NAMES.TRIAL_EXPIRY,
        },
      },
    });
    if (!schedule?.isEnabled) return;

    const existingJobs = await this.financeQueue.getRepeatableJobs();
    const repeatOpts =
      schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

    const alreadyScheduled = existingJobs.some(
      (job) =>
        job.name === FINANCE_JOB_NAMES.TRIAL_EXPIRY &&
        (schedule.scheduleType === 'cron' ? job.pattern === schedule.pattern : true),
    );

    if (!alreadyScheduled) {
      await this.financeQueue.add(
        FINANCE_JOB_NAMES.TRIAL_EXPIRY,
        buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }),
        { repeat: repeatOpts },
      );
      this.logger.log('Trial expiry job scheduled from DB config');
    }
  }
}
