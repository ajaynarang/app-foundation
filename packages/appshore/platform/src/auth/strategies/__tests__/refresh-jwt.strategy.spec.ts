import { UnauthorizedException } from '@nestjs/common';
import { RefreshJwtStrategy } from '../refresh-jwt.strategy';

describe('RefreshJwtStrategy', () => {
  let strategy: RefreshJwtStrategy;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      refreshToken: { findUnique: jest.fn() },
    };
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as any;
    strategy = new RefreshJwtStrategy(configService, prisma);
  });

  const payload = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    tokenId: 'token-1',
    iat: 0,
    exp: 0,
  };

  it('should throw when no refresh token in cookies', async () => {
    const req = { cookies: {} } as any;
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when token not found in DB', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue(null);
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when token is revoked', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue({
      isRevoked: true,
      user: { isActive: true, tenant: { isActive: true } },
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when token is expired', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() - 86400000),
      user: { isActive: true, tenant: { isActive: true } },
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when user is inactive', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      user: { isActive: false, tenant: { isActive: true } },
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw when tenant is inactive', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      user: {
        isActive: true,
        userId: 'u-1',
        email: 'test@test.com',
        role: 'MEMBER',
        tenant: { isActive: false, tenantId: 't-1', companyName: 'Test' },
      },
    });
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });

  it('should return user data on valid token', async () => {
    const req = { cookies: { refreshToken: 'some-token' } } as any;
    prisma.refreshToken.findUnique.mockResolvedValue({
      isRevoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      user: {
        isActive: true,
        userId: 'u-1',
        email: 'test@test.com',
        role: 'MEMBER',
        tenant: { isActive: true, tenantId: 't-1', companyName: 'Test' },
      },
    });
    const result = await strategy.validate(req, payload);
    expect(result.userId).toBe('u-1');
    expect(result.tenantId).toBe('t-1');
    expect(result.tokenId).toBe('token-1');
  });
});
