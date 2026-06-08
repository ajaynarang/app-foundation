import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { DataRetentionModule } from '../data-retention.module';
import { DocumentsModule } from '../../../domains/fleet/documents/documents.module';
import { AuthModule } from '../../../auth/auth.module';
import { DataRetentionJobHandler } from '../data-retention.processor';
import { DocumentCleanupJobHandler } from '../../../domains/fleet/documents/document-cleanup.processor';
import { LoginEventCleanupJobHandler } from '../../../auth/login-event-cleanup.processor';
import { BulkOpsQueueProcessor } from './bulk-ops-queue.processor';

/**
 * Wires the single `bulk-ops` queue dispatcher. Imports the modules that export
 * the three cleanup handler classes and assembles them into the queue's
 * handler-array token via an explicit factory.
 */
@Module({
  imports: [
    QueueModule,
    forwardRef(() => DataRetentionModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => AuthModule),
  ],
  providers: [
    BulkOpsQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.BULK_OPS),
      useFactory: (
        retention: DataRetentionJobHandler,
        docs: DocumentCleanupJobHandler,
        login: LoginEventCleanupJobHandler,
      ): QueueJobHandler[] => [retention, docs, login],
      inject: [DataRetentionJobHandler, DocumentCleanupJobHandler, LoginEventCleanupJobHandler],
    },
  ],
})
export class BulkOpsQueueModule {}
