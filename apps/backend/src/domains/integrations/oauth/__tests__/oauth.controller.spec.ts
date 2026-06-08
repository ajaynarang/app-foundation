import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuthController } from '../oauth.controller';
import { AuthTokenService } from '../auth-token.service';
import { OAuthTokenRefreshJob } from '../oauth-token-refresh.job';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const TENANT = { id: 5, tenantId: 'tenant-abc' };

const mockPrisma = {
  tenant: { findUnique: jest.fn().mockResolvedValue(TENANT) },
  integrationConfig: { findFirst: jest.fn() },
};

const mockAuthTokenService = {
  getConnectUrl: jest.fn().mockResolvedValue({ authUrl: 'https://auth.example.com?state=abc' }),
  handleCallback: jest.fn().mockResolvedValue({ vendor: 'QUICKBOOKS', tenantId: 5 }),
  disconnect: jest.fn(),
};

const mockTokenRefreshJob = {
  registerForIntegration: jest.fn(),
  removeForIntegration: jest.fn(),
};

const mockConfig = {
  get: jest.fn().mockReturnValue('http://localhost:3002'),
};

describe('OAuthController', () => {
  let controller: OAuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: OAuthTokenRefreshJob, useValue: mockTokenRefreshJob },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    controller = module.get<OAuthController>(OAuthController);
  });

  // --------------------------------------------------------------------------
  // connect
  // --------------------------------------------------------------------------

  describe('connect', () => {
    it('should return authorization URL for OAuth vendor', async () => {
      const result = await controller.connect('QUICKBOOKS', {
        tenantId: 'tenant-abc',
      });

      expect(result.authUrl).toContain('https://auth.example.com');
      expect(mockAuthTokenService.getConnectUrl).toHaveBeenCalledWith('QUICKBOOKS', 5);
    });

    it('should throw BadRequestException for non-OAuth vendor', async () => {
      await expect(controller.connect('PROJECT44_TMS', { tenantId: 'tenant-abc' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // --------------------------------------------------------------------------
  // callback
  // --------------------------------------------------------------------------

  describe('callback', () => {
    it('should handle callback and redirect on success', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        integrationId: 'int-1',
      });

      const mockRes = { redirect: jest.fn() };
      const mockReq = {
        query: { code: 'auth-code', state: 'state-b64', realmId: 'r-1' },
      };

      await controller.callback('auth-code', 'state-b64', mockReq, mockRes as any);

      expect(mockAuthTokenService.handleCallback).toHaveBeenCalledWith('auth-code', 'state-b64', { realmId: 'r-1' });
      expect(mockRes.redirect).toHaveBeenCalledWith(expect.stringContaining('oauth=connected'));
    });

    it('should register token refresh job after successful callback', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        integrationId: 'int-1',
      });

      const mockRes = { redirect: jest.fn() };
      const mockReq = { query: { code: 'c', state: 's' } };

      await controller.callback('c', 's', mockReq, mockRes as any);

      expect(mockTokenRefreshJob.registerForIntegration).toHaveBeenCalled();
    });

    it('should redirect with error on callback failure', async () => {
      mockAuthTokenService.handleCallback.mockRejectedValue(new Error('Invalid state'));

      const mockRes = { redirect: jest.fn() };
      const mockReq = { query: { code: 'c', state: 's' } };

      await controller.callback('c', 's', mockReq, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith(expect.stringContaining('oauth=error'));
    });

    it('should throw BadRequestException if code or state missing', async () => {
      const mockRes = { redirect: jest.fn() };
      const mockReq = { query: {} };

      await controller.callback('', '', mockReq, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith(expect.stringContaining('oauth=error'));
    });

    it('should extract vendor from state for error redirect', async () => {
      mockAuthTokenService.handleCallback.mockRejectedValue(new Error('fail'));

      const statePayload = { vendor: 'SAMSARA_ELD', tenantId: 1, nonce: 'n' };
      const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

      const mockRes = { redirect: jest.fn() };
      const mockReq = { query: { code: 'c', state } };

      await controller.callback('c', state, mockReq, mockRes as any);

      expect(mockRes.redirect).toHaveBeenCalledWith(expect.stringContaining('vendor=SAMSARA_ELD'));
    });
  });

  // --------------------------------------------------------------------------
  // disconnect
  // --------------------------------------------------------------------------

  describe('disconnect', () => {
    it('should disconnect vendor and remove refresh job', async () => {
      const result = await controller.disconnect('QUICKBOOKS', {
        tenantId: 'tenant-abc',
      });

      expect(result.success).toBe(true);
      expect(mockAuthTokenService.disconnect).toHaveBeenCalledWith('QUICKBOOKS', 5);
      expect(mockTokenRefreshJob.removeForIntegration).toHaveBeenCalledWith('QUICKBOOKS', 5);
    });

    it('should throw BadRequestException for non-OAuth vendor', async () => {
      await expect(controller.disconnect('PROJECT44_TMS', { tenantId: 'tenant-abc' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
