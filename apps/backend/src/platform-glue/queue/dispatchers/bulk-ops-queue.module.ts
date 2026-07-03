import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { jobHandlersToken, QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { DataRetentionModule } from '../data-retention.module';
import { AuthModule } from '@appshore/platform/auth/auth.module';
import { DataRetentionJobHandler } from '@appshore/platform/infrastructure/queue/data-retention.processor';
import { LoginEventCleanupJobHandler } from '@appshore/platform/auth/login-event-cleanup.processor';
import { BulkOpsQueueProcessor } from './bulk-ops-queue.processor';

/**
 * Wires the single `bulk-ops` queue dispatcher. Imports the modules that export
 * the cleanup handler classes and assembles them into the queue's handler-array
 * token via an explicit factory. Register additional bulk-op handlers here.
 */
@Module({
  imports: [QueueModule, forwardRef(() => DataRetentionModule), forwardRef(() => AuthModule)],
  providers: [
    BulkOpsQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.BULK_OPS),
      useFactory: (retention: DataRetentionJobHandler, login: LoginEventCleanupJobHandler): QueueJobHandler[] => [
        retention,
        login,
      ],
      inject: [DataRetentionJobHandler, LoginEventCleanupJobHandler],
    },
  ],
})
export class BulkOpsQueueModule {}
