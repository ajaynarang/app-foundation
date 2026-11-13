import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DataRetentionJobHandler } from '../data-retention.processor';
import { PrismaService } from '../../database/prisma.service';
import { JobCleanupJob } from '../job-cleanup.job';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';

describe('DataRetentionJobHandler', () => {
  let processor: DataRetentionJobHandler;
  let prisma: {
    loginEvent: { deleteMany: jest.Mock };
    webhookDeliveryLog: { deleteMany: jest.Mock };
    job: { deleteMany: jest.Mock };
    domainEventLog: { deleteMany: jest.Mock };
    hitlChallenge: { deleteMany: jest.Mock };
    outboundSuppression: { deleteMany: jest.Mock };
  };
  let jobCleanupJob: { cleanupOldJobs: jest.Mock };

  beforeEach(async () => {
    prisma = {
      loginEvent: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      webhookDeliveryLog: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      job: { deleteMany: jest.fn().mockResolvedValue({ count: 3 }) },
      domainEventLog: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) },
      hitlChallenge: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
      outboundSuppression: { deleteMany: jest.fn().mockResolvedValue({ count: 6 }) },
    };
    jobCleanupJob = { cleanupOldJobs: jest.fn().mockResolvedValue({ deletedCount: 7 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataRetentionJobHandler,
        { provide: PrismaService, useValue: prisma },
        { provide: JobCleanupJob, useValue: jobCleanupJob },
        { provide: getQueueToken(QUEUE_NAMES.BULK_OPS), useValue: {} },
      ],
    }).compile();

    processor = module.get<DataRetentionJobHandler>(DataRetentionJobHandler);
  });

  it('runs the cleanup queries for DATA_RETENTION jobs', async () => {
    const result = await processor.run({
      id: 'j1',
      name: BULK_OPS_JOB_NAMES.DATA_RETENTION,
      data: { tenantId: 'system', payload: {}, metadata: { source: 'cron', enqueuedAt: '', version: 1 } },
    } as any);

    expect(prisma.loginEvent.deleteMany).toHaveBeenCalled();
    expect(prisma.webhookDeliveryLog.deleteMany).toHaveBeenCalled();
    expect(prisma.job.deleteMany).toHaveBeenCalled();
    expect(prisma.domainEventLog.deleteMany).toHaveBeenCalled();
    expect(prisma.hitlChallenge.deleteMany).toHaveBeenCalled();
    expect(result).toEqual({
      loginEventsDeleted: 1,
      webhookLogsDeleted: 2,
      completedJobsDeleted: 3,
      domainEventLogsDeleted: 4,
      hitlChallengesDeleted: 5,
      outboundSuppressionsDeleted: 6,
    });
  });

  it('deletes held-back outbound rows after 30 days', async () => {
    const now = Date.parse('2026-11-13T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await processor.run({
        id: 'j4',
        name: BULK_OPS_JOB_NAMES.DATA_RETENTION,
        data: { tenantId: 'system', payload: {}, metadata: { source: 'cron', enqueuedAt: '', version: 1 } },
      } as any);
    } finally {
      jest.restoreAllMocks();
    }

    expect(prisma.outboundSuppression.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date(now - 30 * 24 * 60 * 60 * 1000) } },
    });
  });

  it('deletes agent confirmation challenges 24 hours after they expire, and only those', async () => {
    const now = Date.parse('2026-11-13T12:00:00.000Z');
    jest.spyOn(Date, 'now').mockReturnValue(now);
    try {
      await processor.run({
        id: 'j3',
        name: BULK_OPS_JOB_NAMES.DATA_RETENTION,
        data: { tenantId: 'system', payload: {}, metadata: { source: 'cron', enqueuedAt: '', version: 1 } },
      } as any);
    } finally {
      jest.restoreAllMocks();
    }

    // Keyed on expiry, not creation: an open or recently expired challenge stays for the approval UI and audit.
    expect(prisma.hitlChallenge.deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: new Date(now - 24 * 60 * 60 * 1000) } },
    });
  });

  it('delegates JOB_CLEANUP to JobCleanupJob.cleanupOldJobs', async () => {
    const result = await processor.run({
      id: 'j2',
      name: BULK_OPS_JOB_NAMES.JOB_CLEANUP,
      data: { tenantId: 'system', payload: {}, metadata: { source: 'cron', enqueuedAt: '', version: 1 } },
    } as any);

    expect(jobCleanupJob.cleanupOldJobs).toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 7 });
  });
});
