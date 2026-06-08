import { Test, TestingModule } from '@nestjs/testing';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtTokenService } from '../jwt.service';
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

  describe('generateAccessTokenOnly', () => {
    it('should generate a single access token without DB interaction', () => {
      const mockUser = {
        userId: 'USR-001',
        email: 'test@example.com',
        role: 'ADMIN',
        tenantId: 5,
      };

      mockJwtService.sign.mockReturnValue('new-access-token');
      mockConfigService.get.mockReturnValue('secret');

      const result = service.generateAccessTokenOnly(mockUser);

      expect(result).toBe('new-access-token');
      expect(mockPrisma.refreshToken.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeRefreshToken', () => {
    it('should mark a refresh token as revoked', async () => {
      mockPrisma.refreshToken.update.mockResolvedValue({});

      await service.revokeRefreshToken('rt_abc123');

      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith({
        where: { tokenId: 'rt_abc123' },
        data: {
          isRevoked: true,
          revokedAt: expect.any(Date),
        },
      });
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
