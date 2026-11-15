import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { APP_JOB_NAMES } from '../../../../platform-glue/queue/job-names';
import { SearchIndexerService } from './search-indexer.service';
import type { SearchIndexPayload } from './search-index.listener';

/**
 * Runs `search-index` on the `ai-background` queue: re-reads one record and replaces its rows in the index. The
 * write is a replace, so the queue's retry is safe; a job that fails for good leaves the record's old rows, which
 * the next change or `pnpm search:rebuild` corrects.
 */
@Injectable()
export class SearchIndexJobHandler implements QueueJobHandler {
  readonly jobNames = [APP_JOB_NAMES.AI_BACKGROUND.SEARCH_INDEX];

  constructor(private readonly indexer: SearchIndexerService) {}

  async run(job: Job<JobEnvelope<SearchIndexPayload>>): Promise<unknown> {
    const { tenantId, subjectType, subjectId } = job.data.payload;
    return this.indexer.reindex(tenantId, subjectType, subjectId);
  }
}
