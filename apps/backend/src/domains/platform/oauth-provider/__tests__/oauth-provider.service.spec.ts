import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { OAuthProviderService } from '../oauth-provider.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

jest.mock('nanoid', () => ({ nanoid: jest.fn(() => 'mock-nanoid-value') }));
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

const mockPrisma = {
  oAuthClient: { findUnique: jest.fn() },
  oAuthAuthorizationCode: {
    create: jest.fn(),
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  },
  oAuthAccessToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  oAuthRefreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((args: any) => {
    if (Array.isArray(args)) return Promise.all(args);
    return args(mockPrisma);
  }),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-jwt-token'),
  verify: jest.fn(),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('test-secret'),
};

describe('OAuthProviderService', () => {
  let service: OAuthProviderService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OAuthProviderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();
    service = module.get<OAuthProviderService>(OAuthProviderService);
  });

  describe('authorize', () => {
    const params = {
      clientId: 'client-1',
      redirectUri: 'https://app.com/callback',
      scope: 'fleet:read fleet:write',
      state: 'state-abc',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    };

    it('should throw for invalid client', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);
      await expect(service.authorize(params as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw for inactive client', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({ isActive: false });
      await expect(service.authorize(params as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid redirect URI', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        isActive: true,
        redirectUris: ['https://other.com/callback'],
        scopes: ['fleet:read', 'fleet:write'],
      });
      await expect(service.authorize(params as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw for invalid scopes', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        isActive: true,
        redirectUris: ['https://app.com/callback'],
        scopes: ['fleet:read'], // missing fleet:write
      });
      await expect(service.authorize(params as any)).rejects.toThrow(BadRequestException);
    });

    it('should return a consent challenge JWT for valid request', async () => {
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        clientId: 'client-1',
        name: 'Test App',
        description: 'desc',
        isActive: true,
        redirectUris: ['https://app.com/callback'],
        scopes: ['fleet:read', 'fleet:write'],
      });

      const result = await service.authorize(params as any);
      expect(result).toBe('mock-jwt-token');
      expect(mockJwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          clientId: 'client-1',
          requestedScopes: ['fleet:read', 'fleet:write'],
        }),
        expect.objectContaining({ expiresIn: '10m' }),
      );
    });
  });

  describe('approveConsent', () => {
    it('should throw for invalid challenge token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      await expect(service.approveConsent('bad-token', 1, 7)).rejects.toThrow(BadRequestException);
    });

    it('should generate authorization code and return redirect URL', async () => {
      mockJwtService.verify.mockReturnValue({
        clientId: 'client-1',
        requestedScopes: ['fleet:read'],
        redirectUri: 'https://app.com/callback',
        state: 'state-abc',
        codeChallenge: 'challenge',
        codeChallengeMethod: 'S256',
      });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        id: 1,
        clientId: 'client-1',
        isActive: true,
      });
      mockPrisma.oAuthAuthorizationCode.create.mockResolvedValue({});

      const result = await service.approveConsent('valid-token', 42, 7);

      expect(result.redirectUrl).toContain('https://app.com/callback');
      expect(result.redirectUrl).toContain('code=');
      expect(result.redirectUrl).toContain('state=state-abc');
    });
  });

  describe('revokeToken', () => {
    it('should revoke access token if found', async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({ id: 'at-1' });
      mockPrisma.oAuthAccessToken.update.mockResolvedValue({});

      await service.revokeToken('some-token');

      expect(mockPrisma.oAuthAccessToken.update).toHaveBeenCalledWith({
        where: expect.any(Object),
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should revoke refresh token if access not found', async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({ id: 'rt-1' });
      mockPrisma.oAuthRefreshToken.update.mockResolvedValue({});

      await service.revokeToken('some-token');

      expect(mockPrisma.oAuthRefreshToken.update).toHaveBeenCalled();
    });

    it('should succeed silently if token not found (RFC 7009)', async () => {
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(null);

      await expect(service.revokeToken('unknown-token')).resolves.toBeUndefined();
    });
  });

  describe('validateAccessToken', () => {
    it('should return null for invalid JWT', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });

      const result = await service.validateAccessToken('bad-token');
      expect(result).toBeNull();
    });

    it('should return null if token missing OAuth claims', async () => {
      mockJwtService.verify.mockReturnValue({ sub: '1' }); // no clientId/scopes

      const result = await service.validateAccessToken('token');
      expect(result).toBeNull();
    });

    it('should return null if token not found in DB', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        clientId: 'c-1',
        scopes: ['fleet:read'],
      });
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue(null);

      const result = await service.validateAccessToken('token');
      expect(result).toBeNull();
    });

    it('should return null if token is revoked', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: '1',
        clientId: 'c-1',
        scopes: ['fleet:read'],
      });
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
        revokedAt: new Date(),
      });

      const result = await service.validateAccessToken('token');
      expect(result).toBeNull();
    });

    it('should return payload for valid token', async () => {
      const payload = {
        sub: '1',
        tenantId: 10,
        role: 'ADMIN',
        clientId: 'c-1',
        scopes: ['fleet:read'],
        jti: 'abc',
      };
      mockJwtService.verify.mockReturnValue(payload);
      mockPrisma.oAuthAccessToken.findUnique.mockResolvedValue({
        revokedAt: null,
      });

      const result = await service.validateAccessToken('token');
      expect(result).toEqual(payload);
    });
  });

  describe('refreshToken', () => {
    it('should throw for unknown refresh token', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshToken('bad-token', 'c-1', undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('should detect replay and revoke all tokens', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: new Date(), // already rotated
        userId: 1,
        clientId: 1,
      });
      mockPrisma.oAuthAccessToken.updateMany.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.updateMany.mockResolvedValue({});

      await expect(service.refreshToken('reused-token', 'c-1', undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for revoked refresh token', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: new Date(),
      });

      await expect(service.refreshToken('revoked-token', 'c-1', undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for expired refresh token', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 10000),
        client: { clientId: 'c-1' },
      });

      await expect(service.refreshToken('expired-token', 'c-1', undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for client mismatch', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        originalIssuedAt: new Date(),
        client: { clientId: 'c-other', clientType: 'public' },
        user: { id: 1, tenantId: 1, role: 'ADMIN' },
        scopes: ['fleet:read'],
        userId: 1,
        clientId: 1,
      });

      await expect(service.refreshToken('token', 'c-wrong', undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('should issue new tokens and mark old as rotated for valid refresh', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        originalIssuedAt: new Date(),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'public',
          clientSecret: null,
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        scopes: ['fleet:read'],
        userId: 1,
        clientId: 1,
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.update.mockResolvedValue({});

      const result = await service.refreshToken('valid-token', 'c-1', undefined);

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.scope).toBe('fleet:read');
      expect(mockPrisma.oAuthRefreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rotatedAt: expect.any(Date),
            replacedByHash: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('exchangeCode', () => {
    it('should throw when code claim fails (already used or not found)', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(null);

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should detect replay and revoke all tokens', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 0,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        usedAt: new Date(),
        userId: 1,
        clientId: 1,
      });
      mockPrisma.oAuthAccessToken.updateMany.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.updateMany.mockResolvedValue({});

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for expired authorization code', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() - 10000),
        client: { clientId: 'c-1', clientType: 'public' },
        user: { id: 1 },
        redirectUri: 'https://app.com/cb',
        codeChallenge: 'challenge',
      });

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for client_id mismatch', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: { clientId: 'c-other', clientType: 'public' },
        user: { id: 1 },
        redirectUri: 'https://app.com/cb',
        codeChallenge: 'challenge',
      });

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw for redirect_uri mismatch', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: { clientId: 'c-1', clientType: 'public' },
        user: { id: 1 },
        redirectUri: 'https://other.com/cb',
        codeChallenge: 'challenge',
      });

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('approveConsent — inactive client', () => {
    it('should throw when client is no longer active', async () => {
      mockJwtService.verify.mockReturnValue({
        clientId: 'c-1',
        requestedScopes: ['fleet:read'],
        redirectUri: 'https://app.com/cb',
        state: 'state',
      });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue({
        isActive: false,
      });

      await expect(service.approveConsent('token', 1, 7)).rejects.toThrow(BadRequestException);
    });

    it('should throw when client is null', async () => {
      mockJwtService.verify.mockReturnValue({
        clientId: 'c-1',
        requestedScopes: ['fleet:read'],
        redirectUri: 'https://app.com/cb',
        state: 'state',
      });
      mockPrisma.oAuthClient.findUnique.mockResolvedValue(null);

      await expect(service.approveConsent('token', 1, 7)).rejects.toThrow(BadRequestException);
    });
  });

  describe('exchangeCode — PKCE verification failure', () => {
    it('should throw when code verifier does not match challenge', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: { clientId: 'c-1', clientType: 'public' },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        redirectUri: 'https://app.com/cb',
        codeChallenge: 'wrong-challenge-hash',
        scopes: ['fleet:read'],
      });

      await expect(service.exchangeCode('code', 'my-verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('exchangeCode — confidential client', () => {
    it('should require client_secret for confidential clients', async () => {
      const verifier = 'test-code-verifier-value';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'confidential',
          clientSecret: 'hashed-secret',
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        redirectUri: 'https://app.com/cb',
        codeChallenge: challenge,
        scopes: ['fleet:read'],
      });

      await expect(service.exchangeCode('code', verifier, 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        'client_secret required',
      );
    });

    it('should throw for invalid client_secret on confidential client', async () => {
      const verifier = 'test-code-verifier-value';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'confidential',
          clientSecret: 'hashed-secret',
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        redirectUri: 'https://app.com/cb',
        codeChallenge: challenge,
        scopes: ['fleet:read'],
      });

      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.exchangeCode('code', verifier, 'c-1', 'wrong-secret', 'https://app.com/cb')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('exchangeCode — successful token issuance (public client)', () => {
    it('should issue tokens for valid code exchange with correct PKCE', async () => {
      const verifier = 'test-code-verifier-value';
      const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');

      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue({
        code: 'code',
        expiresAt: new Date(Date.now() + 60000),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'public',
          clientSecret: null,
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        redirectUri: 'https://app.com/cb',
        codeChallenge: challenge,
        scopes: ['fleet:read'],
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});

      const result = await service.exchangeCode('code', verifier, 'c-1', undefined, 'https://app.com/cb');

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
      expect(result.scope).toBe('fleet:read');
    });
  });

  describe('exchangeCode — code not found after claim', () => {
    it('should throw when authCode is null after successful claim', async () => {
      mockPrisma.oAuthAuthorizationCode.updateMany.mockResolvedValue({
        count: 1,
      });
      mockPrisma.oAuthAuthorizationCode.findUnique.mockResolvedValue(null);

      await expect(service.exchangeCode('code', 'verifier', 'c-1', undefined, 'https://app.com/cb')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('OAuthProviderService — refresh token absolute cap (Phase B)', () => {
    it('rejects refresh when the chain is older than REFRESH_TOKEN_ABSOLUTE_TTL (90 days)', async () => {
      const ninetyOneDaysAgo = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 1000),
        originalIssuedAt: ninetyOneDaysAgo,
        client: { clientId: 'c', clientType: 'public', clientSecret: 'hash' },
        user: { id: 1, tenantId: 1, role: 'DISPATCHER' },
        userId: 1,
        clientId: 1,
        scopes: ['fleet:read'],
      });

      await expect(service.refreshToken('token', 'c', undefined)).rejects.toThrow(/chain expired/i);
    });

    it('accepts refresh when the chain is within 90 days', async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        originalIssuedAt: thirtyDaysAgo,
        client: {
          id: 1,
          clientId: 'c',
          clientType: 'public',
          clientSecret: null,
        },
        user: { id: 1, tenantId: 1, role: 'DISPATCHER', tenant: { id: 1 } },
        scopes: ['fleet:read'],
        userId: 1,
        clientId: 1,
      });
      mockPrisma.oAuthAccessToken.create.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.create.mockResolvedValue({});
      mockPrisma.oAuthRefreshToken.update.mockResolvedValue({});

      const result = await service.refreshToken('token', 'c', undefined);

      expect(result.access_token).toBeDefined();
      expect(result.refresh_token).toBeDefined();
      expect(result.token_type).toBe('Bearer');
    });
  });

  describe('refreshToken — confidential client', () => {
    it('should require client_secret for confidential clients', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        originalIssuedAt: new Date(),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'confidential',
          clientSecret: 'hashed-secret',
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        scopes: ['fleet:read'],
        userId: 1,
        clientId: 1,
      });

      await expect(service.refreshToken('valid-token', 'c-1', undefined)).rejects.toThrow('client_secret required');
    });

    it('should throw for invalid client_secret', async () => {
      mockPrisma.oAuthRefreshToken.findUnique.mockResolvedValue({
        rotatedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        originalIssuedAt: new Date(),
        client: {
          id: 1,
          clientId: 'c-1',
          clientType: 'confidential',
          clientSecret: 'hashed-secret',
        },
        user: { id: 1, tenantId: 1, role: 'ADMIN', tenant: { id: 1 } },
        scopes: ['fleet:read'],
        userId: 1,
        clientId: 1,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.refreshToken('valid-token', 'c-1', 'wrong-secret')).rejects.toThrow('Invalid client_secret');
    });
  });
});
