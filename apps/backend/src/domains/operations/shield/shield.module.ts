import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, SAFETY_DETECT_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { ShieldController } from './shield.controller';
import { ShieldService } from './services/shield.service';
import { ShieldAuditJobHandler } from './services/shield-audit.processor';
import { ShieldRuleEngine } from './services/shield-rule-engine.service';
import { ShieldAIAnalyst } from './services/shield-ai-analyst.service';
import { SallyAiModule } from '../../ai/sally-ai/sally-ai.module';
import { InAppNotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, CacheModule, QueueModule, forwardRef(() => SallyAiModule), InAppNotificationsModule],
  controllers: [ShieldController],
  providers: [ShieldService, ShieldAuditJobHandler, ShieldRuleEngine, ShieldAIAnalyst],
  exports: [ShieldService, ShieldAuditJobHandler],
})
export class ShieldModule implements OnModuleInit {
  private readonly logger = new Logger(ShieldModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT)
    private readonly auditQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: {
          category: 'compliance',
          jobType: SAFETY_DETECT_JOB_NAMES.AUDIT,
        },
      },
    });
    if (!schedule?.isEnabled) return;

    const existingJobs = await this.auditQueue.getRepeatableJobs();
    const repeatOpts =
      schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

    const alreadyScheduled = existingJobs.some(
      (job) =>
        job.name === SAFETY_DETECT_JOB_NAMES.AUDIT &&
        (schedule.scheduleType === 'cron' ? job.pattern === schedule.pattern : true),
    );

    if (!alreadyScheduled) {
      await this.auditQueue.add(
        SAFETY_DETECT_JOB_NAMES.AUDIT,
        buildJobEnvelope(
          {
            scope: 'FULL',
            triggeredBy: 'SCHEDULED',
            isCronJob: true,
          },
          { tenantId: 'system', source: 'cron' },
        ),
        { repeat: repeatOpts },
      );
      this.logger.log('Shield daily audit job scheduled from DB config');
    }
  }
}
