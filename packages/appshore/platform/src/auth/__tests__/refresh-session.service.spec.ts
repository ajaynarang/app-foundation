import { UnauthorizedException } from '@nestjs/common';
import * as errorTracking from '@appshore/kernel/infrastructure/error-tracking/sentry';
import { RefreshSessionService, type RefreshSession } from '../refresh-session.service';

const DAY_MS = 24 * 60 * 60 * 1000;

const tenantX = { id: 10, tenantId: 'ten_x', companyName: 'X', isActive: true, status: 'ACTIVE', timezone: 'UTC' };
const tenantY = { id: 20, tenantId: 'ten_y', companyName: 'Y', isActive: true, status: 'ACTIVE', timezone: 'UTC' };

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 'user_1',
    email: 'a@example.com',
    role: 'ADMIN',
    tenantId: tenantX.id,
    tenant: tenantX,
    isActive: true,
    ...overrides,
  };
}

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    tokenId: 'rt_2',
    userId: 1,
    token: 'stored-hash',
    familyId: 'rt_1',
    familyStartedAt: new Date(Date.now() - DAY_MS),
    tenantId: tenantX.id,
    tenant: tenantX,
    previousTokenId: 'rt_1',
    expiresAt: new Date(Date.now() + DAY_MS),
    isRevoked: false,
    revokedAt: null,
    rotatedAt: null,
    user: makeUser(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<RefreshSession> = {}): RefreshSession {
  return {
    dbId: 1,
    userId: 'user_1',
    email: 'a@example.com',
    role: 'ADMIN' as any,
    tokenId: 'rt_2',
    familyId: 'rt_1',
    familyStartedAt: new Date(Date.now() - DAY_MS),
    previousTokenId: 'rt_1',
    sessionTenantDbId: tenantX.id,
    tenantId: tenantX.tenantId,
    tenantDbId: tenantX.id,
    tenantName: tenantX.companyName,
    authMethod: 'email_password',
    isActive: true,
    ...overrides,
  };
}

