import { Test, TestingModule } from '@nestjs/testing';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService, parseDurationMs } from '../jwt.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const mockPrisma = {
  refreshToken: {
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
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
      tenantId: 10,
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
      expect(accessPayload.tenantId).toBe(10);
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
      const familyStartedAt = new Date(Date.now() - 29 * DAY_MS);
      const pair = await service.rotateRefreshToken(
        user,
        { tokenId: 'rt_old', familyId: 'rt_first', familyStartedAt },
        'phone_otp',
      );

      const row = mockPrisma.refreshToken.create.mock.calls[0][0].data;
      expect(row).toMatchObject({ familyId: 'rt_first', familyStartedAt, previousTokenId: 'rt_old', tenantId: 7 });
      expect(row.tokenId).not.toBe('rt_old');
      // 30-day family started 29 days ago: one day left, not seven.
      expect(row.expiresAt.getTime()).toBeLessThanOrEqual(familyStartedAt.getTime() + 30 * DAY_MS);
      expect(pair.familyId).toBe('rt_first');
      expect(mockJwtService.sign.mock.calls[0][0]).toMatchObject({ sid: 'rt_first', authMethod: 'phone_otp' });
      expect(mockJwtService.sign.mock.calls[1][0]).toMatchObject({ prev: 'rt_old', authMethod: 'phone_otp' });
    });

    it('retiring a predecessor is one conditional update that also retires its unretired siblings', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await service.retirePredecessor({ tokenId: 'rt_new', familyId: 'rt_first', previousTokenId: 'rt_old' });

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: {
          familyId: 'rt_first',
          isRevoked: false,
          OR: [{ tokenId: 'rt_old' }, { previousTokenId: 'rt_old', tokenId: { not: 'rt_new' } }],
        },
        data: { isRevoked: true, revokedAt: expect.any(Date), rotatedAt: expect.any(Date) },
      });
      const { data } = mockPrisma.refreshToken.updateMany.mock.calls[0][0];
      expect(data.revokedAt).toBe(data.rotatedAt);
    });

    it('revoking a family revokes every live token in it, without marking any as rotated', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await service.revokeFamily('rt_first');

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'rt_first', isRevoked: false },
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
