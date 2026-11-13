import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { RefreshSessionService } from '../refresh-session.service';

const mockAuthService = {
  lookupUser: jest.fn(),
  exchangeFirebaseToken: jest.fn(),
  logout: jest.fn(),
  getProfile: jest.fn(),
  updateProfile: jest.fn(),
  recordPasswordChange: jest.fn(),
  sendPhoneOtp: jest.fn(),
  loginWithOtp: jest.fn(),
  loginWithPhone: jest.fn(),
  setPin: jest.fn(),
  addPhone: jest.fn(),
  verifyAndAddPhone: jest.fn(),
};

const mockRefreshSessions = {
  refresh: jest.fn(),
};

const defaultConfig = (key: string) => (key === 'environment' ? 'development' : undefined);
const mockConfigService = {
  get: jest.fn(defaultConfig),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RefreshSessionService, useValue: mockRefreshSessions },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  /**
   * The refresh cookie must be host-only. These fail if a `Domain` attribute
   * comes back, even with COOKIE_DOMAIN still configured by a deployment.
   */
  describe('refresh cookie is host-only', () => {
    const withCookieDomain = (key: string) => (key === 'COOKIE_DOMAIN' ? '.acme.io' : defaultConfig(key));

    it('login sets the cookie with no Domain attribute', async () => {
      mockConfigService.get.mockImplementation(withCookieDomain);
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } } as any;
      const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      mockAuthService.exchangeFirebaseToken.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', user: {} });

      await controller.exchangeFirebaseToken({ idToken: 'firebase-token', tenantId: 'T-1' } as any, req, res);

      expect(res.cookie).toHaveBeenCalledTimes(1);
      const [name, value, options] = res.cookie.mock.calls[0];
      expect(name).toBe('refreshToken');
      expect(value).toBe('rt');
      expect(options).not.toHaveProperty('domain');
      expect(options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/v1/auth' });
    });

    it('logout clears the host-only cookie with no Domain attribute', async () => {
      mockConfigService.get.mockImplementation(withCookieDomain);
      const res = { clearCookie: jest.fn() } as any;

      await controller.logout({ tokenId: null, dbId: 1, tenantDbId: null }, res);

      const hostOnly = res.clearCookie.mock.calls.filter(([, options]: [string, object]) => !('domain' in options));
      expect(hostOnly).toHaveLength(1);
      expect(hostOnly[0][0]).toBe('refreshToken');
      expect(hostOnly[0][1]).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/api/v1/auth' });
    });

    afterEach(() => {
      mockConfigService.get.mockReset().mockImplementation(defaultConfig);
    });
  });

  describe('exchangeFirebaseToken', () => {
    it('should exchange token and set cookie', async () => {
      const dto = { idToken: 'firebase-token', tenantId: 'T-1' };
      const req = { ip: '127.0.0.1', headers: { 'user-agent': 'test' } } as any;
      const res = { cookie: jest.fn() } as any;
      mockAuthService.exchangeFirebaseToken.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { userId: 'USR-001' },
      });

      const result = await controller.exchangeFirebaseToken(dto as any, req, res);

      expect(result).toEqual({
        accessToken: 'at',
        user: { userId: 'USR-001' },
      });
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('returns the new access token and sets the rotated refresh token as the host-only cookie', async () => {
      const session = { userId: 'USR-001', tokenId: 'rt_1', familyId: 'rt_0' } as any;
      const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
      mockRefreshSessions.refresh.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'successor-rt',
        user: { userId: 'USR-001' },
      });

      const result = await controller.refreshToken(session, res);

      expect(mockRefreshSessions.refresh).toHaveBeenCalledWith(session);
      expect(result).toEqual({
        accessToken: 'new-at',
        user: { userId: 'USR-001' },
      });
      // The successor replaces the cookie; the response body never carries a refresh token.
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        'successor-rt',
        expect.not.objectContaining({ domain: expect.anything() }),
      );
    });
  });

  describe('logout', () => {
    it('should revoke token and clear cookie', async () => {
      const user = { tokenId: 'rt_1', dbId: 1, tenantDbId: 10 };
      const res = { clearCookie: jest.fn() } as any;
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(user, res);

      // 204: nothing to return.
      expect(result).toBeUndefined();
      expect(mockAuthService.logout).toHaveBeenCalledWith('rt_1', 1, 10);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('should skip revoke if no tokenId', async () => {
      const user = { tokenId: null, dbId: 1, tenantDbId: null };
      const res = { clearCookie: jest.fn() } as any;

      const result = await controller.logout(user, res);

      // 204: nothing to return.
      expect(result).toBeUndefined();
      expect(mockAuthService.logout).not.toHaveBeenCalled();
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = { userId: 'USR-001' };
      const profile = { userId: 'USR-001', email: 'test@example.com' };
      mockAuthService.getProfile.mockResolvedValue(profile);

      const result = await controller.getProfile(user);
      expect(result).toEqual(profile);
    });
  });

  describe('changePassword', () => {
    it('should record password change and return result', async () => {
      const user = { userId: 'USR-001', tokenId: 'rt_1' };
      const dto = { revokeOtherSessions: true };
      mockAuthService.recordPasswordChange.mockResolvedValue({
        sessionsRevoked: 3,
      });

      const result = await controller.changePassword(user, dto);

      expect(result).toEqual({ sessionsRevoked: 3 });
    });

    it('should default revokeOtherSessions to true', async () => {
      const user = { userId: 'USR-001', tokenId: 'rt_1' };
      const dto = {};
      mockAuthService.recordPasswordChange.mockResolvedValue({
        sessionsRevoked: 0,
      });

      await controller.changePassword(user, dto);

      expect(mockAuthService.recordPasswordChange).toHaveBeenCalledWith('USR-001', 'rt_1', true, {
        currentPassword: undefined,
        newPassword: undefined,
      });
    });
  });

  describe('sendPhoneOtp', () => {
    it('should send the OTP and answer nothing (204), whether or not the number is registered', async () => {
      mockAuthService.sendPhoneOtp.mockResolvedValue(undefined);

      const result = await controller.sendPhoneOtp({
        phone: '+12025551234',
      });

      expect(result).toBeUndefined();
      expect(mockAuthService.sendPhoneOtp).toHaveBeenCalledWith('+12025551234');
    });
  });

  describe('phoneLogin', () => {
    it('should login and set refresh cookie', async () => {
      const dto = { phone: '+12025551234', pin: '1234' };
      const res = { cookie: jest.fn() } as any;
      mockAuthService.loginWithPhone.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        user: { userId: 'USR-001' },
      });

      const result = await controller.phoneLogin(dto, res);

      expect(result).toEqual({
        accessToken: 'at',
        user: { userId: 'USR-001' },
      });
      expect(res.cookie).toHaveBeenCalled();
    });
  });

  describe('setPin', () => {
    it('should delegate to auth service', async () => {
      const user = { userId: 'USR-001' };
      mockAuthService.setPin.mockResolvedValue(undefined);

      const result = await controller.setPin(user, { pin: '5678' });
      expect(result).toBeUndefined();
      expect(mockAuthService.setPin).toHaveBeenCalledWith('USR-001', '5678');
    });
  });
});
