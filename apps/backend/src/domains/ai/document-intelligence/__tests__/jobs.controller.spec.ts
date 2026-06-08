import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JobsController } from '../jobs.controller';

describe('JobsController', () => {
  let controller: JobsController;
  let jobService: any;
  let documentsQueue: any;
  let telemetryQueue: any;
  let vendorDataQueue: any;
  let bulkOpsQueue: any;
  let safetyDetectQueue: any;
  let financeQueue: any;
  let geoComputeQueue: any;
  let notificationsQueue: any;
  let webhooksQueue: any;
  let eventsQueue: any;

  const user = { tenantDbId: 1, userId: 'user_1', dbId: 10 };
  const mockJob = {
    id: 101,
    tenantId: 1,
    status: 'FAILED',
    category: 'documents',
    type: 'ratecon',
    inputData: {
      fileName: 'test.pdf',
      s3Key: 'uploads/test.pdf',
      strategy: 'text-first',
    },
    inputHash: 'abc123',
    submittedBy: 10,
  };

  beforeEach(() => {
    jobService = {
      listJobsPaginated: jest.fn().mockResolvedValue({ items: [], total: 0 }),
      getVisibleCategories: jest.fn().mockResolvedValue(['documents', 'tms']),
      getCategorySummary: jest.fn().mockResolvedValue([]),
      getJob: jest.fn().mockResolvedValue(mockJob),
      resetForRetry: jest.fn().mockResolvedValue(undefined),
      cancelJob: jest.fn().mockResolvedValue(undefined),
      dismissJob: jest.fn().mockResolvedValue(undefined),
    };

    const makeMockQueue = () => ({
      add: jest.fn().mockResolvedValue({}),
      getJob: jest.fn().mockResolvedValue({ remove: jest.fn() }),
    });

    documentsQueue = makeMockQueue();
    telemetryQueue = makeMockQueue();
    vendorDataQueue = makeMockQueue();
    bulkOpsQueue = makeMockQueue();
    safetyDetectQueue = makeMockQueue();
    financeQueue = makeMockQueue();
    geoComputeQueue = makeMockQueue();
    notificationsQueue = makeMockQueue();
    webhooksQueue = makeMockQueue();
    eventsQueue = makeMockQueue();

    controller = new JobsController(
      jobService,
      documentsQueue,
      telemetryQueue,
      vendorDataQueue,
      bulkOpsQueue,
      safetyDetectQueue,
      financeQueue,
      geoComputeQueue,
      notificationsQueue,
      webhooksQueue,
      eventsQueue,
    );
  });

  describe('listJobs', () => {
    it('should list jobs with parsed params', async () => {
      await controller.listJobs(user, 'documents', 'ratecon', 'QUEUED,PROCESSING', undefined, undefined, '10', '0');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(1, {
        category: 'documents',
        type: 'ratecon',
        status: ['QUEUED', 'PROCESSING'],
        dateFrom: undefined,
        dateTo: undefined,
        limit: 10,
        offset: 0,
      });
    });

    it('should use defaults for missing params', async () => {
      await controller.listJobs(user);
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          limit: 20,
          offset: 0,
        }),
      );
    });

    it('should cap limit at 100', async () => {
      await controller.listJobs(user, undefined, undefined, undefined, undefined, undefined, '999');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          limit: 100,
        }),
      );
    });
  });

  describe('listJobs — status filter parsing', () => {
    it('should accept lowercase status and normalize to uppercase enum values', async () => {
      await controller.listJobs(user, 'documents', 'ratecon', 'queued,processing');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: ['QUEUED', 'PROCESSING'] }),
      );
    });

    it('should accept mixed case and surrounding whitespace and normalize each value', async () => {
      await controller.listJobs(user, 'documents', 'ratecon', 'Queued, processing ');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ status: ['QUEUED', 'PROCESSING'] }),
      );
    });

    it('should reject an unknown status value with BadRequestException', async () => {
      await expect(controller.listJobs(user, 'documents', 'ratecon', 'BOGUS')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should reject a mixed-good-and-bad list with BadRequestException', async () => {
      await expect(controller.listJobs(user, 'documents', 'ratecon', 'QUEUED,BOGUS')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('should treat an omitted status param as no filter', async () => {
      await controller.listJobs(user, 'documents', 'ratecon');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(1, expect.objectContaining({ status: undefined }));
    });
  });

  describe('getCategorySummary', () => {
    it('should get category summary', async () => {
      await controller.getCategorySummary(user);
      expect(jobService.getVisibleCategories).toHaveBeenCalledWith(1);
      expect(jobService.getCategorySummary).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    it('should return job', async () => {
      const result = await controller.getJob(user, 101);
      expect(result).toEqual(mockJob);
    });

    it('should throw NotFoundException for nonexistent job', async () => {
      jobService.getJob.mockResolvedValue(null);
      await expect(controller.getJob(user, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for job from different tenant', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, tenantId: 999 });
      await expect(controller.getJob(user, 101)).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryJob', () => {
    it('should retry a failed documents job', async () => {
      const result = await controller.retryJob(user, 101);
      expect(result.status).toBe('QUEUED');
      expect(documentsQueue.add).toHaveBeenCalledWith('ratecon', expect.any(Object), expect.any(Object));
    });

    it('should throw for non-failed job', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, status: 'COMPLETED' });
      await expect(controller.retryJob(user, 101)).rejects.toThrow(BadRequestException);
    });

    it('should retry a vendor job (routes to vendor-data queue)', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        category: 'vendor',
        type: 'drivers',
        inputData: {
          integrationId: 1,
          integrationName: 'Test',
          integrationType: 'samsara',
        },
      });
      await controller.retryJob(user, 101);
      expect(vendorDataQueue.add).toHaveBeenCalled();
    });

    it('should retry a lane auto-generation job (vendor category, auto-generation type)', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        category: 'vendor',
        type: 'auto-generation',
        inputData: { recurringLaneDbId: 1 },
      });
      await controller.retryJob(user, 101);
      // Lanes retry enqueues to the shared vendor-data queue with the
      // canonical VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE job name and a
      // JobEnvelope-wrapped payload (post Job-table re-key, lanes live on
      // the `vendor` category and are discriminated by job.type).
      expect(vendorDataQueue.add).toHaveBeenCalledWith(
        'lanes-retry-single',
        expect.objectContaining({
          payload: expect.objectContaining({ recurringLaneDbId: 1 }),
          metadata: expect.objectContaining({ source: 'api', version: 1 }),
        }),
      );
    });

    it('should throw for unsupported category', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, category: 'unknown' });
      await expect(controller.retryJob(user, 101)).rejects.toThrow(BadRequestException);
    });
  });

  describe('dismissJob', () => {
    it('should dismiss a job from its submitter', async () => {
      const result = await controller.dismissJob(user, 101);
      expect(result.dismissed).toBe(true);
      expect(result.jobId).toBe(101);
    });

    it('should throw NotFoundException for nonexistent job', async () => {
      jobService.getJob.mockResolvedValue(null);
      await expect(controller.dismissJob(user, 999)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-submitter tries to dismiss', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, submittedBy: 999 });
      await expect(controller.dismissJob(user, 101)).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException for job from different tenant', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, tenantId: 999 });
      await expect(controller.dismissJob(user, 101)).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelJob', () => {
    it('should cancel a queued job', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, status: 'QUEUED' });
      const result = await controller.cancelJob(user, 101);
      expect(result.status).toBe('CANCELLED');
      expect(jobService.cancelJob).toHaveBeenCalledWith(101);
    });

    it('should throw for completed job', async () => {
      jobService.getJob.mockResolvedValue({ ...mockJob, status: 'COMPLETED' });
      await expect(controller.cancelJob(user, 101)).rejects.toThrow(BadRequestException);
    });

    it('should cancel a processing job', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        status: 'PROCESSING',
        category: 'documents',
      });
      const result = await controller.cancelJob(user, 101);
      expect(result.status).toBe('CANCELLED');
    });

    it('should use the telemetry queue for telemetry jobs', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        status: 'QUEUED',
        category: 'telemetry',
      });
      await controller.cancelJob(user, 101);
      expect(telemetryQueue.getJob).toHaveBeenCalled();
    });

    it('should remove the safety BullMQ job from the safety-detect queue using the prefixed id', async () => {
      // Post-redesign: the `safety` Job category routes to the safety-detect queue
      // via JOB_CATEGORIES.safety.queue.
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        status: 'PROCESSING',
        category: 'safety',
        type: 'audit',
      });
      const removeSpy = jest.fn();
      safetyDetectQueue.getJob.mockResolvedValue({ remove: removeSpy });

      const result = await controller.cancelJob(user, 101);

      // Looked up on the correct (safety-detect) queue with the category-prefixed token
      expect(safetyDetectQueue.getJob).toHaveBeenCalledWith('safety-101');
      expect(documentsQueue.getJob).not.toHaveBeenCalled();
      expect(telemetryQueue.getJob).not.toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
      expect(jobService.cancelJob).toHaveBeenCalledWith(101);
      expect(result.status).toBe('CANCELLED');
    });

    it('should still cancel at the DB level when the BullMQ job is already gone (orphan recovery)', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        status: 'PROCESSING',
        category: 'safety',
      });
      safetyDetectQueue.getJob.mockResolvedValue(null); // worker crashed — no live Bull job

      const result = await controller.cancelJob(user, 101);

      expect(jobService.cancelJob).toHaveBeenCalledWith(101);
      expect(result.status).toBe('CANCELLED');
    });

    it('should still cancel at the DB level for a category with no injected queue', async () => {
      // `webhooks` resolves to the WEBHOOKS queue but this controller does not
      // inject WEBHOOKS — exercises the queueByName-returns-undefined branch.
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        status: 'QUEUED',
        category: 'webhooks',
      });

      const result = await controller.cancelJob(user, 101);

      expect(jobService.cancelJob).toHaveBeenCalledWith(101);
      expect(result.status).toBe('CANCELLED');
    });

    it('should throw NotFoundException for nonexistent job', async () => {
      jobService.getJob.mockResolvedValue(null);
      await expect(controller.cancelJob(user, 999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('listJobs - edge cases', () => {
    it('should handle NaN limit and offset', async () => {
      await controller.listJobs(user, undefined, undefined, undefined, undefined, undefined, 'abc', 'xyz');
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          limit: 20,
          offset: 0,
        }),
      );
    });

    it('should handle dismissed filter', async () => {
      await controller.listJobs(
        user,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'true',
      );
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          dismissed: true,
        }),
      );
    });

    it('should handle dismissed=false filter', async () => {
      await controller.listJobs(
        user,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'false',
      );
      expect(jobService.listJobsPaginated).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          dismissed: false,
        }),
      );
    });

    it('should retry a telemetry job (routes to telemetry queue)', async () => {
      jobService.getJob.mockResolvedValue({
        ...mockJob,
        category: 'telemetry',
        type: 'gps',
        inputData: {
          integrationId: 1,
          integrationName: 'Samsara',
          integrationType: 'samsara',
        },
      });
      await controller.retryJob(user, 101);
      expect(telemetryQueue.add).toHaveBeenCalledWith(
        'gps',
        expect.objectContaining({
          payload: expect.objectContaining({ type: 'gps' }),
        }),
      );
    });
  });
});
