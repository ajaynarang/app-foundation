import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { NOTIFICATIONS_JOB_NAMES } from '../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../infrastructure/queue/job-handler.contract';
import { NotificationTriggersService } from './notification-triggers.service';

/**
 * Owns the housekeeping cron sweeps on the `notifications` queue.
 *
 * Owned job names:
 *   - CLEANUP — purge old read / dismissed in-app notifications
 *   - DIGEST  — placeholder for a periodic notification digest (extend per app)
 *
 * The single NotificationsQueueProcessor dispatcher routes by name; foreign
 * job names are short-circuited here.
 */
@Injectable()
export class NotificationJobsHandler implements QueueJobHandler {
  readonly jobNames = [NOTIFICATIONS_JOB_NAMES.CLEANUP, NOTIFICATIONS_JOB_NAMES.DIGEST];
  private readonly logger = new Logger(NotificationJobsHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationTriggers: NotificationTriggersService,
  ) {}

  async run(job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    switch (job.name) {
      case NOTIFICATIONS_JOB_NAMES.CLEANUP:
        return this.runCleanup();
      case NOTIFICATIONS_JOB_NAMES.DIGEST:
        return this.runDigest();
      default:
        return;
    }
  }

  private async runCleanup() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dismissed = await this.prisma.notification.deleteMany({
      where: {
        dismissedAt: { not: null, lt: sevenDaysAgo },
      },
    });

    const read = await this.prisma.notification.deleteMany({
      where: {
        readAt: { not: null, lt: thirtyDaysAgo },
        dismissedAt: null,
      },
    });

    this.logger.log(`Cleanup complete: ${dismissed.count} dismissed, ${read.count} read notifications deleted`);
    return { dismissed: dismissed.count, read: read.count };
  }

  /**
   * Placeholder periodic digest hook. Wire app-specific digest logic here
   * (e.g. summarize unread notifications and fan out via notificationTriggers).
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for digest implementation
  private async runDigest(): Promise<{ sent: number }> {
    void this.notificationTriggers;
    return { sent: 0 };
  }
}
