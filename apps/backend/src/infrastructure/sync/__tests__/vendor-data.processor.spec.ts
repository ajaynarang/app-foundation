import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@sally/shared-types';
import { VendorDataJobHandler } from '../vendor-data.processor';
import { JobService } from '../../queue/job.service';
import { PrismaService } from '../../database/prisma.service';
import { VendorCircuitBreakerService } from '../../queue/vendor-circuit-breaker.service';
import { TmsSyncService } from '../../../domains/integrations/sync/tms-sync.service';
import { EldSyncService } from '../../../domains/integrations/sync/eld-sync.service';
import { DomainEventService } from '../../events/domain-event.service';
import type { IntegrationSyncPayload, SyncJobType } from '../sync-job.types';

describe('VendorDataJobHandler', () => {
  let processor: VendorDataJobHandler;

  const mockJobService = {
    createJob: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
    driver: { count: jest.fn() },
    vehicle: { count: jest.fn() },
    load: { count: jest.fn() },
    integrationConfig: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockTmsSyncService = {
    syncDrivers: jest.fn(),
    syncVehicles: jest.fn(),
    syncLoads: jest.fn(),
  };

  const mockEldSyncService = {
    syncDrivers: jest.fn(),
    syncVehicles: jest.fn(),
  };

  const mockEvents = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockCircuitBreaker = {
    isOpen: jest.fn().mockResolvedValue(false),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VendorDataJobHandler,
        { provide: JobService, useValue: mockJobService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TmsSyncService, useValue: mockTmsSyncService },
        { provide: EldSyncService, useValue: mockEldSyncService },
        { provide: DomainEventService, useValue: mockEvents },
        { provide: VendorCircuitBreakerService, useValue: mockCircuitBreaker },
      ],
    }).compile();

    processor = module.get<VendorDataJobHandler>(VendorDataJobHandler);
  });

  afterEach(() => jest.clearAllMocks());

  function buildJob(
    payloadOverrides: Partial<IntegrationSyncPayload> & { type: SyncJobType },
    opts: Partial<{ attempts: number; attemptsMade: number; name: string }> = {},
  ): Job<JobEnvelope<IntegrationSyncPayload>> {
    const payload: IntegrationSyncPayload = {
      jobId: 1,
      tenantId: 1,
      integrationId: 1,
      integrationName: 'McLeod',
      integrationType: 'TMS',
      type: payloadOverrides.type,
      triggerSource: 'scheduled',
      ...payloadOverrides,
    };
    const envelope: JobEnvelope<IntegrationSyncPayload> = {
      tenantId: String(payload.tenantId),
      correlationId: 'corr-1',
      payload,
      metadata: {
        enqueuedAt: '2026-05-27T00:00:00.000Z',
        source: 'cron',
        version: 1,
      },
    };
    return {
      id: 'bull-1',
      name: opts.name ?? `tms-${payload.type}`,
      queueName: 'vendor-data',
      data: envelope,
      opts: { attempts: opts.attempts ?? 3 },
      attemptsMade: opts.attemptsMade ?? 0,
      token: '0',
      moveToFailed: jest.fn(),
    } as unknown as Job<JobEnvelope<IntegrationSyncPayload>>;
  }

  describe('circuit breaker', () => {
    it('fast-fails (throws) when the circuit is open for this vendor', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockCircuitBreaker.isOpen.mockResolvedValueOnce(true);

      await expect(processor.run(buildJob({ type: 'drivers' }))).rejects.toThrow(
        /Circuit breaker open for vendor: mcleod/i,
      );

      expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith('mcleod');
      // Sync orchestration must not run when the circuit is open
      expect(mockTmsSyncService.syncDrivers).not.toHaveBeenCalled();
      expect(mockJobService.markProcessing).not.toHaveBeenCalled();
    });

    it('records success on the breaker when the sync completes', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.driver.count.mockResolvedValueOnce(10).mockResolvedValueOnce(12);
      mockPrisma.integrationConfig.findMany.mockResolvedValue([]);
      mockTmsSyncService.syncDrivers.mockResolvedValue({ actions: [] });

      await processor.run(buildJob({ type: 'drivers' }));

      expect(mockCircuitBreaker.recordSuccess).toHaveBeenCalledWith('mcleod');
      expect(mockCircuitBreaker.recordFailure).not.toHaveBeenCalled();
    });

    it('records failure on the breaker AND rethrows when the sync errors', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.driver.count.mockResolvedValueOnce(10);
      mockPrisma.integrationConfig.findMany.mockResolvedValue([]);
      mockTmsSyncService.syncDrivers.mockRejectedValue(new Error('vendor 500'));

      await expect(processor.run(buildJob({ type: 'drivers' }))).rejects.toThrow('vendor 500');

      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalledWith('mcleod');
      expect(mockCircuitBreaker.recordSuccess).not.toHaveBeenCalled();
    });

    it('uses "unknown" as the vendor key when integrationName is missing', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockCircuitBreaker.isOpen.mockResolvedValueOnce(true);

      await expect(processor.run(buildJob({ type: 'drivers', integrationName: '' }))).rejects.toThrow(
        /vendor: unknown/i,
      );

      expect(mockCircuitBreaker.isOpen).toHaveBeenCalledWith('unknown');
    });
  });

  describe('process', () => {
    it('skips when tenant has paused jobs (before checking circuit breaker)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      const result = await processor.run(buildJob({ type: 'drivers' }));

      expect(result.details).toEqual({ skipped: 'tenant_paused' });
      expect(mockCircuitBreaker.isOpen).not.toHaveBeenCalled();
      expect(mockJobService.markProcessing).not.toHaveBeenCalled();
    });

    it('syncs drivers (ELD + TMS)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.driver.count.mockResolvedValueOnce(10).mockResolvedValueOnce(12);
      mockPrisma.integrationConfig.findMany.mockResolvedValue([{ id: 2 }]);
      mockEldSyncService.syncDrivers.mockResolvedValue({
        created: 2,
        enriched: 0,
        skipped: 0,
        total: 2,
        actions: [],
      });
      mockTmsSyncService.syncDrivers.mockResolvedValue({ actions: [] });

      const result = await processor.run(buildJob({ type: 'drivers' }));

      expect(result.recordsCreated).toBe(2);
      expect(mockJobService.markCompleted).toHaveBeenCalled();
    });

    it('syncs vehicles', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.vehicle.count.mockResolvedValueOnce(5).mockResolvedValueOnce(7);
      mockPrisma.integrationConfig.findMany.mockResolvedValue([{ id: 2 }]);
      mockEldSyncService.syncVehicles.mockResolvedValue({
        created: 2,
        enriched: 0,
        skipped: 0,
        total: 2,
        actions: [],
      });
      mockTmsSyncService.syncVehicles.mockResolvedValue({ actions: [] });

      const result = await processor.run(buildJob({ type: 'vehicles' }));

      expect(result.recordsCreated).toBe(2);
    });

    it('syncs loads', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.integrationConfig.findUnique.mockResolvedValue({ tenantId: 1 });
      mockPrisma.load.count.mockResolvedValueOnce(20).mockResolvedValueOnce(22);
      mockTmsSyncService.syncLoads.mockResolvedValue({ actions: [] });

      const result = await processor.run(buildJob({ type: 'loads' }));

      expect(result.recordsCreated).toBe(2);
    });

    it('throws on unknown sync type (when job.name is owned but payload.type is corrupt)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });

      // Name is an owned name (tms-drivers) but payload carries a type this processor
      // doesn't recognize — simulates a producer/consumer schema-skew. The processor
      // should record a circuit-breaker failure and throw.
      await expect(processor.run(buildJob({ type: 'hos' as SyncJobType }, { name: 'tms-drivers' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(mockCircuitBreaker.recordFailure).toHaveBeenCalled();
    });

    it('marks failed on final attempt and updates integration config', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockPrisma.driver.count.mockResolvedValueOnce(0);
      mockPrisma.integrationConfig.findMany.mockResolvedValue([]);
      mockTmsSyncService.syncDrivers.mockRejectedValue(new Error('API timeout'));

      const job = buildJob({ type: 'drivers' }, { attemptsMade: 2 }); // final attempt

      await expect(processor.run(job)).rejects.toThrow('API timeout');

      expect(mockJobService.markFailed).toHaveBeenCalledWith(1, 'API timeout', expect.any(Object));
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastErrorMessage: 'API timeout' }),
        }),
      );
    });
  });
});
