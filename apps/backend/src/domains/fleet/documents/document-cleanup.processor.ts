import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { BULK_OPS_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';
import { DocumentsService } from './services/documents.service';

/**
 * Owns `uploads-cleanup` on the `bulk-ops` queue. A plain handler — the single
 * BulkOpsQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class DocumentCleanupJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.UPLOADS_CLEANUP];
  private readonly logger = new Logger(DocumentCleanupJobHandler.name);

  constructor(private readonly documentsService: DocumentsService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<void> {
    this.logger.log('Starting expired uploads cleanup...');

    try {
      const count = await this.documentsService.cleanupExpiredUploads();
      this.logger.log(`Expired uploads cleanup complete: ${count} records updated`);
    } catch (error) {
      this.logger.error('Failed to clean up expired uploads', error);
      throw error;
    }
  }
}
