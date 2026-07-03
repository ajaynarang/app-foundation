import { Injectable, Logger } from '@nestjs/common';
import { JobStatusSchema } from '@app/shared-types';
import { PrismaService } from '../database/prisma.service';

const JOB_STATUS = JobStatusSchema.enum;

/**
 * Cleans up old job records from the database.
 * Invoked by the `DataRetentionProcessor` on the BULK_OPS queue when the
 * `JOB_CLEANUP` repeatable job runs.
 */
@Injectable()
export class JobCleanupJob {
  private readonly logger = new Logger(JobCleanupJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async cleanupOldJobs() {
    this.logger.log('Starting job records cleanup...');

    try {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const result = await this.prisma.job.deleteMany({
        where: {
          createdAt: { lt: ninetyDaysAgo },
          status: { in: [JOB_STATUS.COMPLETED, JOB_STATUS.FAILED, JOB_STATUS.CANCELLED] },
        },
      });

      this.logger.log(`Deleted ${result.count} job records older than 90 days`);
      return { deletedCount: result.count };
    } catch (error) {
      this.logger.error('Failed to cleanup job records', error.stack);
      throw error;
    }
  }
}
