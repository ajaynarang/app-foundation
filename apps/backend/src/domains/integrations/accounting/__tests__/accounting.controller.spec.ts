import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AccountingController } from '../controllers/accounting.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { QUEUE_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { QuickBooksApiClient } from '../vendors/quickbooks/quickbooks-api.client';
import { AccountingSyncService } from '../services/accounting-sync.service';
import { AccountingMappingService } from '../services/accounting-mapping.service';
import { AuthTokenService } from '../../oauth/auth-token.service';

const mockPrisma = {
  tenant: { findUnique: jest.fn() },
  integrationConfig: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  job: {
    findFirst: jest.fn().mockResolvedValue(null), // no active sync jobs
  },
};

const mockJobService = {
  createJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockAccountingQueue = { add: jest.fn() };

const mockQbApiClient = {
  fetchCompanyInfo: jest.fn(),
};

const mockSyncService = {};

const mockMappingService = {
  listEntityMappings: jest.fn(),
  listExternalEntities: jest.fn(),
  updateMapping: jest.fn(),
  confirmMapping: jest.fn(),
  listAccountMappings: jest.fn(),
  updateAccountMapping: jest.fn(),
};

const mockAuthTokenService = {
  decryptCredentials: jest.fn(),
};

const TENANT_DB_ID = 5;
const USER = { tenantId: 'tenant-abc', dbId: 1 };

describe('AccountingController', () => {
  let controller: AccountingController;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue({
      id: TENANT_DB_ID,
      tenantId: 'tenant-abc',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AccountingController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JobService, useValue: mockJobService },
        { provide: QuickBooksApiClient, useValue: mockQbApiClient },
        { provide: AccountingSyncService, useValue: mockSyncService },
        { provide: AccountingMappingService, useValue: mockMappingService },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        {
          provide: getQueueToken(QUEUE_NAMES.FINANCE),
          useValue: mockAccountingQueue,
        },
      ],
    }).compile();

    controller = module.get<AccountingController>(AccountingController);
  });

  // --------------------------------------------------------------------------
  // getStatus
  // --------------------------------------------------------------------------

  describe('getStatus', () => {
    it('should return connected:false when no config', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      const result = await controller.getStatus(USER);

      expect(result).toEqual({ connected: false });
    });

    it('should return connected:false when config has no credentials', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        credentials: null,
      });

      const result = await controller.getStatus(USER);
      expect(result).toEqual({ connected: false });
    });

    it('should return cached company name if available', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        credentials: 'enc',
        syncMetadata: { companyName: 'My Company' },
        realmId: 'realm-1',
        lastSyncAt: new Date('2026-01-01'),
        status: 'ACTIVE',
      });

      const result = await controller.getStatus(USER);

      expect(result.connected).toBe(true);
      expect(result.companyName).toBe('My Company');
      expect(result.vendor).toBe('QUICKBOOKS');
      expect(mockQbApiClient.fetchCompanyInfo).not.toHaveBeenCalled();
    });

    it('should fetch company name from QB when not cached', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        credentials: 'enc',
        syncMetadata: null,
        realmId: 'realm-1',
        lastSyncAt: null,
        status: 'ACTIVE',
      });
      mockAuthTokenService.decryptCredentials.mockReturnValue({
        accessToken: 'at',
        realmId: 'realm-1',
      });
      mockQbApiClient.fetchCompanyInfo.mockResolvedValue({
        CompanyInfo: { CompanyName: 'Fetched Co' },
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      const result = await controller.getStatus(USER);

      expect(result.connected).toBe(true);
      expect(result.companyName).toBe('Fetched Co');
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalled();
    });

    it('should handle QB fetch failure gracefully', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        credentials: 'enc',
        syncMetadata: null,
        realmId: 'r',
        lastSyncAt: null,
        status: 'ACTIVE',
      });
      mockAuthTokenService.decryptCredentials.mockReturnValue({
        accessToken: 'at',
        realmId: 'r',
      });
      mockQbApiClient.fetchCompanyInfo.mockRejectedValue(new Error('QB down'));

      const result = await controller.getStatus(USER);

      expect(result.connected).toBe(true);
      expect(result.companyName).toBeNull();
      expect(result.error).toBe('Failed to fetch company info');
    });
  });

  // --------------------------------------------------------------------------
  // listMappings
  // --------------------------------------------------------------------------

  describe('listMappings', () => {
    it('should return entity mappings for valid entity type', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });
      mockMappingService.listEntityMappings.mockResolvedValue([]);

      await controller.listMappings(USER, 'customer');

      expect(mockMappingService.listEntityMappings).toHaveBeenCalledWith(TENANT_DB_ID, 'int-1', 'customer');
    });

    it('should throw BadRequest for invalid entity type', async () => {
      await expect(controller.listMappings(USER, 'invalid')).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------------------------
  // listExternalEntities
  // --------------------------------------------------------------------------

  describe('listExternalEntities', () => {
    it('should return external entities for valid type', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });
      mockMappingService.listExternalEntities.mockResolvedValue([]);

      await controller.listExternalEntities(USER, 'vendor');

      expect(mockMappingService.listExternalEntities).toHaveBeenCalledWith('int-1', 'vendor');
    });

    it('should throw BadRequest for invalid entity type', async () => {
      await expect(controller.listExternalEntities(USER, 'bogus')).rejects.toThrow(BadRequestException);
    });
  });

  // --------------------------------------------------------------------------
  // updateMapping / confirmMapping
  // --------------------------------------------------------------------------

  describe('updateMapping', () => {
    it('should delegate to mapping service', async () => {
      mockMappingService.updateMapping.mockResolvedValue({ id: 1 });

      await controller.updateMapping(USER, '1', {
        externalId: 'ext-1',
        externalName: 'Ext Name',
      });

      expect(mockMappingService.updateMapping).toHaveBeenCalledWith(1, TENANT_DB_ID, 'ext-1', 'Ext Name');
    });
  });

  describe('confirmMapping', () => {
    it('should delegate to mapping service', async () => {
      mockMappingService.confirmMapping.mockResolvedValue({ id: 1 });

      await controller.confirmMapping(USER, '1');

      expect(mockMappingService.confirmMapping).toHaveBeenCalledWith(1, TENANT_DB_ID);
    });
  });

  // --------------------------------------------------------------------------
  // listAccountMappings / updateAccountMapping
  // --------------------------------------------------------------------------

  describe('listAccountMappings', () => {
    it('should delegate to mapping service', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });
      mockMappingService.listAccountMappings.mockResolvedValue([]);

      await controller.listAccountMappings(USER);

      expect(mockMappingService.listAccountMappings).toHaveBeenCalledWith(TENANT_DB_ID, 'int-1');
    });
  });

  describe('updateAccountMapping', () => {
    it('should delegate to mapping service', async () => {
      mockMappingService.updateAccountMapping.mockResolvedValue({ id: 1 });

      await controller.updateAccountMapping(USER, '2', {
        externalAccountId: 'ext-a',
        externalAccountName: 'Ext Account',
      });

      expect(mockMappingService.updateAccountMapping).toHaveBeenCalledWith(2, TENANT_DB_ID, 'ext-a', 'Ext Account');
    });
  });

  // --------------------------------------------------------------------------
  // syncInvoice / syncSettlement
  // --------------------------------------------------------------------------

  describe('syncInvoice', () => {
    it('should create job and enqueue', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });

      const result = await controller.syncInvoice(USER, 'inv-42');

      expect(result).toEqual({ success: true, jobId: 'job-1' });
      expect(mockJobService.createJob).toHaveBeenCalled();
      expect(mockAccountingQueue.add).toHaveBeenCalled();
    });

    it('should throw if no active integration', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      await expect(controller.syncInvoice(USER, 'inv-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('syncSettlement', () => {
    it('should create job and enqueue', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });

      const result = await controller.syncSettlement(USER, 'set-1');

      expect(result).toEqual({ success: true, jobId: 'job-1' });
      expect(mockAccountingQueue.add).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // triggerInitialSync
  // --------------------------------------------------------------------------

  describe('triggerInitialSync', () => {
    it('should create job and enqueue initial-sync', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        integrationId: 'int-1',
      });

      const result = await controller.triggerInitialSync(USER);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Initial entity sync started');
    });
  });
});
