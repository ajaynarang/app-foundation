import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthTokenService } from '../auth-token.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../../credentials/credentials.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { REDIS_CLIENT } from '../../../../infrastructure/cache/redis-client.provider';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

const mockPrisma = {
  integrationConfig: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
};

const mockCredentials = {
  encrypt: jest.fn().mockReturnValue('encrypted_blob'),
  decrypt: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => {
    const map: Record<string, string> = {
      SAMSARA_OAUTH_CLIENT_ID: 'test-client-id',
      SAMSARA_OAUTH_CLIENT_SECRET: 'test-client-secret',
      OAUTH_REDIRECT_URI: 'https://example.com/callback',
      QUICKBOOKS_OAUTH_CLIENT_ID: 'qb-client-id',
      QUICKBOOKS_OAUTH_CLIENT_SECRET: 'qb-client-secret',
    };
    return map[key] ?? fallback ?? '';
  }),
};

describe('AuthTokenService', () => {
  let service: AuthTokenService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
        { provide: CredentialsService, useValue: mockCredentials },
        { provide: SallyCacheService, useValue: mockCache },
        { provide: REDIS_CLIENT, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthTokenService>(AuthTokenService);
  });

  // --------------------------------------------------------------------------
  // getConnectUrl
  // --------------------------------------------------------------------------

  describe('getConnectUrl', () => {
    it('should build authorization URL with nonce in cache', async () => {
      const result = await service.getConnectUrl('SAMSARA_ELD', 1);

      expect(result.authUrl).toContain('https://api.samsara.com/oauth2/authorize');
      expect(result.authUrl).toContain('client_id=test-client-id');
      expect(result.authUrl).toContain('response_type=code');
      expect(result.authUrl).toContain('scope=admin%3Aread');
      expect(result.authUrl).toContain('state=');
      expect(mockCache.set).toHaveBeenCalledWith(expect.stringContaining('sally:oauth:nonce:SAMSARA_ELD:'), 1, 600000);
    });

    it('should throw if vendor does not support OAuth', async () => {
      await expect(service.getConnectUrl('PROJECT44_TMS', 1)).rejects.toThrow('does not support OAuth');
    });

    it('should include extra auth params for QuickBooks', async () => {
      const result = await service.getConnectUrl('QUICKBOOKS', 1);
      expect(result.authUrl).toContain('prompt=consent');
    });
  });

  // --------------------------------------------------------------------------
  // handleCallback
  // --------------------------------------------------------------------------

  describe('handleCallback', () => {
    const statePayload = { tenantId: 1, vendor: 'SAMSARA_ELD', nonce: 'abc' };
    const state = Buffer.from(JSON.stringify(statePayload)).toString('base64');

    beforeEach(() => {
      mockCache.get.mockResolvedValue(1);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          expires_in: 3600,
        }),
      });
    });

    it('should exchange code and store credentials (new integration)', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);
      mockPrisma.integrationConfig.create.mockResolvedValue({ id: 1 });

      const result = await service.handleCallback('auth-code', state, {});

      expect(result).toEqual({ vendor: 'SAMSARA_ELD', tenantId: 1 });
      expect(mockCache.del).toHaveBeenCalled();
      expect(mockCredentials.encrypt).toHaveBeenCalled();
      expect(mockPrisma.integrationConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 1,
            vendor: 'SAMSARA_ELD',
            isEnabled: true,
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should update existing integration', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 5,
        realmId: null,
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({ id: 5 });

      const result = await service.handleCallback('auth-code', state, {});

      expect(result).toEqual({ vendor: 'SAMSARA_ELD', tenantId: 1 });
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 5 } }));
    });

    it('should store realmId from extraParams for QuickBooks', async () => {
      const qbState = Buffer.from(JSON.stringify({ tenantId: 1, vendor: 'QUICKBOOKS', nonce: 'abc' })).toString(
        'base64',
      );
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);
      mockPrisma.integrationConfig.create.mockResolvedValue({ id: 1 });

      await service.handleCallback('code', qbState, {
        realmId: 'realm-123',
      });

      expect(mockPrisma.integrationConfig.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ realmId: 'realm-123' }),
        }),
      );
    });

    it('should throw on invalid CSRF nonce', async () => {
      mockCache.get.mockResolvedValue(null);

      await expect(service.handleCallback('code', state, {})).rejects.toThrow(
        'OAuth session expired — please reconnect your integration',
      );
    });

    it('should throw on mismatched tenant in nonce', async () => {
      mockCache.get.mockResolvedValue(999); // different tenant

      await expect(service.handleCallback('code', state, {})).rejects.toThrow(
        'OAuth session expired — please reconnect your integration',
      );
    });

    it('should throw when token exchange fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Bad Request',
      });

      await expect(service.handleCallback('code', state, {})).rejects.toThrow(
        'OAuth connection failed — please try connecting again',
      );
    });
  });

  // --------------------------------------------------------------------------
  // refreshTokens
  // --------------------------------------------------------------------------

  describe('refreshTokens', () => {
    const mockConfig = {
      id: 10,
      vendor: 'SAMSARA_ELD',
      credentials: 'encrypted_creds',
    };

    beforeEach(() => {
      mockPrisma.integrationConfig.findUnique.mockResolvedValue(mockConfig);
      mockCredentials.decrypt.mockReturnValue(
        JSON.stringify({
          authMethod: 'oauth',
          refreshToken: 'old-refresh',
          accessToken: 'old-access',
        }),
      );
    });

    it('should refresh tokens and update DB', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
          expires_in: 3600,
        }),
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      const result = await service.refreshTokens(10);

      expect(result).toBe('refreshed-access');
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 10 } }));
    });

    it('should throw if no credentials to refresh', async () => {
      mockPrisma.integrationConfig.findUnique.mockResolvedValue({
        id: 10,
        credentials: null,
      });

      await expect(service.refreshTokens(10)).rejects.toThrow('Integration credentials are not configured');
    });

    it('should throw if not an OAuth integration', async () => {
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'api_token' }));

      await expect(service.refreshTokens(10)).rejects.toThrow('This integration does not use OAuth authentication');
    });

    it('should mark NEEDS_RECONNECT on invalid_grant and throw non-retryable', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => JSON.stringify({ error: 'invalid_grant' }),
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      await expect(service.refreshTokens(10)).rejects.toThrow('Reconnect required');
      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'NEEDS_RECONNECT' },
        }),
      );
    });

    it('should throw generic error on non-ok response without invalid_grant', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Server Error',
      });

      await expect(service.refreshTokens(10)).rejects.toThrow('Failed to refresh integration token — please reconnect');
    });

    it('should support legacy refresh_token field name', async () => {
      mockCredentials.decrypt.mockReturnValue(
        JSON.stringify({
          authMethod: 'oauth',
          refresh_token: 'legacy-refresh',
        }),
      );
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new',
          refresh_token: 'new-r',
          expires_in: 3600,
        }),
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      const result = await service.refreshTokens(10);
      expect(result).toBe('new');
    });

    it('should migrate legacy realm_id to camelCase realmId', async () => {
      mockCredentials.decrypt.mockReturnValue(
        JSON.stringify({
          authMethod: 'oauth',
          refreshToken: 'rt',
          realm_id: 'legacy-realm',
        }),
      );
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'a',
          refresh_token: 'r',
          expires_in: 3600,
        }),
      });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      await service.refreshTokens(10);

      const encryptCall = mockCredentials.encrypt.mock.calls[0][0];
      const saved = JSON.parse(encryptCall);
      expect(saved.realmId).toBe('legacy-realm');
      expect(saved.realm_id).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // getActiveToken
  // --------------------------------------------------------------------------

  describe('getActiveToken', () => {
    it('should return apiToken for api_token auth method', async () => {
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'api_token', apiToken: 'my-api-key' }));

      const token = await service.getActiveToken({
        id: 1,
        vendor: 'SAMSARA_ELD',
        credentials: 'encrypted',
      });

      expect(token).toBe('my-api-key');
    });

    it('should return apiToken when no authMethod but apiToken exists', async () => {
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ apiToken: 'legacy-key' }));

      const token = await service.getActiveToken({
        id: 1,
        vendor: 'SAMSARA_ELD',
        credentials: 'encrypted',
      });

      expect(token).toBe('legacy-key');
    });

    it('should return accessToken if not expired for oauth', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockCredentials.decrypt.mockReturnValue(
        JSON.stringify({
          authMethod: 'oauth',
          accessToken: 'still-valid',
          expiresAt: futureDate,
        }),
      );

      const token = await service.getActiveToken({
        id: 1,
        vendor: 'SAMSARA_ELD',
        credentials: 'encrypted',
      });

      expect(token).toBe('still-valid');
    });

    it('should handle legacy OAuth credentials (no authMethod, access_token field)', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      mockCredentials.decrypt.mockReturnValue(
        JSON.stringify({
          access_token: 'legacy-access',
          expires_at: futureDate,
        }),
      );

      const token = await service.getActiveToken({
        id: 1,
        vendor: 'SAMSARA_ELD',
        credentials: 'encrypted',
      });

      expect(token).toBe('legacy-access');
    });

    it('should throw if no credentials', async () => {
      await expect(
        service.getActiveToken({
          id: 1,
          vendor: 'SAMSARA_ELD',
          credentials: null,
        }),
      ).rejects.toThrow('Integration credentials are not configured');
    });

    it('should throw for unknown auth method', async () => {
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'something_weird' }));

      await expect(
        service.getActiveToken({
          id: 1,
          vendor: 'SAMSARA_ELD',
          credentials: 'enc',
        }),
      ).rejects.toThrow('Integration credentials are in an unsupported format — please reconnect');
    });
  });

  // --------------------------------------------------------------------------
  // disconnect
  // --------------------------------------------------------------------------

  describe('disconnect', () => {
    it('should revoke token and clear credentials', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 5,
        credentials: 'enc',
      });
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'oauth', accessToken: 'tk' }));
      mockFetch.mockResolvedValue({ ok: true });
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      await service.disconnect('SAMSARA_ELD', 1);

      expect(mockPrisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            credentials: null,
            isEnabled: false,
            status: 'NOT_CONFIGURED',
          }),
        }),
      );
    });

    it('should do nothing if no config found', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);

      await service.disconnect('SAMSARA_ELD', 1);

      expect(mockPrisma.integrationConfig.update).not.toHaveBeenCalled();
    });

    it('should still clear credentials even if revoke fails', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 5,
        credentials: 'enc',
      });
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'oauth', accessToken: 'tk' }));
      mockFetch.mockRejectedValue(new Error('Network error'));
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      await service.disconnect('SAMSARA_ELD', 1);

      expect(mockPrisma.integrationConfig.update).toHaveBeenCalled();
    });

    it('should skip revoke for vendor without revokeUrl', async () => {
      // QUICKBOOKS has a revokeUrl so use a vendor that might not, or test legacy flow
      mockPrisma.integrationConfig.findFirst.mockResolvedValue({
        id: 5,
        credentials: 'enc',
      });
      mockCredentials.decrypt.mockReturnValue(JSON.stringify({ authMethod: 'api_token' }));
      mockPrisma.integrationConfig.update.mockResolvedValue({});

      await service.disconnect('SAMSARA_ELD', 1);

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // decryptCredentials
  // --------------------------------------------------------------------------

  describe('decryptCredentials', () => {
    it('should decrypt string credentials', () => {
      mockCredentials.decrypt.mockReturnValue('{"key":"val"}');
      const result = service.decryptCredentials('encrypted_str');
      expect(result).toEqual({ key: 'val' });
    });

    it('should decrypt object credentials field by field', () => {
      mockCredentials.decrypt.mockReturnValueOnce('decrypted_token').mockImplementationOnce(() => {
        throw new Error('not encrypted');
      });

      const result = service.decryptCredentials({
        apiToken: 'enc_tok',
        plainField: 'plain_val',
      });

      expect(result.apiToken).toBe('decrypted_token');
      expect(result.plainField).toBe('plain_val');
    });

    it('should pass through non-string values in object credentials', () => {
      const result = service.decryptCredentials({
        count: 42,
        nested: { a: 1 },
      });

      expect(result.count).toBe(42);
      expect(result.nested).toEqual({ a: 1 });
    });

    it('should throw for unrecognized format (array)', () => {
      expect(() => service.decryptCredentials([1, 2, 3])).toThrow(
        'Integration credentials are corrupted — please reconnect',
      );
    });
  });
});
