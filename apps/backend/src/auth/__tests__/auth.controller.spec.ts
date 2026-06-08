import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

const mockAuthService = {
  lookupUser: jest.fn(),
  exchangeFirebaseToken: jest.fn(),
  refreshAccessToken: jest.fn(),
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

const mockConfigService = {
  get: jest.fn().mockReturnValue('development'),
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
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('lookupUser', () => {
    it('should delegate to auth service', async () => {
      const dto = { email: 'test@example.com' };
      const expected = { tenants: [{ tenantId: 'T-1', companyName: 'Acme' }] };
      mockAuthService.lookupUser.mockResolvedValue(expected);

      const result = await controller.lookupUser(dto as any);

      expect(result).toEqual(expected);
      expect(mockAuthService.lookupUser).toHaveBeenCalledWith(dto);
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
    it('should return new access token', async () => {
      const user = { userId: 'USR-001', tokenId: 'rt_1' };
      mockAuthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-at',
        user: { userId: 'USR-001' },
      });

      const result = await controller.refreshToken(user);

      expect(result).toEqual({
        accessToken: 'new-at',
        user: { userId: 'USR-001' },
      });
    });
  });

  describe('logout', () => {
    it('should revoke token and clear cookie', async () => {
      const user = { tokenId: 'rt_1', dbId: 1, tenantDbId: 10 };
      const res = { clearCookie: jest.fn() } as any;
      mockAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.logout(user, res);

      expect(result).toEqual({ message: 'Logout successful' });
      expect(mockAuthService.logout).toHaveBeenCalledWith('rt_1', 1, 10);
      expect(res.clearCookie).toHaveBeenCalled();
    });

    it('should skip revoke if no tokenId', async () => {
      const user = { tokenId: null, dbId: 1, tenantDbId: null };
      const res = { clearCookie: jest.fn() } as any;

      const result = await controller.logout(user, res);

      expect(result).toEqual({ message: 'Logout successful' });
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

      const result = await controller.changePassword(user, dto as any);

      expect(result).toEqual({ success: true, sessionsRevoked: 3 });
    });

    it('should default revokeOtherSessions to true', async () => {
      const user = { userId: 'USR-001', tokenId: 'rt_1' };
      const dto = {};
      mockAuthService.recordPasswordChange.mockResolvedValue({
        sessionsRevoked: 0,
      });

      await controller.changePassword(user, dto as any);

      expect(mockAuthService.recordPasswordChange).toHaveBeenCalledWith('USR-001', 'rt_1', true);
    });
  });

  describe('sendPhoneOtp', () => {
    it('should send OTP and return generic message', async () => {
      mockAuthService.sendPhoneOtp.mockResolvedValue(undefined);

      const result = await controller.sendPhoneOtp({
        phone: '+12025551234',
      } as any);

      expect(result.message).toContain('code has been sent');
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

      const result = await controller.phoneLogin(dto as any, res);

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

      const result = await controller.setPin(user, { pin: '5678' } as any);
      expect(result.message).toBe('PIN set successfully');
    });
  });
});
