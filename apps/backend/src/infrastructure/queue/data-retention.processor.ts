import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { JobStatusSchema, type JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../database/prisma.service';
import { BULK_OPS_JOB_NAMES } from './queue.constants';
import type { QueueJobHandler } from './job-handler.contract';
import { JobCleanupJob } from './job-cleanup.job';
import { withJobLogContext } from '../logging/job-log-context';

const JOB_STATUS = JobStatusSchema.enum;

/**
 * Owns `data-retention` and `job-cleanup` on the `bulk-ops` queue. A plain
 * handler — the single BulkOpsQueueProcessor dispatcher routes by name.
 */
@Injectable()
export class DataRetentionJobHandler implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.DATA_RETENTION, BULK_OPS_JOB_NAMES.JOB_CLEANUP];
  private readonly logger = new Logger(DataRetentionJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobCleanupJob: JobCleanupJob,
  ) {}

  async run(job: Job<JobEnvelope<unknown>>): Promise<unknown> {
    switch (job.name) {
      case BULK_OPS_JOB_NAMES.JOB_CLEANUP:
        return withJobLogContext(job, () => this.jobCleanupJob.cleanupOldJobs());
      case BULK_OPS_JOB_NAMES.DATA_RETENTION:
      default:
        return withJobLogContext(job, () => this.runDataRetention());
    }
  }

  private async runDataRetention() {
    this.logger.log('Starting data retention cleanup...');

    try {
      const loginEventsDeleted = await this.cleanupLoginEvents();
      const webhookLogsDeleted = await this.cleanupWebhookDeliveryLogs();
      const completedJobsDeleted = await this.cleanupCompletedJobs();
      const domainEventLogsDeleted = await this.cleanupDomainEventLogs();

      const summary = {
        loginEventsDeleted,
        webhookLogsDeleted,
        completedJobsDeleted,
        domainEventLogsDeleted,
      };

      this.logger.log(`Data retention cleanup complete: ${JSON.stringify(summary)}`);

      return summary;
    } catch (error) {
      this.logger.error('Data retention cleanup failed', error);
      throw error;
    }
  }

  /**
   * Delete login events older than 90 days.
   */
  private async cleanupLoginEvents(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.loginEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Login events: deleted ${result.count} records older than 90 days`);

    return result.count;
  }

  /**
   * Delete webhook delivery logs older than 30 days.
   */
  private async cleanupWebhookDeliveryLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.webhookDeliveryLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Webhook delivery logs: deleted ${result.count} records older than 30 days`);

    return result.count;
  }

  /**
   * Delete completed or failed job records older than 30 days.
   * Keeps queued/running jobs regardless of age.
   */
  private async cleanupCompletedJobs(): Promise<number> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.job.deleteMany({
      where: {
        completedAt: { lt: cutoff },
        status: { in: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED] },
      },
    });

    this.logger.log(`Completed jobs: deleted ${result.count} records older than 30 days`);

    return result.count;
  }

  /**
   * Delete domain event logs older than 90 days.
   */
  private async cleanupDomainEventLogs(): Promise<number> {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.domainEventLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    this.logger.log(`Domain event logs: deleted ${result.count} records older than 90 days`);

    return result.count;
  }
}
