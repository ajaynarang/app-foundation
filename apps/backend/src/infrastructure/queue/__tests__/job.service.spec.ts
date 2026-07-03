import { Test, TestingModule } from '@nestjs/testing';
import type { JobStatus } from '@appshore/db';
import { JobService } from '../job.service';
import { PrismaService } from '../../database/prisma.service';

const mockPrisma = {
  job: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
  },
  integrationConfig: { findMany: jest.fn() },
  $queryRaw: jest.fn(),
};

describe('JobService', () => {
  let service: JobService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [JobService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<JobService>(JobService);
  });

  describe('createJob', () => {
    it('should create a job with queued status', async () => {
      const params = {
        tenantId: 1,
        submittedBy: 42,
        category: 'webhooks' as const,
        type: 'deliver',
        inputData: { foo: 'bar' },
      };
      mockPrisma.job.create.mockResolvedValue({
        id: 101,
        ...params,
        status: 'QUEUED',
      });

      const result = await service.createJob(params);

      expect(result.status).toBe('QUEUED');
      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'QUEUED',
          priority: 0,
          maxAttempts: 3,
        }),
      });
    });

    it('should use custom priority and maxAttempts', async () => {
      mockPrisma.job.create.mockResolvedValue({ id: 101 });
      await service.createJob({
        tenantId: 1,
        submittedBy: null,
        category: 'maintenance',
        type: 'job-cleanup',
        inputData: {},
        priority: 5,
        maxAttempts: 1,
      });

      expect(mockPrisma.job.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ priority: 5, maxAttempts: 1 }),
      });
    });
  });

  describe('listJobsPaginated — status filter semantics', () => {
    beforeEach(() => {
      mockPrisma.job.findMany.mockResolvedValue([]);
      mockPrisma.job.count.mockResolvedValue(0);
    });

    it('applies the status filter when a non-empty array is passed', async () => {
      await service.listJobsPaginated(1, { status: ['QUEUED', 'PROCESSING'] as JobStatus[] });
      expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['QUEUED', 'PROCESSING'] } }),
        }),
      );
    });

    it('applies status: { in: [] } when an EMPTY array is passed (matches zero rows)', async () => {
      await service.listJobsPaginated(1, { status: [] as JobStatus[] });
      expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: [] } }),
        }),
      );
    });

    it('omits the status filter entirely when status is undefined', async () => {
      await service.listJobsPaginated(1, { status: undefined });
      const call = mockPrisma.job.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('status');
    });
  });

  describe('markProcessing', () => {
    it('should update status and increment attempts', async () => {
      mockPrisma.job.update.mockResolvedValue({
        id: 101,
        status: 'PROCESSING',
      });
      await service.markProcessing(101);
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({
          status: 'PROCESSING',
          attempts: { increment: 1 },
        }),
      });
    });
  });

  describe('markCompleted', () => {
    it('should set status to completed with result data', async () => {
      mockPrisma.job.update.mockResolvedValue({});
      await service.markCompleted(101, { loadId: 'L-1' });
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({
          status: 'COMPLETED',
          resultData: { loadId: 'L-1' },
        }),
      });
    });
  });

  describe('markFailed', () => {
    it('should set status to failed with error', async () => {
      mockPrisma.job.update.mockResolvedValue({});
      await service.markFailed(101, 'Timeout', { code: 'ETIMEOUT' });
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({
          status: 'FAILED',
          errorMessage: 'Timeout',
          errorDetails: { code: 'ETIMEOUT' },
        }),
      });
    });
  });

  describe('resetForRetry', () => {
    it('should reset to queued and clear error info', async () => {
      mockPrisma.job.update.mockResolvedValue({});
      await service.resetForRetry(101);
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({
          status: 'QUEUED',
          errorMessage: null,
          startedAt: null,
        }),
      });
    });
  });

  describe('cancelJob', () => {
    it('should set status to cancelled', async () => {
      mockPrisma.job.update.mockResolvedValue({});
      await service.cancelJob(101);
      expect(mockPrisma.job.update).toHaveBeenCalledWith({
        where: { id: 101 },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      });
    });
  });

  describe('listJobs', () => {
    it('should filter by category and status', async () => {
      mockPrisma.job.findMany.mockResolvedValue([]);
      await service.listJobs(1, {
        category: 'webhooks',
        status: ['QUEUED', 'PROCESSING'],
      });
      expect(mockPrisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            category: 'webhooks',
            status: { in: ['QUEUED', 'PROCESSING'] },
          }),
        }),
      );
    });
  });
});
