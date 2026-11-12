import { Test, TestingModule } from '@nestjs/testing';
import type { JobStatus } from '@appshore/db';
import { JobService } from '../job.service';
import { PrismaService } from '../../database/prisma.service';
import { fixtureModel, tiedTimestamps, walkCursorList } from '../../../test/helpers';
import { buildJobVocabulary, EMPTY_APP_JOB_VOCABULARY } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { JOB_VOCABULARY } from '../job-vocabulary.token';

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

  describe('listAllJobs: a cursor list, newest first', () => {
    const stamps = tiedTimestamps(8);
    const rows = stamps.map((createdAt, index) => ({
      id: index + 1,
      // Deliberately not in id order: the tiebreak is the public id, not the Int key.
      publicId: `00000000-0000-7000-8000-00000000000${(index * 5) % 8}`,
      tenantId: index % 2 === 0 ? 1 : 2,
      category: 'webhooks',
      type: 'deliver',
      status: index === 7 ? 'FAILED' : 'COMPLETED',
      createdAt,
    }));

    beforeEach(() => Object.assign(mockPrisma.job, fixtureModel(rows)));

    it('walks every row once across pages, ties included, and the total ignores the cursor', async () => {
      const seenTotals: number[] = [];
      const { pages, items } = await walkCursorList(async (cursor) => {
        const page = await service.listAllJobs({ limit: 2, cursor });
        seenTotals.push(page.total);
        return page;
      });

      expect(pages.map((page) => page.length)).toEqual([2, 2, 2, 2]);
      expect(new Set(items.map((job) => job.publicId)).size).toBe(8);
      expect(items.map((job) => job.createdAt.getTime())).toEqual(
        [...stamps].map((d) => d.getTime()).sort((a, b) => b - a),
      );
      expect(seenTotals).toEqual([8, 8, 8, 8]);
    });

    it('orders by created_at then public id, never the Int key', async () => {
      await service.listAllJobs({});
      expect(mockPrisma.job.findMany.mock.calls[0][0]).toMatchObject({
        orderBy: [{ createdAt: 'desc' }, { publicId: 'desc' }],
        take: 51,
      });
    });

    it('filters by tenant and status, and counts only what matches', async () => {
      const page = await service.listAllJobs({ tenantId: 2, statuses: ['FAILED'] as JobStatus[] });
      expect(page.items.map((job) => job.id)).toEqual([8]);
      expect(page).toMatchObject({ total: 1, nextCursor: null });
    });

    it('answers 400 on a cursor it did not issue, before any query runs', async () => {
      await expect(service.listAllJobs({ cursor: 'not-a-cursor' })).rejects.toMatchObject({ status: 400 });
      expect(mockPrisma.job.findMany).not.toHaveBeenCalled();
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

  describe('reads the job vocabulary merged with the app (JOB_VOCABULARY)', () => {
    const appVocabulary = buildJobVocabulary({
      ...EMPTY_APP_JOB_VOCABULARY,
      queueNames: { REPORTS: 'reports' },
      jobNames: { REPORTS: { BUILD: 'report-build' } },
      displayNames: { 'report-build': 'Report Build' },
      categories: { reports: { display: 'Reports', queue: 'reports', requiredIntegration: null, tenantVisible: true } },
      manualTypes: { reports: ['report-build'] },
    });
    let appService: JobService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          JobService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: JOB_VOCABULARY, useValue: appVocabulary },
        ],
      }).compile();
      appService = module.get(JobService);
    });

    it('creates a job in an app category', async () => {
      mockPrisma.job.create.mockResolvedValue({ id: 7 });
      await appService.createJob({
        tenantId: 1,
        submittedBy: null,
        category: 'reports',
        type: 'report-build',
        inputData: {},
      });
      expect(mockPrisma.job.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: 'reports' }) });
    });

    it('refuses a category no vocabulary declares, before any write', async () => {
      await expect(
        service.createJob({ tenantId: 1, submittedBy: null, category: 'reports', type: 'report-build', inputData: {} }),
      ).rejects.toThrow(/unknown job category "reports"/);
      expect(mockPrisma.job.create).not.toHaveBeenCalled();
    });

    it('shows an app tenant-visible category to tenants', async () => {
      mockPrisma.integrationConfig.findMany.mockResolvedValue([]);
      await expect(appService.getVisibleCategories(1)).resolves.toContain('reports');
      await expect(service.getVisibleCategories(1)).resolves.not.toContain('reports');
    });

    it("lists an app category's manual types and labels them with the app's display names", async () => {
      mockPrisma.job.groupBy.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const queue = { getRepeatableJobs: jest.fn().mockResolvedValue([]) };

      const [summary] = await appService.getCategorySummary(1, ['reports'], { reports: queue as never });

      expect(summary.displayName).toBe('Reports');
      expect(summary.types).toEqual([
        expect.objectContaining({ type: 'report-build', displayName: 'Report Build', schedule: 'Manual' }),
      ]);
    });
  });
});
