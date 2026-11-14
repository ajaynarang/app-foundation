import { Test, TestingModule } from '@nestjs/testing';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService, SESSION_LOCK_NAMESPACE, parseDurationMs } from '../jwt.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const mockPrisma: any = {
  refreshToken: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
  },
  $executeRaw: jest.fn().mockResolvedValue(1),
  // An interactive transaction runs its callback with the mock itself as `tx`.
  $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(mockPrisma)),
};

/** The SQL text of the n-th `$executeRaw` call and its bound values. */
const rawSql = (n = 0) => {
  const [strings, ...values] = mockPrisma.$executeRaw.mock.calls[n] as [TemplateStringsArray, ...unknown[]];
  return { sql: strings.join('?'), values };
};

const mockJwtService = {
  sign: jest.fn(),
};

const mockConfigService = {
  get: jest.fn(),
};

describe('JwtTokenService', () => {
  let service: JwtTokenService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtTokenService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NestJwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<JwtTokenService>(JwtTokenService);
  });

  describe('generateTokenPair', () => {
    const mockUser = {
      id: 1,
      userId: 'USR-001',
      email: 'test@example.com',
      role: 'MEMBER',
      tenantId: 'ten_10',
    };

    it('should generate an access token and refresh token', async () => {
      mockJwtService.sign.mockReturnValueOnce('access-token-value').mockReturnValueOnce('refresh-token-value');
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('test-secret');

      const result = await service.generateTokenPair(mockUser);

      expect(result.accessToken).toBe('access-token-value');
      expect(result.refreshToken).toBe('refresh-token-value');
      expect(result.refreshTokenId).toMatch(/^rt_/);
    });

    it('should include correct payload in access token', async () => {
      mockJwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('secret');

      await service.generateTokenPair(mockUser, 'email_password');

      const accessPayload = mockJwtService.sign.mock.calls[0][0];
      expect(accessPayload.sub).toBe('USR-001');
      expect(accessPayload.email).toBe('test@example.com');
      expect(accessPayload.role).toBe('MEMBER');
      expect(accessPayload.tenantId).toBe('ten_10');
      expect(accessPayload.authMethod).toBe('email_password');
    });

    it('should omit email from payload if user has no email', async () => {
      const phoneOnlyUser = { ...mockUser, email: undefined };
      mockJwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('secret');

      await service.generateTokenPair(phoneOnlyUser);

      const accessPayload = mockJwtService.sign.mock.calls[0][0];
      expect(accessPayload).not.toHaveProperty('email');
    });

    it('should store refresh token hash in the database', async () => {
      mockJwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('secret');

      await service.generateTokenPair(mockUser);

      expect(mockPrisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          token: expect.any(String),
          expiresAt: expect.any(Date),
          tokenId: expect.stringMatching(/^rt_/),
        }),
      });
    });

    it('should omit authMethod from payload when not provided', async () => {
      mockJwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});
      mockConfigService.get.mockReturnValue('secret');

      await service.generateTokenPair(mockUser);

      const accessPayload = mockJwtService.sign.mock.calls[0][0];
      expect(accessPayload).not.toHaveProperty('authMethod');
    });
  });

  describe('sessions (refresh-token families)', () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const user = { id: 1, userId: 'USR-001', email: 'a@example.com', role: 'MEMBER', tenantId: 'ten_1', tenantDbId: 7 };
    const config = (values: Record<string, unknown>) =>
      mockConfigService.get.mockImplementation((key: string) => (key in values ? values[key] : 'secret'));

    beforeEach(() => {
      mockJwtService.sign.mockReturnValueOnce('access-token').mockReturnValueOnce('refresh-token');
      mockPrisma.refreshToken.create.mockResolvedValue({});
    });

    it('a new token pair starts a family: its id is the session id and the access token sid', async () => {
      config({});
      const pair = await service.generateTokenPair(user, 'email_password');

      const row = mockPrisma.refreshToken.create.mock.calls[0][0].data;
      expect(row.familyId).toBe(pair.refreshTokenId);
      expect(row.familyStartedAt).toBeInstanceOf(Date);
      expect(row.previousTokenId).toBeNull();
      expect(row.tenantId).toBe(7);
      expect(pair.familyId).toBe(pair.refreshTokenId);
      expect(mockJwtService.sign.mock.calls[0][0].sid).toBe(pair.refreshTokenId);
      // The refresh token carries how the session was established, so a successor keeps it.
      expect(mockJwtService.sign.mock.calls[1][0]).toMatchObject({
        tokenId: pair.refreshTokenId,
        authMethod: 'email_password',
      });
      expect(mockJwtService.sign.mock.calls[1][0]).not.toHaveProperty('prev');
    });

    it('a session with no tenant stores a null tenant', async () => {
      config({});
      await service.generateTokenPair({ ...user, tenantId: undefined, tenantDbId: undefined });
      expect(mockPrisma.refreshToken.create.mock.calls[0][0].data.tenantId).toBeNull();
    });

    it('row expiry comes from jwt.refreshExpiry, not a fixed seven days', async () => {
      config({ 'jwt.refreshExpiry': '2d' });
      const before = Date.now();
      await service.generateTokenPair(user);

      const { expiresAt } = mockPrisma.refreshToken.create.mock.calls[0][0].data;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 2 * DAY_MS);
      expect(expiresAt.getTime()).toBeLessThan(before + 2 * DAY_MS + 5_000);
      expect((mockJwtService.sign.mock.calls[1][1] as any).expiresIn).toBeLessThanOrEqual(2 * 24 * 60 * 60);
    });

    it('a successor stays in the family, names its predecessor, and never outlives the session max age', async () => {
      config({ 'jwt.refreshExpiry': '7d', 'jwt.sessionMaxAge': '30d' });
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.refreshToken.findUniqueOrThrow.mockResolvedValue({ id: 40 });
      const familyStartedAt = new Date(Date.now() - 29 * DAY_MS);
      const pair = await service.rotateRefreshToken(
        user,
        { tokenId: 'rt_old', familyId: 'rt_first', familyStartedAt, previousTokenId: null },
        'phone_otp',
      );

      const row = mockPrisma.refreshToken.create.mock.calls[0][0].data;
      expect(row).toMatchObject({ familyId: 'rt_first', familyStartedAt, previousTokenId: 'rt_old', tenantId: 7 });
      expect(row.tokenId).not.toBe('rt_old');
      // 30-day family started 29 days ago: one day left, not seven.
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(familyStartedAt.getTime() + 30 * DAY_MS);
      expect(pair?.familyId).toBe('rt_first');
      expect(mockJwtService.sign.mock.calls[0][0]).toMatchObject({ sid: 'rt_first', authMethod: 'phone_otp' });
      expect(mockJwtService.sign.mock.calls[1][0]).toMatchObject({ prev: 'rt_old', authMethod: 'phone_otp' });
    });

    describe('rotateRefreshToken: one locked transaction', () => {
      const presented = {
        tokenId: 'rt_cur',
        familyId: 'rt_first',
        familyStartedAt: new Date(),
        previousTokenId: 'rt_old',
      };

      beforeEach(() => {
        config({});
        mockPrisma.refreshToken.findUniqueOrThrow.mockResolvedValue({ id: 40 });
      });

      it("takes the user's session lock first, inside the transaction", async () => {
        mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

        await service.rotateRefreshToken(user, presented);

        expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
        const { sql, values } = rawSql();
        expect(sql).toContain('pg_advisory_xact_lock(');
        expect(values).toEqual([SESSION_LOCK_NAMESPACE, user.id]);
        expect(mockPrisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
          mockPrisma.refreshToken.updateMany.mock.invocationCallOrder[0],
        );
      });

      it('issues nothing when the presented token is no longer live', async () => {
        mockPrisma.refreshToken.updateMany.mockResolvedValueOnce({ count: 0 });

        await expect(service.rotateRefreshToken(user, presented)).resolves.toBeNull();

        expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
        expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
          where: { tokenId: 'rt_cur', familyId: 'rt_first', userId: user.id, isRevoked: false },
          data: { lastUsedAt: expect.any(Date) },
        });
        expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
      });

      it('retires every older live row of the family and any sibling, never the presented token', async () => {
        mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });

        await service.rotateRefreshToken(user, presented);

        expect(mockPrisma.refreshToken.updateMany).toHaveBeenNthCalledWith(2, {
          where: {
            familyId: 'rt_first',
            isRevoked: false,
            tokenId: { not: 'rt_cur' },
            OR: [{ id: { lt: 40 } }, { previousTokenId: 'rt_old' }],
          },
          data: { isRevoked: true, revokedAt: expect.any(Date), rotatedAt: expect.any(Date) },
        });
        const { data } = mockPrisma.refreshToken.updateMany.mock.calls[1][0];
        expect(data.revokedAt).toBe(data.rotatedAt);
      });
    });

    it('a workspace switch issues the successor of the newest live row, under the session lock', async () => {
      config({});
      const familyStartedAt = new Date();
      mockPrisma.refreshToken.findFirst.mockResolvedValue({
        tokenId: 'rt_newest',
        familyId: 'rt_first',
        familyStartedAt,
      });

      await service.issueSwitchSuccessor(user, 'rt_first');

      expect(rawSql().values).toEqual([SESSION_LOCK_NAMESPACE, user.id]);
      expect(mockPrisma.refreshToken.findFirst).toHaveBeenCalledWith({
        where: { familyId: 'rt_first', userId: user.id, isRevoked: false },
        orderBy: [{ id: 'desc' }],
      });
      expect(mockPrisma.refreshToken.create.mock.calls[0][0].data).toMatchObject({
        familyId: 'rt_first',
        previousTokenId: 'rt_newest',
      });
      // Nothing is retired at the switch: its response can be lost.
      expect(mockPrisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });

    it('a workspace switch starts a new session when the family has no live token', async () => {
      config({});
      mockPrisma.refreshToken.findFirst.mockResolvedValue(null);

      const pair = await service.issueSwitchSuccessor(user, 'rt_gone');

      const row = mockPrisma.refreshToken.create.mock.calls[0][0].data;
      expect(row.previousTokenId).toBeNull();
      expect(row.familyId).toBe(row.tokenId);
      expect(pair.familyId).toBe(row.tokenId);
    });

    it('revoking a family revokes every live token in it under the session lock, and says how many', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await expect(service.revokeFamily('rt_first', user.id)).resolves.toBe(3);

      expect(rawSql().values).toEqual([SESSION_LOCK_NAMESPACE, user.id]);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'rt_first', userId: user.id, isRevoked: false },
        data: { isRevoked: true, revokedAt: expect.any(Date) },
      });
    });

    it('compares a presented token with the stored hash', async () => {
      config({});
      await service.generateTokenPair(user);
      const storedHash = mockPrisma.refreshToken.create.mock.calls[0][0].data.token;

      expect(service.matchesStoredHash('refresh-token', storedHash)).toBe(true);
      expect(service.matchesStoredHash('another-token', storedHash)).toBe(false);
      expect(service.matchesStoredHash('refresh-token', 'not-a-hash')).toBe(false);
    });

    it('reads the session max age and reuse grace from config, with defaults', () => {
      config({});
      expect(service.sessionMaxAgeMs()).toBe(30 * DAY_MS);
      expect(service.reuseGraceMs()).toBe(10_000);
      config({ 'jwt.sessionMaxAge': '12h', 'jwt.refreshReuseGraceSeconds': 0 });
      expect(service.sessionMaxAgeMs()).toBe(12 * 60 * 60 * 1000);
      expect(service.reuseGraceMs()).toBe(0);
    });
  });

  describe('parseDurationMs', () => {
    it('parses the s/m/h/d strings the JWT config uses', () => {
      expect(parseDurationMs('15m')).toBe(15 * 60 * 1000);
      expect(parseDurationMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
      expect(parseDurationMs('nonsense')).toBeNull();
      expect(parseDurationMs(undefined)).toBeNull();
    });
  });

  describe('revokeAllUserTokens', () => {
    it('should revoke all non-revoked tokens for a user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.revokeAllUserTokens(42);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 42, isRevoked: false },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
        },
      });
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should delete expired and old revoked tokens', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 5 });

      await service.cleanupExpiredTokens();

      expect(mockPrisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            {
              isRevoked: true,
              revokedAt: { lt: expect.any(Date) },
            },
          ],
        },
      });
    });
  });
});
