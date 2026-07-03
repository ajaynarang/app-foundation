import { Test, TestingModule } from '@nestjs/testing';
import { LoginFailReason } from '@appshore/db';
import { LoginEventService } from '../login-event.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const mockPrisma = {
  loginEvent: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

describe('LoginEventService', () => {
  let service: LoginEventService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LoginEventService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<LoginEventService>(LoginEventService);
  });

  describe('recordSuccess', () => {
    it('creates a login_event with status success and deviceId', async () => {
      mockPrisma.loginEvent.create.mockResolvedValue({});

      await service.recordSuccess({
        userId: 1,
        tenantId: 2,
        ip: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        sessionId: 'rt_abc123',
      });

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          tenantId: 2,
          status: 'SUCCESS',
          ip: '127.0.0.1',
          userAgent: 'Mozilla/5.0',
          sessionId: 'rt_abc123',
          deviceId: expect.any(String),
        }),
      });

      const call = mockPrisma.loginEvent.create.mock.calls[0][0];
      expect(call.data.deviceId).toHaveLength(64);
    });
  });

  describe('recordFailure', () => {
    it('creates a login_event with status failed and failReason enum', async () => {
      mockPrisma.loginEvent.create.mockResolvedValue({});

      await service.recordFailure({
        userId: 1,
        tenantId: null,
        ip: '10.0.0.1',
        userAgent: 'curl/7.0',
        failReason: 'account_disabled',
      });

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 1,
          tenantId: null,
          status: 'FAILED',
          failReason: LoginFailReason.ACCOUNT_DISABLED,
        }),
      });
    });

    it.each([
      ['account_disabled' as const, LoginFailReason.ACCOUNT_DISABLED],
      ['tenant_inactive' as const, LoginFailReason.TENANT_INACTIVE],
      ['invalid_token' as const, LoginFailReason.INVALID_TOKEN],
      ['user_not_found' as const, LoginFailReason.USER_NOT_FOUND],
    ])('writes "%s" as enum %s', async (input, expectedEnum) => {
      mockPrisma.loginEvent.create.mockResolvedValue({});

      await service.recordFailure({
        userId: 1,
        tenantId: 1,
        ip: '1.2.3.4',
        userAgent: 'UA',
        failReason: input,
      });

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledTimes(1);
      const callArg = mockPrisma.loginEvent.create.mock.calls[0][0];
      expect(callArg.data.status).toBe('FAILED');
      expect(callArg.data.failReason).toBe(expectedEnum);
    });
  });

  describe('recordLogout', () => {
    it('creates a login_event with status logout', async () => {
      mockPrisma.loginEvent.create.mockResolvedValue({});

      await service.recordLogout({
        userId: 1,
        tenantId: 2,
        sessionId: 'rt_abc123',
      });

      expect(mockPrisma.loginEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'LOGOUT',
          sessionId: 'rt_abc123',
        }),
      });
    });
  });

  describe('computeDeviceId', () => {
    it('returns null when both ip and userAgent are null', async () => {
      mockPrisma.loginEvent.create.mockResolvedValue({});

      await service.recordSuccess({
        userId: 1,
        tenantId: null,
        ip: null,
        userAgent: null,
        sessionId: 'rt_abc',
      });

      const call = mockPrisma.loginEvent.create.mock.calls[0][0];
      expect(call.data.deviceId).toBeNull();
    });
  });
});
