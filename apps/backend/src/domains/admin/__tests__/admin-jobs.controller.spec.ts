import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AdminJobsController } from '../admin-jobs.controller';
import { JobService } from '@appshore/platform/infrastructure/queue/job.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { AdminJobListQueryDto, AdminJobsTenantQueryDto } from '../dto/admin-jobs-query.dto';

describe('AdminJobsController', () => {
  let controller: AdminJobsController;
  let jobService: Record<string, jest.Mock>;
  let prisma: Record<string, any>;
  let queues: Record<string, { add: jest.Mock }>;

  const mockUser = { dbId: 1, userId: 'u-1', role: 'SUPER_ADMIN' };

  beforeEach(async () => {
    jobService = {
      listAllJobsPaginated: jest.fn().mockResolvedValue({ jobs: [], total: 0 }),
      getMetrics: jest.fn().mockResolvedValue({ total: 0 }),
      getCategorySummary: jest.fn().mockResolvedValue([]),
      getJob: jest.fn(),
      resetForRetry: jest.fn().mockResolvedValue(undefined),
    };

    prisma = {
      tenant: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    queues = {
      [QUEUE_NAMES.EVENTS]: { add: jest.fn().mockResolvedValue({}) },
      [QUEUE_NAMES.NOTIFICATIONS]: { add: jest.fn().mockResolvedValue({}) },
      [QUEUE_NAMES.WEBHOOKS]: { add: jest.fn().mockResolvedValue({}) },
      [QUEUE_NAMES.AI_BACKGROUND]: { add: jest.fn().mockResolvedValue({}) },
      [QUEUE_NAMES.BULK_OPS]: { add: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminJobsController],
      providers: [
        { provide: JobService, useValue: jobService },
        { provide: PrismaService, useValue: prisma },
        {
          provide: getQueueToken(QUEUE_NAMES.EVENTS),
          useValue: queues[QUEUE_NAMES.EVENTS],
        },
        {
          provide: getQueueToken(QUEUE_NAMES.NOTIFICATIONS),
          useValue: queues[QUEUE_NAMES.NOTIFICATIONS],
        },
        {
          provide: getQueueToken(QUEUE_NAMES.WEBHOOKS),
          useValue: queues[QUEUE_NAMES.WEBHOOKS],
        },
        {
          provide: getQueueToken(QUEUE_NAMES.AI_BACKGROUND),
          useValue: queues[QUEUE_NAMES.AI_BACKGROUND],
        },
        {
          provide: getQueueToken(QUEUE_NAMES.BULK_OPS),
          useValue: queues[QUEUE_NAMES.BULK_OPS],
        },
      ],
    }).compile();

    controller = module.get<AdminJobsController>(AdminJobsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listJobs ────────────────────────────────────────────────────────────

  /** The query as the global pipe hands it to the handler. */
  const listQuery = (raw: Record<string, unknown> = {}) => readQueryDto(AdminJobListQueryDto, raw);
  const tenantQuery = (raw: Record<string, unknown> = {}) => readQueryDto(AdminJobsTenantQueryDto, raw);

  describe('listJobs', () => {
    it('should list jobs with default pagination', async () => {
      await controller.listJobs(await listQuery());

      expect(jobService.listAllJobsPaginated).toHaveBeenCalledWith({
        tenantId: undefined,
        category: undefined,
        type: undefined,
        status: undefined,
        limit: 20,
        offset: 0,
        dateFrom: undefined,
        dateTo: undefined,
      });
    });

    it('should parse query parameters correctly', async () => {
      await controller.listJobs(
        await listQuery({
          tenant_id: '5',
          category: 'documents',
          type: 'ratecon',
          status: 'COMPLETED,FAILED',
          limit: '50',
          offset: '10',
          date_from: '2026-01-01',
          date_to: '2026-01-31',
        }),
      );

      expect(jobService.listAllJobsPaginated).toHaveBeenCalledWith({
        tenantId: 5,
        category: 'documents',
        type: 'ratecon',
        status: ['COMPLETED', 'FAILED'],
        limit: 50,
        offset: 10,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      });
    });

    it('answers 400 naming tenant_id when it is not a number', async () => {
      expect(await fieldErrorsOf(listQuery({ tenant_id: 'abc' }))).toHaveProperty('tenant_id');
    });

    it('refuses the camelCase keys the route used to read (tenantId, dateFrom, dateTo)', async () => {
      expect(await fieldErrorsOf(listQuery({ tenantId: '5' }))).toHaveProperty('tenantId');
      expect(await fieldErrorsOf(listQuery({ dateFrom: '2026-01-01' }))).toHaveProperty('dateFrom');
      expect(await fieldErrorsOf(listQuery({ dateTo: '2026-01-31' }))).toHaveProperty('dateTo');
    });

    it('should cap limit at 100', async () => {
      await controller.listJobs(await listQuery({ limit: '999' }));

      expect(jobService.listAllJobsPaginated).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
    });

    it('answers 400 naming limit or offset when it is not a whole number', async () => {
      expect(await fieldErrorsOf(listQuery({ limit: 'bad' }))).toHaveProperty('limit');
      expect(await fieldErrorsOf(listQuery({ offset: 'bad' }))).toHaveProperty('offset');
      expect(await fieldErrorsOf(listQuery({ offset: '-1' }))).toHaveProperty('offset');
    });

    it('answers 400 naming a date that is not a date', async () => {
      expect(await fieldErrorsOf(listQuery({ date_from: 'yesterday' }))).toHaveProperty('date_from');
    });

    it('splits a comma-joined status and answers 400 on an unknown value', async () => {
      await controller.listJobs(await listQuery({ status: 'QUEUED,PROCESSING' }));
      expect(jobService.listAllJobsPaginated).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['QUEUED', 'PROCESSING'] }),
      );

      expect(await fieldErrorsOf(listQuery({ status: 'QUEUED,bogus' }))).toHaveProperty('status');
    });
  });

  // ─── getMetrics ──────────────────────────────────────────────────────────

  describe('getMetrics', () => {
    it('should return metrics without tenantId', async () => {
      await controller.getMetrics(await tenantQuery());

      expect(jobService.getMetrics).toHaveBeenCalledWith(undefined);
    });

    it('should return metrics with parsed tenantId', async () => {
      await controller.getMetrics(await tenantQuery({ tenant_id: '42' }));

      expect(jobService.getMetrics).toHaveBeenCalledWith(42);
    });

    it('answers 400 naming tenant_id when it is not a number', async () => {
      expect(await fieldErrorsOf(tenantQuery({ tenant_id: 'abc' }))).toHaveProperty('tenant_id');
    });
  });

  // ─── getCategorySummary ──────────────────────────────────────────────────

  describe('getCategorySummary', () => {
    it('answers 400 naming tenant_id when it is missing', async () => {
      const fields = await fieldErrorsOf(tenantQuery().then((query) => controller.getCategorySummary(query)));
      expect(fields).toHaveProperty('tenant_id');
    });

    it('answers 400 naming tenant_id when it is not a number', async () => {
      expect(await fieldErrorsOf(tenantQuery({ tenant_id: 'abc' }))).toHaveProperty('tenant_id');
    });

    it('should call getCategorySummary with correct params', async () => {
      await controller.getCategorySummary(await tenantQuery({ tenant_id: '10' }));

      expect(jobService.getCategorySummary).toHaveBeenCalledWith(
        10,
        expect.any(Object),
        expect.objectContaining({
          [QUEUE_NAMES.EVENTS]: queues[QUEUE_NAMES.EVENTS],
          [QUEUE_NAMES.NOTIFICATIONS]: queues[QUEUE_NAMES.NOTIFICATIONS],
          [QUEUE_NAMES.BULK_OPS]: queues[QUEUE_NAMES.BULK_OPS],
        }),
      );
    });
  });

  // ─── getJob ──────────────────────────────────────────────────────────────

  describe('getJob', () => {
    it('should return job when found', async () => {
      const mockJob = { id: 101, status: 'COMPLETED' };
      jobService.getJob.mockResolvedValue(mockJob);

      const result = await controller.getJob(101);

      expect(result).toEqual(mockJob);
    });

    it('should throw NotFoundException when job not found', async () => {
      jobService.getJob.mockResolvedValue(null);

      await expect(controller.getJob(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── retryJob ────────────────────────────────────────────────────────────

  describe('retryJob', () => {
    it('should throw NotFoundException when job not found', async () => {
      jobService.getJob.mockResolvedValue(null);

      await expect(controller.retryJob(999)).rejects.toThrow(NotFoundException);
    });

    it('answers 409 INVALID_STATE when the job has not failed', async () => {
      jobService.getJob.mockResolvedValue({ id: 101, status: 'COMPLETED' });

      await expect(controller.retryJob(101)).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });

    it('should retry a failed maintenance job (routes to bulk-ops queue)', async () => {
      jobService.getJob.mockResolvedValue({
        id: 101,
        status: 'FAILED',
        category: 'maintenance',
        type: 'data-retention',
        tenantId: 1,
        submittedBy: 1,
        inputHash: 'hash-1',
        inputData: { foo: 'bar' },
      });

      const result = await controller.retryJob(101);

      expect(jobService.resetForRetry).toHaveBeenCalledWith(101);
      expect(queues[QUEUE_NAMES.BULK_OPS].add).toHaveBeenCalledWith(
        'data-retention',
        expect.objectContaining({
          payload: expect.objectContaining({
            jobId: 101,
            foo: 'bar',
          }),
        }),
        // BullMQ rejects pure-digit jobId strings — prefix with category to avoid
        // "Custom Id cannot be integers". See bullJobIdFromDbId helper.
        { jobId: 'maintenance-101' },
      );
      expect(result).toEqual({ jobId: 101, status: 'QUEUED' });
    });

    it('should retry a failed ai job (routes to ai-background queue)', async () => {
      jobService.getJob.mockResolvedValue({
        id: 102,
        status: 'FAILED',
        category: 'ai',
        type: 'embed',
        tenantId: 1,
        inputData: { docId: 7 },
      });

      const result = await controller.retryJob(102);

      expect(queues[QUEUE_NAMES.AI_BACKGROUND].add).toHaveBeenCalledWith(
        'embed',
        expect.objectContaining({
          payload: expect.objectContaining({
            jobId: 102,
            docId: 7,
          }),
        }),
        { jobId: 'ai-102' },
      );
      expect(queues[QUEUE_NAMES.BULK_OPS].add).not.toHaveBeenCalled();
      expect(result).toEqual({ jobId: 102, status: 'QUEUED' });
    });

    it('answers 409 INVALID_STATE for a category that cannot be retried', async () => {
      jobService.getJob.mockResolvedValue({
        id: 104,
        status: 'FAILED',
        category: 'unknown',
        inputData: {},
      });

      await expect(controller.retryJob(104)).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });

    it('should handle null inputData', async () => {
      jobService.getJob.mockResolvedValue({
        id: 105,
        status: 'FAILED',
        category: 'maintenance',
        type: 'job-cleanup',
        tenantId: 1,
        submittedBy: 1,
        inputHash: 'hash-5',
        inputData: null,
      });

      const result = await controller.retryJob(105);

      expect(queues[QUEUE_NAMES.BULK_OPS].add).toHaveBeenCalledWith(
        'job-cleanup',
        expect.objectContaining({
          payload: expect.objectContaining({
            jobId: 105,
          }),
        }),
        { jobId: 'maintenance-105' },
      );
      expect(result).toEqual({ jobId: 105, status: 'QUEUED' });
    });
  });

  // ─── pauseJobs ───────────────────────────────────────────────────────────

  describe('pauseJobs', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(controller.pauseJobs(99, mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should pause jobs for a tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        companyName: 'Test',
      });
      prisma.tenant.update.mockResolvedValue({
        id: 1,
        companyName: 'Test',
        jobsPaused: true,
        jobsPausedAt: new Date(),
      });

      const result = await controller.pauseJobs(1, mockUser);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          jobsPaused: true,
          jobsPausedAt: expect.any(Date),
          jobsPausedBy: 1,
        },
        select: {
          id: true,
          companyName: true,
          jobsPaused: true,
          jobsPausedAt: true,
        },
      });
      expect(result.jobsPaused).toBe(true);
    });
  });

  // ─── resumeJobs ──────────────────────────────────────────────────────────

  describe('resumeJobs', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(controller.resumeJobs(99)).rejects.toThrow(NotFoundException);
    });

    it('should resume jobs for a tenant', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 1,
        companyName: 'Test',
      });
      prisma.tenant.update.mockResolvedValue({
        id: 1,
        companyName: 'Test',
        jobsPaused: false,
      });

      const result = await controller.resumeJobs(1);

      expect(prisma.tenant.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { jobsPaused: false, jobsPausedAt: null, jobsPausedBy: null },
        select: { id: true, companyName: true, jobsPaused: true },
      });
      expect(result.jobsPaused).toBe(false);
    });
  });
});
