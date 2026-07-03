import { Test, TestingModule } from '@nestjs/testing';
import { DevService } from './dev.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AuthService } from '@appshore/platform/auth/auth.service';
import { LoginEventService } from '@appshore/platform/auth/login-event.service';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
  },
};

const mockAuthService = {
  generateTokensForUser: jest.fn(),
};

const mockLoginEventService = {
  recordSuccess: jest.fn(),
};

describe('DevService', () => {
  let service: DevService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
        { provide: LoginEventService, useValue: mockLoginEventService },
      ],
    }).compile();

    service = module.get<DevService>(DevService);
  });

  describe('switchToUser', () => {
    it('records a SUCCESS LoginEvent with the propagated ip and prefixed userAgent', async () => {
      const user = {
        id: 42,
        userId: 'u_abc',
        tenantId: 7,
        tenant: { id: 7, tenantId: 't_demo' },
        driver: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockAuthService.generateTokensForUser.mockResolvedValue({
        accessToken: 'header.payload.signaturetail',
        refreshToken: 'rt_xyz',
        user: { userId: 'u_abc' },
      });
      mockLoginEventService.recordSuccess.mockResolvedValue(undefined);

      await service.switchToUser('u_abc', {
        ip: '203.0.113.7',
        userAgent: 'Mozilla/5.0 (Macintosh) Chrome/124.0',
      });

      // recordSuccess is fire-and-forget — give the microtask queue a tick.
      await new Promise((r) => setImmediate(r));

      expect(mockLoginEventService.recordSuccess).toHaveBeenCalledWith({
        userId: 42,
        tenantId: 7,
        ip: '203.0.113.7',
        userAgent: '[dev] Mozilla/5.0 (Macintosh) Chrome/124.0',
        sessionId: expect.any(String),
      });
    });

    it('records null ip and falls back to the dev-utility UA when meta is not provided', async () => {
      const user = {
        id: 42,
        userId: 'u_abc',
        tenantId: 7,
        tenant: { id: 7, tenantId: 't_demo' },
        driver: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockAuthService.generateTokensForUser.mockResolvedValue({
        accessToken: 'header.payload.signaturetail',
        refreshToken: 'rt_xyz',
        user: { userId: 'u_abc' },
      });
      mockLoginEventService.recordSuccess.mockResolvedValue(undefined);

      await service.switchToUser('u_abc');

      await new Promise((r) => setImmediate(r));

      expect(mockLoginEventService.recordSuccess).toHaveBeenCalledWith({
        userId: 42,
        tenantId: 7,
        ip: null,
        userAgent: 'dev-utility',
        sessionId: expect.any(String),
      });
    });

    it('prefixes the propagated userAgent with "[dev] " so ua-parser still parses it', async () => {
      const user = {
        id: 42,
        userId: 'u_abc',
        tenantId: 7,
        tenant: { id: 7, tenantId: 't_demo' },
        driver: null,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockAuthService.generateTokensForUser.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'rt',
        user: {},
      });
      mockLoginEventService.recordSuccess.mockResolvedValue(undefined);

      await service.switchToUser('u_abc', { ip: null, userAgent: 'curl/8.4.0' });

      await new Promise((r) => setImmediate(r));

      expect(mockLoginEventService.recordSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: '[dev] curl/8.4.0' }),
      );
    });

    it('does not throw if recording the login event fails', async () => {
      const user = { id: 42, userId: 'u_abc', tenantId: 7, tenant: null, driver: null };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockAuthService.generateTokensForUser.mockResolvedValue({
        accessToken: 'token',
        refreshToken: 'rt',
        user: {},
      });
      mockLoginEventService.recordSuccess.mockRejectedValue(new Error('db down'));

      await expect(service.switchToUser('u_abc')).resolves.toBeDefined();
    });
  });
});
