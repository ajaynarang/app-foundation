import { UnauthorizedException } from '@nestjs/common';
import { RefreshJwtStrategy } from '../refresh-jwt.strategy';

describe('RefreshJwtStrategy', () => {
  let strategy: RefreshJwtStrategy;
  let refreshSessions: { validatePresentedToken: jest.Mock };

  beforeEach(() => {
    refreshSessions = { validatePresentedToken: jest.fn() };
    const configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as any;
    strategy = new RefreshJwtStrategy(configService, refreshSessions as any);
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
    expect(refreshSessions.validatePresentedToken).not.toHaveBeenCalled();
  });

  it('hands the token id, the presented token itself and the request meta to the session checks', async () => {
    const session = { userId: 'u-1', tokenId: 'token-1', familyId: 'token-0' };
    refreshSessions.validatePresentedToken.mockResolvedValue(session);
    const req = { cookies: { refreshToken: 'raw-token' }, ip: '203.0.113.9', headers: { 'user-agent': 'jest' } } as any;

    await expect(strategy.validate(req, payload)).resolves.toBe(session);
    expect(refreshSessions.validatePresentedToken).toHaveBeenCalledWith('token-1', 'raw-token', {
      ip: '203.0.113.9',
      userAgent: 'jest',
    });
  });

  it('propagates a refusal from the session checks', async () => {
    refreshSessions.validatePresentedToken.mockRejectedValue(new UnauthorizedException('Invalid or revoked'));
    const req = { cookies: { refreshToken: 'raw-token' }, headers: {} } as any;
    await expect(strategy.validate(req, payload)).rejects.toThrow(UnauthorizedException);
  });
});
