import { Test, TestingModule } from '@nestjs/testing';
import type { JobEnvelope } from '@app/shared-types';
import { OAuthRefreshJobHandler } from '../oauth-refresh.processor';
import { AuthTokenService } from '../auth-token.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { VendorCircuitBreakerService } from '@appshore/platform/infrastructure/queue/vendor-circuit-breaker.service';

interface OAuthRefreshJobData {
  tenantId: number;
  integrationId: string;
  vendor: string;
}

describe('OAuthRefreshJobHandler', () => {
  let processor: OAuthRefreshJobHandler;
  let authTokenService: any;
  let prisma: any;
  let circuitBreaker: any;

  beforeEach(async () => {
    authTokenService = {
      refreshTokens: jest.fn(),
    };

    prisma = {
      tenant: { findUnique: jest.fn() },
      integrationConfig: { findFirst: jest.fn() },
    };

    circuitBreaker = {
      isOpen: jest.fn().mockResolvedValue(false),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthRefreshJobHandler,
        { provide: AuthTokenService, useValue: authTokenService },
        { provide: PrismaService, useValue: prisma },
        { provide: VendorCircuitBreakerService, useValue: circuitBreaker },
      ],
    }).compile();

    processor = module.get<OAuthRefreshJobHandler>(OAuthRefreshJobHandler);
  });

  const wrap = (payload: OAuthRefreshJobData): JobEnvelope<OAuthRefreshJobData> => ({
    tenantId: String(payload.tenantId),
    correlationId: 'corr-1',
    payload,
    metadata: { enqueuedAt: new Date().toISOString(), source: 'cron', version: 1 },
  });

  const makeJob = (data: OAuthRefreshJobData, name: string = 'oauth-refresh') => ({ name, data: wrap(data) }) as any;

  describe('process', () => {
    it('should throw when circuit breaker is open', async () => {
      circuitBreaker.isOpen.mockResolvedValue(true);

      await expect(
        processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' })),
      ).rejects.toThrow(/circuit open/i);

      expect(authTokenService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should skip refresh when tenant is paused', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: true });

      await processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' }));

      expect(authTokenService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should skip when integration not found', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue(null);

      await processor.run(makeJob({ tenantId: 1, integrationId: 'int-missing', vendor: 'QUICKBOOKS' }));

      expect(authTokenService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should skip when integration is disabled', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        isEnabled: false,
        status: 'ACTIVE',
      });

      await processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' }));

      expect(authTokenService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should skip when integration is NOT_CONFIGURED', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 1,
        isEnabled: true,
        status: 'NOT_CONFIGURED',
      });

      await processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' }));

      expect(authTokenService.refreshTokens).not.toHaveBeenCalled();
    });

    it('should call refreshTokens and recordSuccess for active integration', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 42,
        isEnabled: true,
        status: 'ACTIVE',
      });
      authTokenService.refreshTokens.mockResolvedValue('new-token');

      await processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' }));

      expect(authTokenService.refreshTokens).toHaveBeenCalledWith(42);
      expect(circuitBreaker.recordSuccess).toHaveBeenCalledWith('QUICKBOOKS');
    });

    it('should not throw and not trip breaker for non-retryable errors', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 42,
        isEnabled: true,
        status: 'ACTIVE',
      });
      const error: any = new Error('invalid_grant');
      error.nonRetryable = true;
      authTokenService.refreshTokens.mockRejectedValue(error);

      await expect(
        processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' })),
      ).resolves.toBeUndefined();

      expect(circuitBreaker.recordFailure).not.toHaveBeenCalled();
    });

    it('should recordFailure and re-throw retryable errors', async () => {
      prisma.tenant.findUnique.mockResolvedValue({ jobsPaused: false });
      prisma.integrationConfig.findFirst.mockResolvedValue({
        id: 42,
        isEnabled: true,
        status: 'ACTIVE',
      });
      authTokenService.refreshTokens.mockRejectedValue(new Error('network timeout'));

      await expect(
        processor.run(makeJob({ tenantId: 1, integrationId: 'int-1', vendor: 'QUICKBOOKS' })),
      ).rejects.toThrow('network timeout');

      expect(circuitBreaker.recordFailure).toHaveBeenCalledWith('QUICKBOOKS');
    });
  });
});
