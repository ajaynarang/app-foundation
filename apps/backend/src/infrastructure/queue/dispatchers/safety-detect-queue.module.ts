import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { ShieldModule } from '../../../domains/operations/shield/shield.module';
import { OperationsModule } from '../../../domains/operations/operations.module';
import { ShieldAuditJobHandler } from '../../../domains/operations/shield/services/shield-audit.processor';
import { LoadMonitoringJobHandler } from '../../../domains/operations/safety-detect.processor';
import { SafetyDetectQueueProcessor } from './safety-detect-queue.processor';

/**
 * Wires the single `safety-detect` queue dispatcher. Imports the modules that
 * export the two handler classes (`audit` + `load-monitoring`) and assembles
 * them into the queue's handler-array token via an explicit factory — the same
 * pattern as DocumentsQueueModule (cross-module `multi:true` does not aggregate).
 */
@Module({
  imports: [QueueModule, forwardRef(() => ShieldModule), forwardRef(() => OperationsModule)],
  providers: [
    SafetyDetectQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.SAFETY_DETECT),
      useFactory: (audit: ShieldAuditJobHandler, loadMon: LoadMonitoringJobHandler): QueueJobHandler[] => [
        audit,
        loadMon,
      ],
      inject: [ShieldAuditJobHandler, LoadMonitoringJobHandler],
    },
  ],
})
export class SafetyDetectQueueModule {}
