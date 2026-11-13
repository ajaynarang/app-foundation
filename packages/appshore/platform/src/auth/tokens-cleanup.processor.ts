import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { CronRun } from '@appshore/kernel/infrastructure/queue/job-events';
import { JwtTokenService } from './jwt.service';

/**
 * Owns `tokens-cleanup` on the `bulk-ops` queue: deletes refresh-token rows no session can use
 * (`JwtTokenService.cleanupExpiredTokens`). Rotation writes a row on every refresh, so without this the table only
 * grows. A plain handler; the single BulkOpsQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class TokensCleanupJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP];
  private readonly logger = new Logger(TokensCleanupJobHandler.name);

  constructor(private readonly jwtTokens: JwtTokenService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<{ deleted: number }> {
    const cron = new CronRun(this.logger, BULK_OPS_JOB_NAMES.TOKENS_CLEANUP);
    const deleted = await this.jwtTokens.cleanupExpiredTokens();
    cron.complete({ deleted });
    return { deleted };
  }
}
