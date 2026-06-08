import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { CloseOutModule } from '../../financials/close-out/close-out.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { QUEUE_NAMES, BULK_OPS_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { DocumentsController } from './controllers/documents.controller';
import { DocumentsService } from './services/documents.service';
import { DocumentCleanupJobHandler } from './document-cleanup.processor';

@Module({
  imports: [PrismaModule, StorageModule, CloseOutModule, EventBusModule, QueueModule],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentCleanupJobHandler],
  exports: [DocumentsService, DocumentCleanupJobHandler],
})
export class DocumentsModule implements OnModuleInit {
  private readonly logger = new Logger(DocumentsModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const jobName = BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP;
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
      this.logger.log('Document cleanup job scheduled from DB config');
    }
  }
}
