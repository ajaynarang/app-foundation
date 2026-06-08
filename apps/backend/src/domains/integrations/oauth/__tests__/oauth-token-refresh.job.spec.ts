import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { OAuthTokenRefreshJob } from '../oauth-token-refresh.job';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AuthTokenService } from '../auth-token.service';
import { QUEUE_NAMES } from '../../../../infrastructure/queue/queue.constants';

describe('OAuthTokenRefreshJob', () => {
  let job: OAuthTokenRefreshJob;
  let prisma: any;
  let authTokenService: any;
  let vendorDataQueue: any;

  beforeEach(async () => {
    prisma = {
      integrationConfig: { findMany: jest.fn() },
    };

    authTokenService = {
      decryptCredentials: jest.fn(),
    };

    vendorDataQueue = {
      add: jest.fn(),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthTokenRefreshJob,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthTokenService, useValue: authTokenService },
        {
          provide: getQueueToken(QUEUE_NAMES.BULK_OPS),
          useValue: vendorDataQueue,
        },
      ],
    }).compile();

    job = module.get<OAuthTokenRefreshJob>(OAuthTokenRefreshJob);
  });

  describe('registerForIntegration', () => {
    it('should add a repeatable envelope-wrapped job at 80% of token expiry', async () => {
      await job.registerForIntegration(1, 'int-1', 'SAMSARA_ELD', 3600);

      expect(vendorDataQueue.add).toHaveBeenCalledWith(
        'oauth-refresh',
        expect.objectContaining({
          tenantId: '1',
          payload: { tenantId: 1, integrationId: 'int-1', vendor: 'SAMSARA_ELD' },
          metadata: expect.objectContaining({ source: 'cron', version: 1 }),
        }),
        expect.objectContaining({
          jobId: 'oauth-refresh-SAMSARA_ELD-1',
          repeat: { every: 2880000 }, // 3600 * 0.8 * 1000
        }),
      );
    });
  });

  describe('removeForIntegration', () => {
    it('should remove matching repeatable job', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([
        {
          id: 'oauth-refresh-SAMSARA_ELD-1',
          key: 'key-1',
          name: 'oauth-refresh',
        },
        { id: 'oauth-refresh-OTHER-2', key: 'key-2', name: 'oauth-refresh' },
      ]);

      await job.removeForIntegration('SAMSARA_ELD', 1);

      expect(vendorDataQueue.removeRepeatableByKey).toHaveBeenCalledWith('key-1');
      expect(vendorDataQueue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when no matching job found', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([
        { id: 'oauth-refresh-OTHER-2', key: 'key-2', name: 'oauth-refresh' },
      ]);

      await job.removeForIntegration('SAMSARA_ELD', 1);

      expect(vendorDataQueue.removeRepeatableByKey).not.toHaveBeenCalled();
    });
  });

  describe('onModuleInit', () => {
    it('should clear existing refresh jobs and register new ones', async () => {
      // Mock existing repeatable jobs to clear
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([
        { name: 'oauth-refresh', key: 'old-key-1' },
        { name: 'other-job', key: 'other-key' },
      ]);

      // No active OAuth integrations
      prisma.integrationConfig.findMany.mockResolvedValue([]);

      await job.onModuleInit();

      // Should clear only oauth-refresh jobs
      expect(vendorDataQueue.removeRepeatableByKey).toHaveBeenCalledWith('old-key-1');
      expect(vendorDataQueue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    });

    it('should register refresh jobs for OAuth integrations', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([]);

      // Return an integration that uses OAuth (Samsara uses OAuth)
      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 1,
          integrationId: 'int-samsara-1',
          tenantId: 5,
          vendor: 'SAMSARA_ELD',
          credentials: 'encrypted_creds',
        },
      ]);

      // AuthTokenService should identify this as OAuth
      authTokenService.decryptCredentials.mockReturnValue({
        authMethod: 'oauth',
        accessToken: 'tok',
        refreshToken: 'rt',
      });

      await job.onModuleInit();

      expect(vendorDataQueue.add).toHaveBeenCalledWith(
        'oauth-refresh',
        expect.objectContaining({
          payload: expect.objectContaining({ tenantId: 5, vendor: 'SAMSARA_ELD' }),
        }),
        expect.objectContaining({
          jobId: 'oauth-refresh-SAMSARA_ELD-5',
        }),
      );
    });

    it('should skip API token integrations', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([]);

      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 2,
          integrationId: 'int-samsara-2',
          tenantId: 6,
          vendor: 'SAMSARA_ELD',
          credentials: 'encrypted_api_creds',
        },
      ]);

      authTokenService.decryptCredentials.mockReturnValue({
        authMethod: 'api_token',
        apiToken: 'samsara-api-token',
      });

      await job.onModuleInit();

      expect(vendorDataQueue.add).not.toHaveBeenCalled();
    });

    it('should skip integrations with decrypt errors', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([]);

      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 3,
          integrationId: 'int-bad',
          tenantId: 7,
          vendor: 'SAMSARA_ELD',
          credentials: 'corrupt',
        },
      ]);

      authTokenService.decryptCredentials.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      await job.onModuleInit();

      expect(vendorDataQueue.add).not.toHaveBeenCalled();
    });

    it('should register integration with null credentials (assumes OAuth)', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([]);

      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 4,
          integrationId: 'int-nocred',
          tenantId: 8,
          vendor: 'SAMSARA_ELD',
          credentials: null,
        },
      ]);

      await job.onModuleInit();

      // With null credentials, the code skips the api_token check
      // and proceeds to register the refresh job (assumes OAuth)
      expect(vendorDataQueue.add).toHaveBeenCalledWith(
        'oauth-refresh',
        expect.objectContaining({ payload: expect.objectContaining({ tenantId: 8, vendor: 'SAMSARA_ELD' }) }),
        expect.any(Object),
      );
    });

    it('should handle clearExistingRefreshJobs failure gracefully', async () => {
      vendorDataQueue.getRepeatableJobs.mockRejectedValue(new Error('Redis error'));

      prisma.integrationConfig.findMany.mockResolvedValue([]);

      // Should not throw
      await job.onModuleInit();
    });

    it('should skip api_token by fallback detection (no authMethod field)', async () => {
      vendorDataQueue.getRepeatableJobs.mockResolvedValue([]);

      prisma.integrationConfig.findMany.mockResolvedValue([
        {
          id: 5,
          integrationId: 'int-legacy',
          tenantId: 9,
          vendor: 'SAMSARA_ELD',
          credentials: 'encrypted',
        },
      ]);

      // Older format: no authMethod field, but has apiToken and no accessToken
      authTokenService.decryptCredentials.mockReturnValue({
        apiToken: 'samsara-token-here',
      });

      await job.onModuleInit();

      expect(vendorDataQueue.add).not.toHaveBeenCalled();
    });
  });
});
