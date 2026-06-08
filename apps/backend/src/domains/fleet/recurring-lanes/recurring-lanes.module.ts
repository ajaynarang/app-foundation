import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { LoadsModule } from '../loads/loads.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { QUEUE_NAMES, VENDOR_DATA_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { RecurringLanesController } from './controllers/recurring-lanes.controller';
import { RecurringLanesService } from './services/recurring-lanes.service';
import { LaneGenerationJobHandler } from './lane-generation.processor';

@Module({
  imports: [PrismaModule, LoadsModule, QueueModule],
  controllers: [RecurringLanesController],
  providers: [RecurringLanesService, LaneGenerationJobHandler],
  exports: [RecurringLanesService, LaneGenerationJobHandler],
})
export class RecurringLanesModule implements OnModuleInit {
  private readonly logger = new Logger(RecurringLanesModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA)
    private readonly vendorDataQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    // The legacy `JobSchedule` row keys the auto-generation cron under
    // (`lanes`, `auto-generation`) — that's the contract with the admin UI.
    // We honor the same DB key but enqueue against the new VENDOR_DATA queue
    // and the canonical job name `lanes-auto-generation`.
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category: 'lanes', jobType: 'auto-generation' } },
    });
    if (!schedule?.isEnabled) return;

    const existingJobs = await this.vendorDataQueue.getRepeatableJobs();
    if (!existingJobs.some((j) => j.name === VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION)) {
      const repeatOpts =
        schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

      await this.vendorDataQueue.add(
        VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION,
        buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }),
        { repeat: repeatOpts },
      );
      this.logger.log('Recurring lane generation job scheduled from DB config');
    }
  }
}
