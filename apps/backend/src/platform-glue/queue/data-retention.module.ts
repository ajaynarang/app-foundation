import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { QueueModule } from './queue.module';
import { DataRetentionJobHandler } from '@appshore/platform/infrastructure/queue/data-retention.processor';

/**
 * Provides the data-retention and job-cleanup handler. Both crons are scheduled from their `job_schedules` rows by
 * `FoundationSchedulesRegistrar` (bulk-ops-queue.module.ts), with the other foundation crons.
 */
@Module({
  imports: [PrismaModule, QueueModule],
  providers: [DataRetentionJobHandler],
  exports: [DataRetentionJobHandler],
})
export class DataRetentionModule {}
