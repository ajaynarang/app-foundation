import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationsController } from '../integrations.controller';
import { IntegrationsService } from '../integrations.service';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../credentials/credentials.service';
import { IntegrationDataService } from '../services/integration-data.service';
import { JobService } from '../../../infrastructure/queue/job.service';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';

describe('IntegrationsController - Sync Endpoints', () => {
  let controller: IntegrationsController;

  const mockPrisma = {
    integrationConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    tenant: {
      findFirst: jest.fn(),
    },
  };

  const mockJobService = {
    createJob: jest.fn(),
    listJobs: jest.fn(),
  };

  const mockSyncQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        {
          provide: IntegrationsService,
          useValue: {
            triggerSync: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: JobService,
          useValue: mockJobService,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.TELEMETRY),
          useValue: mockSyncQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VENDOR_DATA),
          useValue: mockSyncQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: mockSyncQueue,
        },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /integrations/:integrationId/sync', () => {
    it('should trigger manual sync for integration', async () => {
      mockPrisma.integrationConfig.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        displayName: 'Test TMS',
        integrationType: 'TMS',
      });
      mockJobService.createJob.mockResolvedValue({ id: 'job-1' });

      const req = { user: { dbId: 1 } };
      const result = await controller.triggerSync('test-integration-id', req);

      expect(result.success).toBe(true);
      expect(result.jobIds).toBeDefined();
      expect(mockSyncQueue.add).toHaveBeenCalled();
    });

    it('should return 404 if integration not found', async () => {
      mockPrisma.integrationConfig.findUnique.mockResolvedValue(null);

      const req = { user: { dbId: 1 } };
      await expect(controller.triggerSync('nonexistent', req)).rejects.toThrow('Integration not found');
    });
  });
});

