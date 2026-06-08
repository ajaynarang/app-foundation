import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { TelemetryProcessor } from '../telemetry.processor';
import { JobService } from '../../queue/job.service';
import { PrismaService } from '../../database/prisma.service';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { EldSyncService } from '../../../domains/integrations/sync/eld-sync.service';
import { DomainEventService } from '../../events/domain-event.service';
import type { IntegrationSyncPayload, SyncJobType } from '../sync-job.types';

describe('TelemetryProcessor', () => {
  let processor: TelemetryProcessor;

  const mockJobService = {
    createJob: jest.fn(),
    markProcessing: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
    integrationConfig: { update: jest.fn() },
  };

  const mockEldSyncService = {
    syncDrivers: jest.fn(),
    syncVehicles: jest.fn(),
    syncHos: jest.fn(),
    syncTelematics: jest.fn(),
    syncDVIRs: jest.fn(),
  };

  const mockEvents = {
    emit: jest.fn().mockResolvedValue(undefined),
  };

  const mockDeadLetter = {
    recordPermanentFailure: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryProcessor,
        { provide: JobService, useValue: mockJobService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EldSyncService, useValue: mockEldSyncService },
        { provide: DomainEventService, useValue: mockEvents },
        { provide: DeadLetterService, useValue: mockDeadLetter },
      ],
    }).compile();

    processor = module.get<TelemetryProcessor>(TelemetryProcessor);
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
      integrationName: 'Samsara',
      integrationType: 'ELD',
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
      name: opts.name ?? payload.type,
      queueName: 'telemetry',
      data: envelope,
      opts: { attempts: opts.attempts ?? 3 },
      attemptsMade: opts.attemptsMade ?? 0,
      token: '0',
      moveToFailed: jest.fn(),
    } as unknown as Job<JobEnvelope<IntegrationSyncPayload>>;
  }

  describe('shared-queue guard', () => {
    it('returns void without side effects when job.name is foreign', async () => {
      const result = await processor.process(buildJob({ type: 'hos' }, { name: 'foreign-job' }));

      expect(result).toBeUndefined();
      expect(mockPrisma.tenant.findUnique).not.toHaveBeenCalled();
      expect(mockJobService.markProcessing).not.toHaveBeenCalled();
    });

    it('does not record DLQ row for a foreign-name failure', async () => {
      await processor.onFailed(
        buildJob({ type: 'hos' }, { name: 'foreign-job', attemptsMade: 5, attempts: 3 }),
        new Error('upstream 500'),
      );

      expect(mockDeadLetter.recordPermanentFailure).not.toHaveBeenCalled();
    });
  });

  describe('process', () => {
    it('skips when tenant has paused jobs', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      const result = await processor.process(buildJob({ type: 'hos' }));

      expect(result.details).toEqual({ skipped: 'tenant_paused' });
      expect(mockJobService.markProcessing).not.toHaveBeenCalled();
      expect(mockEldSyncService.syncHos).not.toHaveBeenCalled();
    });

    it('creates a Job row for cron-shaped jobs without a pre-set jobId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockJobService.createJob.mockResolvedValue({ id: 999 });
      mockEldSyncService.syncHos.mockResolvedValue({
        recordsProcessed: 5,
        recordsCreated: 0,
        recordsExisting: 5,
        details: {},
      });

      await processor.process(buildJob({ type: 'hos', jobId: undefined }));

      expect(mockJobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 1, type: 'hos', category: 'telemetry' }),
      );
      expect(mockJobService.markCompleted).toHaveBeenCalled();
    });

    it('routes a happy-path HOS job through EldSyncService and marks completed', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockEldSyncService.syncHos.mockResolvedValue({
        recordsProcessed: 10,
        recordsCreated: 0,
        recordsExisting: 10,
        details: {},
      });

      const result = await processor.process(buildJob({ type: 'hos' }));

      expect(mockEldSyncService.syncHos).toHaveBeenCalledWith(1);
      expect(mockJobService.markCompleted).toHaveBeenCalled();
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastErrorMessage: null }),
        }),
      );
      expect(result.recordsProcessed).toBe(10);
      expect(mockEvents.emit).toHaveBeenCalled();
    });

    it('handles GPS sync via the telematics service', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockEldSyncService.syncTelematics.mockResolvedValue({
        recordsProcessed: 8,
        recordsCreated: 0,
        recordsExisting: 8,
        details: {},
      });

      await processor.process(buildJob({ type: 'gps' }));

      expect(mockEldSyncService.syncTelematics).toHaveBeenCalledWith(1);
    });

    it('handles a fleet-sync (enrichment) job', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockEldSyncService.syncDrivers.mockResolvedValue({
        created: 2,
        enriched: 0,
        skipped: 0,
        total: 2,
        actions: [],
      });
      mockEldSyncService.syncVehicles.mockResolvedValue({
        created: 1,
        enriched: 0,
        skipped: 0,
        total: 1,
        actions: [],
      });

      const result = await processor.process(buildJob({ type: 'fleet-sync' }));

      expect(mockEldSyncService.syncDrivers).toHaveBeenCalledWith(1);
      expect(mockEldSyncService.syncVehicles).toHaveBeenCalledWith(1);
      expect(result.recordsCreated).toBe(3);
    });

    it('throws on unknown sync type (when job.name is owned but payload.type is corrupt)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });

      // Name is an owned name (hos) but payload type is corrupt — simulates producer/consumer skew.
      await expect(processor.process(buildJob({ type: 'mystery' as SyncJobType }, { name: 'hos' }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks failed and rethrows on final attempt', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      mockEldSyncService.syncHos.mockRejectedValue(new Error('API timeout'));

      const job = buildJob({ type: 'hos' }, { attemptsMade: 2 }); // final attempt (attempts=3)

      await expect(processor.process(job)).rejects.toThrow('API timeout');

      expect(mockJobService.markFailed).toHaveBeenCalledWith(1, 'API timeout', expect.any(Object));
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastErrorMessage: 'API timeout' }),
        }),
      );
    });

    it('moves non-retryable errors directly to failed without rethrowing', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      const error = new Error('Token revoked') as Error & { nonRetryable?: boolean };
      error.nonRetryable = true;
      mockEldSyncService.syncHos.mockRejectedValue(error);

      const job = buildJob({ type: 'hos' }, { attemptsMade: 0 });

      const result = await processor.process(job);

      expect(job.moveToFailed).toHaveBeenCalled();
      expect(result.details).toEqual({ error: 'Token revoked' });
    });
  });

  describe('onFailed (DLQ)', () => {
    it('records a dead-letter row when attempts are exhausted', async () => {
      const job = buildJob({ type: 'hos' }, { attempts: 3, attemptsMade: 3 });
      const err = new Error('exhausted');

      await processor.onFailed(job, err);

      expect(mockDeadLetter.recordPermanentFailure).toHaveBeenCalledWith(job, err);
    });

    it('does NOT record a dead-letter row for an intermediate failure', async () => {
      const job = buildJob({ type: 'hos' }, { attempts: 3, attemptsMade: 1 });

      await processor.onFailed(job, new Error('retry me'));

      expect(mockDeadLetter.recordPermanentFailure).not.toHaveBeenCalled();
    });
  });
});