describe('RefreshSessionService', () => {
  let prisma: any;
  let jwt: any;
  let loginEvents: any;
  let config: Record<string, unknown>;
  let service: RefreshSessionService;
  const meta = { ip: '203.0.113.9', userAgent: 'jest' };

  beforeEach(() => {
    prisma = {
      refreshToken: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}) },
      user: { findUnique: jest.fn() },
      workspaceMember: { findFirst: jest.fn() },
    };
    jwt = {
      matchesStoredHash: jest.fn().mockReturnValue(true),
      revokeFamily: jest.fn().mockResolvedValue(2),
      rotateRefreshToken: jest
        .fn()
        .mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', refreshTokenId: 'rt_3', familyId: 'rt_1' }),
      sessionMaxAgeMs: jest.fn().mockReturnValue(30 * DAY_MS),
      reuseGraceMs: jest.fn().mockReturnValue(10_000),
    };
    loginEvents = { recordFailure: jest.fn().mockResolvedValue(undefined) };
    config = { multiTenancy: { enabled: true, implicitTenantId: 1, mode: 'multi' } };
    const configService = { get: jest.fn((key: string) => config[key]) } as any;
    service = new RefreshSessionService(prisma, jwt, loginEvents, configService);
  });

  describe('validatePresentedToken', () => {
    const validate = () => service.validatePresentedToken('rt_2', 'raw-token', meta);

    it('refuses a token with no row', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);
      await expect(validate()).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a token whose hash does not match the stored hash, and revokes nothing', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRow());
      jwt.matchesStoredHash.mockReturnValue(false);

      await expect(validate()).rejects.toThrow(UnauthorizedException);
      expect(jwt.matchesStoredHash).toHaveBeenCalledWith('raw-token', 'stored-hash');
      expect(jwt.revokeFamily).not.toHaveBeenCalled();
    });

    it('a row revoked without rotation (logout, reset, an admin) gets a plain 401', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRow({ isRevoked: true, revokedAt: new Date(0) }));

      await expect(validate()).rejects.toThrow(UnauthorizedException);
      expect(jwt.revokeFamily).not.toHaveBeenCalled();
      expect(loginEvents.recordFailure).not.toHaveBeenCalled();
    });

    it('a retired token presented again revokes the whole family, records REFRESH_REUSE and warns', async () => {
      const retiredAt = new Date(Date.now() - 60_000);
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ isRevoked: true, revokedAt: retiredAt, rotatedAt: retiredAt, tenantId: tenantY.id }),
      );
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);

      await expect(validate()).rejects.toThrow(UnauthorizedException);
      expect(jwt.revokeFamily).toHaveBeenCalledWith('rt_1', 1);
      expect(loginEvents.recordFailure).toHaveBeenCalledWith({
        userId: 1,
        tenantId: tenantY.id,
        ip: meta.ip,
        userAgent: meta.userAgent,
        failReason: 'refresh_reuse',
      });
      expect(warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'auth.refresh_reuse', familyId: 'rt_1' }));
    });

    it('a retired token of a family with nothing left to revoke (a logout) is a plain 401: no event, no report', async () => {
      const retiredAt = new Date(Date.now() - 60_000);
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ isRevoked: true, revokedAt: retiredAt, rotatedAt: retiredAt }),
      );
      jwt.revokeFamily.mockResolvedValue(0);
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      const report = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);

      await expect(validate()).rejects.toThrow(UnauthorizedException);

      expect(loginEvents.recordFailure).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
      report.mockRestore();
    });

    it('reports a reuse to the error tracker at warning level, ids only', async () => {
      const retiredAt = new Date(Date.now() - 60_000);
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ isRevoked: true, revokedAt: retiredAt, rotatedAt: retiredAt, tenantId: tenantY.id }),
      );
      jest.spyOn((service as any).logger, 'warn').mockImplementation(() => undefined);
      const report = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);

      await expect(validate()).rejects.toThrow(UnauthorizedException);

      expect(report).toHaveBeenCalledTimes(1);
      const [err, tags, options] = report.mock.calls[0];
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).name).toBe('RefreshTokenReuseError');
      expect(tags).toEqual({ tenantDbId: tenantY.id, source: 'http' });
      expect(options).toEqual({ level: 'warning' });
      expect(JSON.stringify({ message: (err as Error).message, tags })).not.toContain('stored-hash');
      report.mockRestore();
    });

    it('does not report a token presented within the grace window', async () => {
      const retiredAt = new Date(Date.now() - 2_000);
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ isRevoked: true, revokedAt: retiredAt, rotatedAt: retiredAt }),
      );
      const report = jest.spyOn(errorTracking, 'reportError').mockImplementation(() => undefined);

      await expect(validate()).rejects.toThrow(UnauthorizedException);

      expect(report).not.toHaveBeenCalled();
      report.mockRestore();
    });

    it('a retired token presented within the grace window gets a plain 401 and the family survives', async () => {
      const retiredAt = new Date(Date.now() - 2_000);
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ isRevoked: true, revokedAt: retiredAt, rotatedAt: retiredAt }),
      );

      await expect(validate()).rejects.toThrow(UnauthorizedException);
      expect(jwt.revokeFamily).not.toHaveBeenCalled();
      expect(loginEvents.recordFailure).not.toHaveBeenCalled();
    });

    it('refuses an expired row', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRow({ expiresAt: new Date(Date.now() - 1) }));
      await expect(validate()).rejects.toThrow(UnauthorizedException);
    });

    it('refuses a family older than the session max age, even if the row has not expired', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(
        makeRow({ familyStartedAt: new Date(Date.now() - 31 * DAY_MS) }),
      );
      await expect(validate()).rejects.toThrow(UnauthorizedException);
    });

    it('refuses an inactive user', async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRow({ user: makeUser({ isActive: false }) }));
      await expect(validate()).rejects.toThrow(UnauthorizedException);
    });

    it("returns the session: its family, predecessor and the session's own workspace", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(makeRow({ tenantId: tenantY.id, tenant: tenantY }));

      const session = await validate();

      expect(session).toMatchObject({
        dbId: 1,
        userId: 'user_1',
        tokenId: 'rt_2',
        familyId: 'rt_1',
        previousTokenId: 'rt_1',
        sessionTenantDbId: tenantY.id,
        tenantId: tenantY.tenantId,
        tenantDbId: tenantY.id,
      });
    });
  });

  describe('refresh', () => {
    it('always rotates: hands the presented token, with its predecessor, to the atomic rotation', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.refresh(makeSession());

      expect(jwt.rotateRefreshToken).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, userId: 'user_1', tenantId: tenantX.tenantId, tenantDbId: tenantX.id }),
        { tokenId: 'rt_2', familyId: 'rt_1', familyStartedAt: expect.any(Date), previousTokenId: 'rt_1' },
        'email_password',
      );
      expect(result).toMatchObject({ accessToken: 'at', refreshToken: 'rt' });
    });

    it('a token revoked or retired since it was validated gets a plain 401, and nothing is recorded', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      jwt.rotateRefreshToken.mockResolvedValue(null);

      await expect(service.refresh(makeSession())).rejects.toThrow(UnauthorizedException);
      expect(loginEvents.recordFailure).not.toHaveBeenCalled();
      expect(jwt.revokeFamily).not.toHaveBeenCalled();
    });

    it("mints from the session's workspace and that membership's role, not the user's default", async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.workspaceMember.findFirst.mockResolvedValue({ role: 'MEMBER', tenant: tenantY });

      const result = await service.refresh(makeSession({ sessionTenantDbId: tenantY.id }));

      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
        where: { userId: 1, tenantId: tenantY.id },
        include: { tenant: true },
      });
      expect(jwt.rotateRefreshToken.mock.calls[0][0]).toMatchObject({
        role: 'MEMBER',
        tenantId: tenantY.tenantId,
        tenantDbId: tenantY.id,
      });
      expect(result.user).toMatchObject({ role: 'MEMBER', tenantId: tenantY.tenantId, tenantName: 'Y' });
    });

    it('fails when the membership of the session workspace was removed, and rotates nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(service.refresh(makeSession({ sessionTenantDbId: tenantY.id }))).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwt.rotateRefreshToken).not.toHaveBeenCalled();
    });

    it('fails when the session workspace is inactive', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.workspaceMember.findFirst.mockResolvedValue({ role: 'MEMBER', tenant: { ...tenantY, isActive: false } });

      await expect(service.refresh(makeSession({ sessionTenantDbId: tenantY.id }))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('fails for a user deactivated since the token was checked', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ isActive: false }));
      await expect(service.refresh(makeSession())).rejects.toThrow(UnauthorizedException);
    });

    it('a super-admin needs no membership', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser({ role: 'SUPER_ADMIN', tenantId: null, tenant: null }));

      await service.refresh(makeSession({ sessionTenantDbId: null }));

      expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
      expect(jwt.rotateRefreshToken.mock.calls[0][0]).toMatchObject({ role: 'SUPER_ADMIN', tenantDbId: null });
    });

    it('single-tenant mode does no membership lookup', async () => {
      config.multiTenancy = { enabled: false, implicitTenantId: 1, mode: 'single' };
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.refresh(makeSession({ sessionTenantDbId: tenantY.id }));

      expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
    });

    it("a row with no tenant falls back to the user's tenant and writes it onto the successor", async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.refresh(makeSession({ sessionTenantDbId: null }));

      expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
      expect(jwt.rotateRefreshToken.mock.calls[0][0]).toMatchObject({
        tenantId: tenantX.tenantId,
        tenantDbId: tenantX.id,
        role: 'ADMIN',
      });
    });
  });
});
