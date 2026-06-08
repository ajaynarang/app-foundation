import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { IntegrationsService } from '../integrations.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { IntegrationDataService } from '../services/integration-data.service';
import { JobService } from '../../../infrastructure/queue/job.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { createMockPrisma, createMockQueue } from '../../../test/mocks';

describe('IntegrationsService', () => {
  let service: IntegrationsService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let mockQueue: ReturnType<typeof createMockQueue>;

  const mockCredentials = {
    encrypt: jest.fn((v: string) => `enc_${v}`),
    decrypt: jest.fn((v: string) => v.replace('enc_', '')),
  };

  const mockIntegrationManager = {
    testConnection: jest.fn(),
  };

  const mockJobService = {
    createJob: jest.fn(),
  };

  beforeEach(async () => {
    prisma = createMockPrisma();
    mockQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CredentialsService, useValue: mockCredentials },
        { provide: IntegrationDataService, useValue: mockIntegrationManager },
        { provide: JobService, useValue: mockJobService },
        {
          provide: getQueueToken(QUEUE_NAMES.TELEMETRY),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VENDOR_DATA),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listIntegrations ────────────────────────────────────────────────────

  describe('listIntegrations', () => {
    it('should return formatted integrations for numeric tenantId', async () => {
      const now = new Date();
      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          integrationId: 'int_1',
          integrationType: 'ELD',
          vendor: 'SAMSARA_ELD',
          displayName: 'Samsara',
          isEnabled: true,
          status: 'ACTIVE',
          lastSyncAt: now,
          lastSuccessAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
          createdAt: now,
          updatedAt: now,
        },
      ]);

      const result = await service.listIntegrations(1);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('int_1');
      expect(result[0].vendor).toBe('SAMSARA_ELD');
    });

    it('should resolve string tenantId from tenant table', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 42 });
      prisma.integrationConfig.findMany.mockResolvedValue([]);

      const result = await service.listIntegrations('tnt_abc');

      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tnt_abc' },
        select: { id: true },
      });
      expect(result).toEqual([]);
    });

    it('should throw when string tenantId not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.listIntegrations('tnt_nonexistent')).rejects.toThrow('Tenant not found');
    });
  });

  // ─── getIntegration ──────────────────────────────────────────────────────

  describe('getIntegration', () => {
    it('should return formatted integration', async () => {
      const now = new Date();
      prisma.integrationConfig.findUnique.mockResolvedValue({
        integrationId: 'int_1',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Samsara',
        isEnabled: true,
        status: 'ACTIVE',
        lastSyncAt: now,
        lastSuccessAt: now,
        lastErrorAt: null,
        lastErrorMessage: null,
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.getIntegration('int_1');

      expect(result.id).toBe('int_1');
      expect(result.status).toBe('ACTIVE');
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.getIntegration('int_bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createIntegration ───────────────────────────────────────────────────

  describe('createIntegration', () => {
    it('should throw BadRequestException for unsupported vendor', async () => {
      await expect(
        service.createIntegration(1, {
          integrationType: 'ELD' as any,
          vendor: 'UNSUPPORTED_VENDOR' as any,
          displayName: 'Test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when integration already exists', async () => {
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
      });

      await expect(
        service.createIntegration(1, {
          integrationType: 'ELD' as any,
          vendor: 'SAMSARA_ELD' as any,
          displayName: 'Samsara',
          credentials: { apiToken: 'tok_123' },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should encrypt credentials and create integration', async () => {
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      const now = new Date();
      prisma.integrationConfig.create.mockResolvedValue({
        integrationId: 'int_new',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Samsara',
        isEnabled: true,
        status: 'CONFIGURED',
        createdAt: now,
        updatedAt: now,
        id: 5,
      });
      mockJobService.createJob.mockResolvedValue({ id: 'job_1' });

      const result = await service.createIntegration(1, {
        integrationType: 'ELD' as any,
        vendor: 'SAMSARA_ELD' as any,
        displayName: 'Samsara',
        credentials: { apiToken: 'tok_123' },
      });

      expect(result.id).toBe('int_new');
      expect(result.status).toBe('CONFIGURED');
      expect(mockCredentials.encrypt).toHaveBeenCalledWith('tok_123');
    });

    it('should auto-trigger ELD sync on create', async () => {
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      prisma.integrationConfig.create.mockResolvedValue({
        integrationId: 'int_new',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Samsara',
        isEnabled: true,
        status: 'CONFIGURED',
        createdAt: new Date(),
        updatedAt: new Date(),
        id: 5,
      });
      mockJobService.createJob.mockResolvedValue({ id: 'job_1' });

      await service.createIntegration(1, {
        integrationType: 'ELD' as any,
        vendor: 'SAMSARA_ELD' as any,
        displayName: 'Samsara',
        credentials: { apiToken: 'tok_123' },
      });

      expect(mockJobService.createJob).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'telemetry',
          type: 'fleet-sync',
        }),
      );
      expect(mockQueue.add).toHaveBeenCalled();
    });
  });

  // ─── updateIntegration ───────────────────────────────────────────────────

  describe('updateIntegration', () => {
    it('should throw NotFoundException when not found', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.updateIntegration('int_bad', { displayName: 'New' })).rejects.toThrow(NotFoundException);
    });

    it('should encrypt new credentials and merge with existing', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue({
        integrationId: 'int_1',
        credentials: { apiToken: 'enc_old_tok' },
      });
      prisma.integrationConfig.update.mockResolvedValue({
        integrationId: 'int_1',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Updated',
        isEnabled: true,
        status: 'ACTIVE',
        updatedAt: new Date(),
      });

      await service.updateIntegration('int_1', {
        credentials: { apiToken: 'new_tok' },
      });

      expect(mockCredentials.encrypt).toHaveBeenCalledWith('new_tok');
    });
  });

  // ─── deleteIntegration ───────────────────────────────────────────────────

  describe('deleteIntegration', () => {
    it('should delete integration', async () => {
      prisma.integrationConfig.delete.mockResolvedValue({});

      const result = await service.deleteIntegration('int_1');

      expect(result.success).toBe(true);
      expect(prisma.integrationConfig.delete).toHaveBeenCalledWith({
        where: { integrationId: 'int_1' },
      });
    });
  });

  // ─── testConnection ──────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('should return success when connection works', async () => {
      mockIntegrationManager.testConnection.mockResolvedValue(true);

      const result = await service.testConnection('int_1');

      expect(result.success).toBe(true);
      expect(result.message).toContain('successful');
    });

    it('should return failure when connection fails', async () => {
      mockIntegrationManager.testConnection.mockResolvedValue(false);

      const result = await service.testConnection('int_1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed');
    });
  });

  // ─── getSyncHistory ──────────────────────────────────────────────────────

  describe('getSyncHistory', () => {
    it('should throw NotFoundException when integration not found', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.getSyncHistory('int_bad')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getSyncStats ────────────────────────────────────────────────────────

  describe('getSyncStats', () => {
    it('should throw NotFoundException when integration not found', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.getSyncStats('int_bad')).rejects.toThrow(NotFoundException);
    });

    it('should compute success rate correctly', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue({
        integrationId: 'int_1',
      });
      prisma.job.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(8) // successful
        .mockResolvedValueOnce(2); // failed

      const result = await service.getSyncStats('int_1');

      expect(result.totalSyncs).toBe(10);
      expect(result.successfulSyncs).toBe(8);
      expect(result.failedSyncs).toBe(2);
      expect(result.successRate).toBe(80);
    });

    it('should return 0 success rate when no syncs', async () => {
      prisma.integrationConfig.findUnique.mockResolvedValue({
        integrationId: 'int_1',
      });
      prisma.job.count.mockResolvedValue(0);

      const result = await service.getSyncStats('int_1');

      expect(result.successRate).toBe(0);
    });
  });

  // ─── getHealthSummary ─────────────────────────────────────────────────

  describe('getHealthSummary', () => {
    it('should return summary with no integrations', async () => {
      prisma.integrationConfig.findMany.mockResolvedValue([]);
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.groupBy.mockResolvedValue([]);

      const result = await service.getHealthSummary(1);

      expect(result.hasIntegrations).toBe(false);
      expect(result.hasFleetPipeline).toBe(false);
      expect(result.tms).toBeNull();
      expect(result.eld).toBeNull();
      expect(result.activeSyncs).toEqual([]);
    });

    it('should return tms and eld when configured', async () => {
      const now = new Date();
      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          integrationId: 'int_tms',
          integrationType: 'TMS',
          vendor: 'PROJECT44_TMS',
          displayName: 'P44',
          isEnabled: true,
          status: 'ACTIVE',
          lastSyncAt: now,
          lastSuccessAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
        {
          integrationId: 'int_eld',
          integrationType: 'ELD',
          vendor: 'SAMSARA_ELD',
          displayName: 'Samsara',
          isEnabled: true,
          status: 'ACTIVE',
          lastSyncAt: now,
          lastSuccessAt: now,
          lastErrorAt: null,
          lastErrorMessage: null,
        },
      ]);
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.groupBy.mockResolvedValue([{ type: 'fleet-sync', _max: { completedAt: now } }]);

      const result = await service.getHealthSummary(1);

      expect(result.hasIntegrations).toBe(true);
      expect(result.hasFleetPipeline).toBe(true);
      expect(result.tms).toBeTruthy();
      expect(result.tms.vendor).toBe('PROJECT44_TMS');
      expect(result.eld).toBeTruthy();
      expect(result.eld.vendor).toBe('SAMSARA_ELD');
      expect(result.configuredTypes).toEqual(['TMS', 'ELD']);
    });

    it('should detect hasError when lastErrorAt is more recent than lastSuccessAt', async () => {
      const now = new Date();
      const earlier = new Date(now.getTime() - 10000);

      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          integrationId: 'int_eld',
          integrationType: 'ELD',
          vendor: 'SAMSARA_ELD',
          displayName: 'Samsara',
          isEnabled: true,
          status: 'ERROR',
          lastSyncAt: now,
          lastSuccessAt: earlier,
          lastErrorAt: now,
          lastErrorMessage: 'Connection failed',
        },
      ]);
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.groupBy.mockResolvedValue([]);

      const result = await service.getHealthSummary(1);

      expect(result.eld.hasError).toBe(true);
      expect(result.eld.lastErrorMessage).toBe('Connection failed');
    });
  });

  // ─── getUnifiedSyncHistory ──────────────────────────────────────────

  describe('getUnifiedSyncHistory', () => {
    it('should return paginated sync history', async () => {
      const now = new Date();
      prisma.job.findMany.mockResolvedValue([
        {
          id: 'job-1',
          type: 'fleet-sync',
          status: 'completed',
          startedAt: now,
          completedAt: now,
          createdAt: now,
          inputData: {
            integrationId: 1,
            integrationName: 'Samsara',
            integrationType: 'ELD',
            triggerSource: 'scheduled',
          },
          resultData: {
            recordsProcessed: 10,
            recordsCreated: 5,
            recordsExisting: 5,
          },
          errorDetails: null,
          errorMessage: null,
        },
      ]);
      prisma.job.count.mockResolvedValue(1);
      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 1,
          vendor: 'SAMSARA_ELD',
          integrationType: 'ELD',
          displayName: 'Samsara',
        },
      ]);

      const result = await service.getUnifiedSyncHistory(1, 20, 0);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].syncType).toBe('FLEET-SYNC');
      expect(result.items[0].status).toBe('success');
      expect(result.items[0].vendor).toBe('SAMSARA_ELD');
    });

    it('should filter by syncType and status', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.getUnifiedSyncHistory(1, 20, 0, 'fleet-sync', 'success');

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'fleet-sync',
            status: 'completed',
          }),
        }),
      );
    });

    it('should map running status to queued/processing job status', async () => {
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count.mockResolvedValue(0);

      await service.getUnifiedSyncHistory(1, 20, 0, undefined, 'running');

      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['queued', 'processing'] },
          }),
        }),
      );
    });
  });

  // ─── getVendorRegistry ──────────────────────────────────────────────

  describe('getVendorRegistry', () => {
    it('should return vendor registry merged with DB config', async () => {
      prisma.vendorConfig = { findMany: jest.fn().mockResolvedValue([]) };

      const result = await service.getVendorRegistry();

      expect(Array.isArray(result)).toBe(true);
      // Should have at least SAMSARA_ELD
      const samsara = result.find((v: any) => v.id === 'SAMSARA_ELD');
      expect(samsara).toBeDefined();
    });

    it('should filter out unavailable vendors', async () => {
      prisma.vendorConfig = {
        findMany: jest.fn().mockResolvedValue([
          {
            vendorId: 'SAMSARA_ELD',
            isAvailable: false,
            isOAuthEnabled: true,
          },
        ]),
      };

      const result = await service.getVendorRegistry();

      const samsara = result.find((v: any) => v.id === 'SAMSARA_ELD');
      expect(samsara).toBeUndefined();
    });
  });

  // ─── getSyncHistory ─────────────────────────────────────────────────

  describe('getSyncHistory (success path)', () => {
    it('should return mapped sync history items', async () => {
      const now = new Date();
      prisma.integrationConfig.findUnique.mockResolvedValue({
        integrationId: 'int_1',
        vendor: 'SAMSARA_ELD',
        integrationType: 'ELD',
        displayName: 'Samsara',
      });
      prisma.job.findMany.mockResolvedValue([
        {
          id: 'job-1',
          type: 'fleet-sync',
          status: 'completed',
          startedAt: now,
          completedAt: now,
          createdAt: now,
          inputData: { triggerSource: 'manual' },
          resultData: { recordsProcessed: 5 },
          errorDetails: null,
          errorMessage: null,
        },
      ]);

      const result = await service.getSyncHistory('int_1');

      expect(result).toHaveLength(1);
      expect(result[0].syncType).toBe('FLEET-SYNC');
      expect(result[0].triggerSource).toBe('manual');
    });
  });

  // ─── createIntegration (string tenantId) ─────────────────────────────

  describe('createIntegration (string tenantId)', () => {
    it('should resolve string tenantId and create integration', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: 42 });
      prisma.integrationConfig.findFirst.mockResolvedValue(null);
      const now = new Date();
      prisma.integrationConfig.create.mockResolvedValue({
        integrationId: 'int_new',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Samsara',
        isEnabled: true,
        status: 'CONFIGURED',
        createdAt: now,
        updatedAt: now,
        id: 5,
      });
      mockJobService.createJob.mockResolvedValue({ id: 'job_1' });

      const result = await service.createIntegration('tnt_abc', {
        integrationType: 'ELD' as any,
        vendor: 'SAMSARA_ELD' as any,
        displayName: 'Samsara',
        credentials: { apiToken: 'tok' },
      });

      expect(result.id).toBe('int_new');
      expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tnt_abc' },
        select: { id: true },
      });
    });

    it('should throw when string tenantId not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.createIntegration('tnt_bad', {
          integrationType: 'ELD' as any,
          vendor: 'SAMSARA_ELD' as any,
          displayName: 'Samsara',
          credentials: { apiToken: 'tok' },
        }),
      ).rejects.toThrow('Tenant not found');
    });
  });
});
