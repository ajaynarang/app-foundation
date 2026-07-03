import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';

/**
 * Owns `login-events-cleanup` on the `bulk-ops` queue. A plain handler — the
 * single BulkOpsQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class LoginEventCleanupJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.LOGIN_EVENTS_CLEANUP];
  private readonly logger = new Logger(LoginEventCleanupJobHandler.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    return this.cleanupLoginEvents();
  }

  private async cleanupLoginEvents(): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    const result = await this.prisma.loginEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Login event cleanup: deleted ${result.count} events older than 90 days`);

    return { deleted: result.count };
  }
}
