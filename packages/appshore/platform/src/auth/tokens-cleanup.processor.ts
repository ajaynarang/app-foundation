import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { CronRun } from '@appshore/kernel/infrastructure/queue/job-events';
import { JwtTokenService } from './jwt.service';
import { systemScope } from '@appshore/kernel/infrastructure/rls/system-scope';
import { PrismaService } from '../infrastructure/database/prisma.service';

/** Used or expired one-time email tokens are kept this long (for support questions), then deleted. */
export const EMAIL_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Owns `tokens-cleanup` on the `bulk-ops` queue: deletes refresh-token rows no session can use
 * (`JwtTokenService.cleanupExpiredTokens`), and password-reset and email-verification tokens that expired or were
 * used more than 7 days ago. Rotation writes a refresh row on every refresh and every signup or reset request
 * writes an email token, so without this the tables only grow. A plain handler; the single BulkOpsQueueProcessor
 * dispatcher routes by name.
 */
@Injectable()
export class TokensCleanupJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.TOKENS_CLEANUP];
  private readonly logger = new Logger(TokensCleanupJobHandler.name);

  constructor(
    private readonly jwtTokens: JwtTokenService,
    private readonly prisma: PrismaService,
  ) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<{ deleted: number }> {
    const cron = new CronRun(this.logger, BULK_OPS_JOB_NAMES.TOKENS_CLEANUP);
    // Refresh tokens of every tenant: declared cross-tenant work.
    const deleted = await systemScope('sweep.tokens-cleanup', async () => {
      const refresh = await this.jwtTokens.cleanupExpiredTokens();
      const cutoff = new Date(Date.now() - EMAIL_TOKEN_RETENTION_MS);
      const spent = { OR: [{ expiresAt: { lt: cutoff } }, { usedAt: { lt: cutoff } }] };
      const reset = await this.prisma.passwordResetToken.deleteMany({ where: spent });
      const verification = await this.prisma.emailVerificationToken.deleteMany({ where: spent });
      return refresh + reset.count + verification.count;
    });
    cron.complete({ deleted });
    return { deleted };
  }
}
