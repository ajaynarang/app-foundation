import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AddOnsService } from './add-ons.service';
import { AddOnsController } from './add-ons.controller';
import { AddOnsAdminController, AddOnsCatalogAdminController } from './add-ons-admin.controller';
import { AddOnsRequestAdminController } from './add-ons-request-admin.controller';
import { AddOnUsageResetService } from './add-on-usage-reset.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module';
import { BillingModule } from '../../billing/billing.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { FINANCE_JOB_NAMES, QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';

@Module({
  imports: [PrismaModule, CacheModule, FeatureFlagsModule, BillingModule, QueueModule],
  controllers: [AddOnsController, AddOnsAdminController, AddOnsCatalogAdminController, AddOnsRequestAdminController],
  providers: [AddOnsService, AddOnUsageResetService],
  exports: [AddOnsService, AddOnUsageResetService],
})
export class AddOnsModule implements OnModuleInit {
  private readonly logger = new Logger(AddOnsModule.name);

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
          jobType: FINANCE_JOB_NAMES.ADDON_USAGE_RESET,
        },
      },
    });

    // Wake daily at 01:00 UTC; the per-tenant local 1st-of-month gate (and the
    // usageResetAt idempotency guard) lives inside the reset job, so each tenant
    // resets on their own local 1st rather than all at once at UTC month-start.
    const pattern = schedule?.isEnabled ? schedule.pattern : '0 1 * * *';

    if (schedule && !schedule.isEnabled) return;

    const existingJobs = await this.financeQueue.getRepeatableJobs();
    const alreadyScheduled = existingJobs.some(
      (job) => job.name === FINANCE_JOB_NAMES.ADDON_USAGE_RESET && job.pattern === pattern,
    );

    if (!alreadyScheduled) {
      // Clean up old grace expiry job if it exists
      for (const job of existingJobs) {
        if (job.name === 'addon-grace-expiry') {
          await this.financeQueue.removeRepeatableByKey(job.key);
          this.logger.log('Removed legacy addon-grace-expiry job');
        }
      }

      await this.financeQueue.add(
        FINANCE_JOB_NAMES.ADDON_USAGE_RESET,
        buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }),
        { repeat: { pattern } },
      );
      this.logger.log(`Add-on usage reset job scheduled (pattern: ${pattern})`);
    }
  }
}
