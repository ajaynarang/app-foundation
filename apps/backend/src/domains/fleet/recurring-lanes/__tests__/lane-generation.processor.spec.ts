import { Test, TestingModule } from '@nestjs/testing';
import type { JobEnvelope } from '@sally/shared-types';
import { LaneGenerationJobHandler } from '../lane-generation.processor';
import { RecurringLanesService } from '../services/recurring-lanes.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { VendorCircuitBreakerService } from '../../../../infrastructure/queue/vendor-circuit-breaker.service';
import { VENDOR_DATA_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { TimezoneService } from '../../../../shared/services/timezone.service';

describe('LaneGenerationJobHandler', () => {
  let processor: LaneGenerationJobHandler;

  const mockRecurringLanesService = {
    generateLoad: jest.fn(),
    computeNextRunDate: jest.fn(),
    deriveGenerationDate: jest.fn(),
  };

  const mockPrisma = {
    recurringLane: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    tenant: { findUnique: jest.fn() },
  };

  const mockJobService = {
    getJob: jest.fn(),
    createJob: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
  };

  const mockCircuitBreaker = {
    isOpen: jest.fn(),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  };

  const mockTimezoneService = {
    resolveTenantTimezone: jest.fn(),
    localDate: jest.fn(),
  };

  beforeEach(async () => {
    mockCircuitBreaker.isOpen.mockResolvedValue(false);
    // Default: a tenant on UTC whose local "today" is far in the future so any
    // due-by-date lane in the existing batch-scan tests passes the per-tenant filter.
    mockTimezoneService.resolveTenantTimezone.mockResolvedValue('UTC');
    mockTimezoneService.localDate.mockReturnValue('9999-12-31');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LaneGenerationJobHandler,
        { provide: RecurringLanesService, useValue: mockRecurringLanesService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JobService, useValue: mockJobService },
        { provide: VendorCircuitBreakerService, useValue: mockCircuitBreaker },
        { provide: TimezoneService, useValue: mockTimezoneService },
      ],
    }).compile();

    processor = module.get<LaneGenerationJobHandler>(LaneGenerationJobHandler);
  });

  afterEach(() => jest.clearAllMocks());

  const wrap = <P>(payload: P): JobEnvelope<P> => ({
    tenantId: 'tenant-slug',
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  });

  const retryJob = (data: any) => ({ name: VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE, data: wrap(data) }) as any;

  const batchJob = (data: any = {}) => ({ name: VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION, data: wrap(data) }) as any;

  describe('process - dispatch', () => {
    it('should throw when circuit breaker is open', async () => {
      mockCircuitBreaker.isOpen.mockResolvedValue(true);

      await expect(processor.run(batchJob())).rejects.toThrow(/circuit open/i);
    });

    it('should record success after a successful batch scan', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([]);

      await processor.run(batchJob());

      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('sally-lanes');
    });

    it('should record failure and re-throw when a hard error escapes the batch scan', async () => {
      mockPrisma.recurringLane.findMany.mockRejectedValue(new Error('connection lost'));

      await expect(processor.run(batchJob())).rejects.toThrow('connection lost');
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('sally-lanes');
    });
  });

  describe('process - retry-single', () => {
    it('should retry a single lane generation', async () => {
      mockJobService.getJob.mockResolvedValue({
        inputData: { laneId: 'LANE-1', laneName: 'Test', customerName: 'Acme' },
      });
      mockRecurringLanesService.generateLoad.mockResolvedValue({
        loadNumber: 'L001',
      });

      const result = await processor.run(
        retryJob({
          retryJobId: 1,
          recurringLaneDbId: 10,
          tenantId: 1,
        }),
      );

      expect(mockJobService.markProcessing).toHaveBeenCalledWith(1);
      expect(mockRecurringLanesService.generateLoad).toHaveBeenCalledWith(10, 1);
      expect(mockJobService.markCompleted).toHaveBeenCalledWith(1, expect.objectContaining({ loadNumber: 'L001' }));
      expect(result).toEqual({ generated: 1, errors: 0 });
      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('sally-lanes');
    });

    it('should handle missing job record', async () => {
      mockJobService.getJob.mockResolvedValue(null);

      const result = await processor.run(
        retryJob({
          retryJobId: 999,
          recurringLaneDbId: 10,
          tenantId: 1,
        }),
      );

      expect(result).toEqual({ generated: 0, errors: 1 });
    });

    it('should handle retry failure', async () => {
      mockJobService.getJob.mockResolvedValue({ inputData: {} });
      mockRecurringLanesService.generateLoad.mockRejectedValue(new Error('Generation failed'));

      const result = await processor.run(
        retryJob({
          retryJobId: 1,
          recurringLaneDbId: 10,
          tenantId: 1,
        }),
      );

      expect(mockJobService.markFailed).toHaveBeenCalledWith(1, 'Generation failed', expect.any(Object));
      expect(result).toEqual({ generated: 0, errors: 1 });
    });
  });

  describe('process - batch scan', () => {
    it('should process due lanes and generate loads', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Dallas-Houston',
          tenantId: 1,
          customerName: 'Acme',
          autoCreate: true,
          status: 'ACTIVE',
          effectiveUntil: null,
          skipNextGeneration: false,
          scheduleType: 'weekly',
          scheduleDays: [1],
          nextGenerationDate: new Date('2026-05-01T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.createJob.mockResolvedValue({ id: 'JOB-AUTO' });
      mockRecurringLanesService.generateLoad.mockResolvedValue({
        loadNumber: 'L001',
      });

      const result = await processor.run(batchJob());

      expect(result).toEqual({ generated: 1, skipped: 0, errors: 0 });
      expect(mockJobService.markCompleted).toHaveBeenCalled();
    });

    it('should skip paused tenants', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Test',
          tenantId: 2,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-01T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      const result = await processor.run(batchJob());
      expect(result.skipped).toBe(1);
      expect(result.generated).toBe(0);
    });

    it('should auto-expire lanes past effective date', async () => {
      const pastDate = new Date('2025-01-01');
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Expired Lane',
          tenantId: 1,
          effectiveUntil: pastDate,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-01T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });

      const result = await processor.run(batchJob());

      expect(mockPrisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EXPIRED' }),
        }),
      );
      expect(result.skipped).toBe(1);
    });

    it('should skip lanes with skipNextGeneration flag', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Skipped Lane',
          tenantId: 1,
          effectiveUntil: null,
          skipNextGeneration: true,
          scheduleType: 'weekly',
          scheduleDays: [1],
          nextScheduledRunDate: new Date(),
          nextGenerationDate: new Date('2026-05-01T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockRecurringLanesService.computeNextRunDate.mockReturnValue(new Date());
      mockRecurringLanesService.deriveGenerationDate.mockResolvedValue(new Date());

      const result = await processor.run(batchJob());

      expect(result.skipped).toBe(1);
      expect(mockPrisma.recurringLane.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skipNextGeneration: false }),
        }),
      );
    });

    it('should handle generation errors gracefully', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Fail Lane',
          tenantId: 1,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-01T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.createJob.mockResolvedValue({ id: 'JOB-AUTO' });
      mockRecurringLanesService.generateLoad.mockRejectedValue(new Error('DB error'));

      const result = await processor.run(batchJob());

      expect(result.errors).toBe(1);
      expect(result.generated).toBe(0);
      expect(mockJobService.markFailed).toHaveBeenCalled();
    });

    it('should return zeros when no lanes are due', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([]);

      const result = await processor.run(batchJob());
      expect(result).toEqual({ generated: 0, skipped: 0, errors: 0 });
    });

    it('generates a lane due today in the tenant local tz even if server is a day behind', async () => {
      // Lane generation date is the server's "tomorrow" (UTC), but the tenant is
      // Pacific/Auckland (UTC+13) and is already on that calendar day locally.
      mockTimezoneService.resolveTenantTimezone.mockResolvedValue('Pacific/Auckland');
      mockTimezoneService.localDate.mockReturnValue('2026-05-29');
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Auckland Lane',
          tenantId: 7,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-29T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.createJob.mockResolvedValue({ id: 'JOB-AUTO' });
      mockRecurringLanesService.generateLoad.mockResolvedValue({ loadNumber: 'L001' });

      const result = await processor.run(batchJob());

      expect(mockRecurringLanesService.generateLoad).toHaveBeenCalledWith(1, 7);
      expect(result.generated).toBe(1);
    });

    it('skips a lane not yet due in the tenant local tz', async () => {
      // Lane generation date is server-today, but the tenant is Pacific/Honolulu
      // (UTC-10) and is still on the previous calendar day locally.
      mockTimezoneService.resolveTenantTimezone.mockResolvedValue('Pacific/Honolulu');
      mockTimezoneService.localDate.mockReturnValue('2026-05-27');
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 2,
          laneId: 'LANE-2',
          name: 'Honolulu Lane',
          tenantId: 8,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-28T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });

      const result = await processor.run(batchJob());

      expect(mockRecurringLanesService.generateLoad).not.toHaveBeenCalled();
      expect(result).toEqual({ generated: 0, skipped: 0, errors: 0 });
    });

    it('resolves each tenant timezone only once per scan (cache hit)', async () => {
      // Two lanes for the SAME tenant — the tz lookup should run once, not twice.
      mockTimezoneService.resolveTenantTimezone.mockResolvedValue('America/Chicago');
      mockTimezoneService.localDate.mockReturnValue('2026-05-29');
      mockPrisma.recurringLane.findMany.mockResolvedValue([
        {
          id: 1,
          laneId: 'LANE-1',
          name: 'Lane One',
          tenantId: 5,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-28T00:00:00.000Z'),
          stops: [],
        },
        {
          id: 2,
          laneId: 'LANE-2',
          name: 'Lane Two',
          tenantId: 5,
          customerName: 'Acme',
          effectiveUntil: null,
          skipNextGeneration: false,
          nextGenerationDate: new Date('2026-05-29T00:00:00.000Z'),
          stops: [],
        },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.createJob.mockResolvedValue({ id: 'JOB-AUTO' });
      mockRecurringLanesService.generateLoad.mockResolvedValue({ loadNumber: 'L001' });

      const result = await processor.run(batchJob());

      expect(mockTimezoneService.resolveTenantTimezone).toHaveBeenCalledTimes(1);
      expect(result.generated).toBe(2);
    });
  });
});