describe('IntegrationsController - Extended Coverage', () => {
  let controller: IntegrationsController;

  const mockPrismaExt = {
    integrationConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockIntegrationsService = {
    listIntegrations: jest.fn().mockResolvedValue([]),
    getVendorRegistry: jest.fn().mockReturnValue({}),
    getHealthSummary: jest.fn().mockResolvedValue({}),
    getUnifiedSyncHistory: jest.fn().mockResolvedValue([]),
    getIntegration: jest.fn().mockResolvedValue({ id: 'int-1' }),
    createIntegration: jest.fn().mockResolvedValue({ id: 'int-new' }),
    updateIntegration: jest.fn().mockResolvedValue({ id: 'int-1' }),
    deleteIntegration: jest.fn().mockResolvedValue({ success: true }),
    testConnection: jest.fn().mockResolvedValue({ success: true }),
    getSyncHistory: jest.fn().mockResolvedValue([]),
    getSyncStats: jest.fn().mockResolvedValue({}),
    triggerSync: jest.fn(),
  };

  const mockJobServiceExt = {
    createJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
    listJobs: jest.fn().mockResolvedValue([]),
  };

  const mockFleetQueue = { add: jest.fn() };
  const mockAcctQueue = { add: jest.fn() };

  const TENANT = { id: 5, tenantId: 'tenant-abc' };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrismaExt.tenant.findUnique.mockResolvedValue(TENANT);
    mockPrismaExt.tenant.findFirst.mockResolvedValue(TENANT);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IntegrationsController],
      providers: [
        { provide: IntegrationsService, useValue: mockIntegrationsService },
        { provide: PrismaService, useValue: mockPrismaExt },
        { provide: JobService, useValue: mockJobServiceExt },
        {
          provide: getQueueToken(QUEUE_NAMES.TELEMETRY),
          useValue: mockFleetQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VENDOR_DATA),
          useValue: mockFleetQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: mockAcctQueue,
        },
      ],
    }).compile();

    controller = module.get<IntegrationsController>(IntegrationsController);
  });

  describe('listIntegrations', () => {
    it('should list integrations for tenant', async () => {
      await controller.listIntegrations({ user: { tenantId: 'tid' } });
      expect(mockIntegrationsService.listIntegrations).toHaveBeenCalledWith('tid');
    });
  });

  describe('getVendorRegistry', () => {
    it('should return vendor registry', () => {
      controller.getVendorRegistry();
      expect(mockIntegrationsService.getVendorRegistry).toHaveBeenCalled();
    });
  });

  describe('getHealthSummary', () => {
    it('should return health summary', async () => {
      await controller.getHealthSummary({ user: { tenantDbId: 5 } });
      expect(mockIntegrationsService.getHealthSummary).toHaveBeenCalledWith(5);
    });
  });

  describe('getUnifiedSyncHistory', () => {
    it('should return sync history', async () => {
      await controller.getUnifiedSyncHistory({ user: { tenantDbId: 5 } }, '10', '0', 'tms', 'completed');
      expect(mockIntegrationsService.getUnifiedSyncHistory).toHaveBeenCalledWith(5, 10, 0, 'tms', 'completed');
    });
  });

  describe('CRUD endpoints', () => {
    it('should get integration by ID', async () => {
      await controller.getIntegration('int-1');
      expect(mockIntegrationsService.getIntegration).toHaveBeenCalledWith('int-1');
    });

    it('should create integration', async () => {
      await controller.createIntegration({ integrationType: 'ELD', vendor: 'SAMSARA_ELD' } as any, {
        user: { tenantId: 'tid' },
      });
      expect(mockIntegrationsService.createIntegration).toHaveBeenCalled();
    });

    it('should update integration', async () => {
      await controller.updateIntegration('int-1', {
        displayName: 'New Name',
      } as any);
      expect(mockIntegrationsService.updateIntegration).toHaveBeenCalledWith('int-1', expect.anything());
    });

    it('should delete integration', async () => {
      await controller.deleteIntegration('int-1');
      expect(mockIntegrationsService.deleteIntegration).toHaveBeenCalledWith('int-1');
    });

    it('should test connection', async () => {
      await controller.testConnection('int-1');
      expect(mockIntegrationsService.testConnection).toHaveBeenCalledWith('int-1');
    });
  });

  describe('getSyncHistory / getSyncStats', () => {
    it('should get sync history with defaults', async () => {
      await controller.getSyncHistory('int-1');
      expect(mockIntegrationsService.getSyncHistory).toHaveBeenCalledWith('int-1', 50, 0);
    });

    it('should get sync stats', async () => {
      await controller.getSyncStats('int-1');
      expect(mockIntegrationsService.getSyncStats).toHaveBeenCalledWith('int-1');
    });
  });

  describe('syncFleet', () => {
    it('should enqueue ELD + TMS sync jobs with delay', async () => {
      mockPrismaExt.integrationConfig.findMany
        .mockResolvedValueOnce([{ id: 1, displayName: 'Samsara', integrationType: 'ELD' }]) // ELD
        .mockResolvedValueOnce([{ id: 2, displayName: 'P44', integrationType: 'TMS' }]); // TMS

      const result = await controller.syncFleet({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
      expect(result.jobIds.length).toBeGreaterThan(0);
      expect(mockFleetQueue.add).toHaveBeenCalled();
    });

    it('should prevent concurrent syncs', async () => {
      mockJobServiceExt.listJobs.mockResolvedValue([{ id: 'active-job' }]);

      const result = await controller.syncFleet({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('already in progress');
    });
  });

  describe('syncLoads', () => {
    it('should enqueue loads sync', async () => {
      mockPrismaExt.integrationConfig.findMany.mockResolvedValue([
        { id: 2, displayName: 'P44', integrationType: 'TMS' },
      ]);

      const result = await controller.syncLoads({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('syncDrivers', () => {
    it('should enqueue ELD + TMS driver sync', async () => {
      mockPrismaExt.integrationConfig.findMany
        .mockResolvedValueOnce([{ id: 1, displayName: 'Samsara', integrationType: 'ELD' }])
        .mockResolvedValueOnce([{ id: 2, displayName: 'P44', integrationType: 'TMS' }]);

      const result = await controller.syncDrivers({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('syncVehicles', () => {
    it('should enqueue ELD + TMS vehicle sync', async () => {
      mockPrismaExt.integrationConfig.findMany
        .mockResolvedValueOnce([{ id: 1, displayName: 'Samsara', integrationType: 'ELD' }])
        .mockResolvedValueOnce([{ id: 2, displayName: 'P44', integrationType: 'TMS' }]);

      const result = await controller.syncVehicles({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('ELD sync endpoints', () => {
    it('syncELD should enqueue hos + gps jobs', async () => {
      mockPrismaExt.integrationConfig.findMany.mockResolvedValue([
        { id: 1, displayName: 'Samsara', integrationType: 'ELD' },
      ]);

      const result = await controller.syncELD({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });

    it('syncHOS should enqueue hos jobs', async () => {
      mockPrismaExt.integrationConfig.findMany.mockResolvedValue([
        { id: 1, displayName: 'Samsara', integrationType: 'ELD' },
      ]);

      const result = await controller.syncHOS({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });

    it('syncTelematics should enqueue gps jobs', async () => {
      mockPrismaExt.integrationConfig.findMany.mockResolvedValue([
        { id: 1, displayName: 'Samsara', integrationType: 'ELD' },
      ]);

      const result = await controller.syncTelematics({
        user: { tenantDbId: 5, dbId: 1 },
      });

      expect(result.success).toBe(true);
    });
  });

  describe('triggerSync — ACCOUNTING', () => {
    it('should use accounting queue for ACCOUNTING type', async () => {
      mockPrismaExt.integrationConfig.findUnique.mockResolvedValue({
        id: 10,
        tenantId: 5,
        displayName: 'QuickBooks',
        integrationType: 'ACCOUNTING',
      });

      const result = await controller.triggerSync('int-acct', {
        user: { dbId: 1 },
      });

      expect(result.success).toBe(true);
      expect(mockAcctQueue.add).toHaveBeenCalled();
      expect(mockFleetQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('triggerSync — ELD', () => {
    it('should enqueue fleet-sync + delayed hos/gps for ELD type', async () => {
      mockPrismaExt.integrationConfig.findUnique.mockResolvedValue({
        id: 10,
        tenantId: 5,
        displayName: 'Samsara',
        integrationType: 'ELD',
      });

      const result = await controller.triggerSync('int-eld', {
        user: { dbId: 1 },
      });

      expect(result.success).toBe(true);
      // fleet-sync + hos + gps = at least 3 jobs
      expect(result.jobIds.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('triggerSync — TMS (default)', () => {
    it('should enqueue drivers, vehicles, loads for TMS type', async () => {
      mockPrismaExt.integrationConfig.findUnique.mockResolvedValue({
        id: 10,
        tenantId: 5,
        displayName: 'P44',
        integrationType: 'TMS',
      });

      const result = await controller.triggerSync('int-tms', {
        user: { dbId: 1 },
      });

      expect(result.success).toBe(true);
      expect(result.jobIds).toHaveLength(3);
    });
  });

  describe('getTenant fallback', () => {
    it('should look up by userId when tenantDbId not present', async () => {
      await controller.getHealthSummary({
        user: { userId: 'uid-fallback' },
      });

      expect(mockPrismaExt.tenant.findFirst).toHaveBeenCalled();
    });

    it('should throw NotFoundException if tenant not found', async () => {
      mockPrismaExt.tenant.findUnique.mockResolvedValue(null);
      mockPrismaExt.tenant.findFirst.mockResolvedValue(null);

      await expect(controller.getHealthSummary({ user: { userId: 'unknown' } })).rejects.toThrow('Tenant not found');
    });
  });
});

describe('IntegrationsService - Credential Validation', () => {
  let service: IntegrationsService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
    integrationConfig: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
    },
  };

  const mockCredentialsService = {
    encrypt: jest.fn((val) => `encrypted_${val}`),
  };

  const mockIntegrationManager = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: CredentialsService,
          useValue: mockCredentialsService,
        },
        {
          provide: IntegrationDataService,
          useValue: mockIntegrationManager,
        },
        {
          provide: JobService,
          useValue: { createJob: jest.fn() },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.TELEMETRY),
          useValue: { add: jest.fn() },
        },
        {
          provide: getQueueToken(QUEUE_NAMES.VENDOR_DATA),
          useValue: { add: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createIntegration - Credential Validation', () => {
    beforeEach(() => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1 });
    });

    it('should reject unsupported vendor', async () => {
      const dto = {
        integrationType: 'TMS' as any,
        vendor: 'INVALID_VENDOR' as any,
        displayName: 'Test',
        credentials: {},
      };

      await expect(service.createIntegration('test-tenant', dto)).rejects.toThrow(BadRequestException);
      await expect(service.createIntegration('test-tenant', dto)).rejects.toThrow('Unsupported vendor: INVALID_VENDOR');
    });

    it('should reject missing required credentials', async () => {
      const dto = {
        integrationType: 'ELD' as any,
        vendor: 'SAMSARA_ELD' as any,
        displayName: 'Test Samsara',
        credentials: {}, // Missing apiToken
      };

      await expect(service.createIntegration('test-tenant', dto)).rejects.toThrow(BadRequestException);
      await expect(service.createIntegration('test-tenant', dto)).rejects.toThrow(
        'Missing required credentials: apiToken',
      );
    });

    it('should accept valid credentials', async () => {
      const dto = {
        integrationType: 'ELD' as any,
        vendor: 'SAMSARA_ELD' as any,
        displayName: 'Test Samsara',
        credentials: {
          apiToken: 'test-token-123',
        },
      };

      mockPrismaService.integrationConfig.create.mockResolvedValue({
        integrationId: 'int_123',
        integrationType: 'ELD',
        vendor: 'SAMSARA_ELD',
        displayName: 'Test Samsara',
        isEnabled: true,
        status: 'CONFIGURED',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createIntegration('test-tenant', dto);
      expect(result).toBeDefined();
      expect(result.id).toBe('int_123');
    });
  });
});
