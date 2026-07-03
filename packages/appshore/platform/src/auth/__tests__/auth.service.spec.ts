import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtTokenService } from '../jwt.service';
import { FirebaseAuthService } from '../firebase-auth.service';
import { PinService } from '../pin.service';
import { TwilioVerifyService } from '../../infrastructure/sms/twilio-verify.service';
import { LoginEventService } from '../login-event.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';

const mockLoginEventService = {
  recordLoginEvent: jest.fn(),
  recordLogout: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
};

const mockPrismaService = {
  user: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  tenant: {
    findMany: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
  },
  loginEvent: {
    findMany: jest.fn(),
  },
};

const mockJwtTokenService = {
  generateTokenPair: jest.fn(),
  revokeRefreshToken: jest.fn(),
  generateAccessTokenOnly: jest.fn(),
};

const mockFirebaseAuthService = {
  verifyFirebaseToken: jest.fn(),
  findOrCreateUserByFirebaseUid: jest.fn(),
};

const mockPinService = {
  hashPin: jest.fn(),
  verifyPin: jest.fn(),
  isValidPin: jest.fn(),
};

const mockTwilioVerifyService = {
  sendVerification: jest.fn(),
  checkVerification: jest.fn(),
};

describe('AuthService - Phone Auth', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtTokenService, useValue: mockJwtTokenService },
        { provide: FirebaseAuthService, useValue: mockFirebaseAuthService },
        { provide: PinService, useValue: mockPinService },
        { provide: TwilioVerifyService, useValue: mockTwilioVerifyService },
        { provide: LoginEventService, useValue: mockLoginEventService },
        { provide: EmailService, useValue: { sendEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('loginWithPhone', () => {
    const mockUser = {
      id: 1,
      userId: 'USR-001',
      phone: '+12025551234',
      phoneVerified: true,
      pinHash: 'hashed-pin',
      isActive: true,
      tenant: { isActive: true, status: 'ACTIVE', tenantId: 'TNT-001', companyName: 'ACME' },
      driver: null,
    };

    it('should return tokens when phone and PIN are valid', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPinService.verifyPin.mockResolvedValue(true);
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenId: 'token-id',
      });
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.loginWithPhone({
        phone: '+12025551234',
        pin: '1234',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastLoginAt: expect.any(Date) }),
        }),
      );
    });

    it('should throw UnauthorizedException when phone not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      await expect(service.loginWithPhone({ phone: '+12025551234', pin: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when phone not verified', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        phoneVerified: false,
      });
      await expect(service.loginWithPhone({ phone: '+12025551234', pin: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when PIN is wrong', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockPinService.verifyPin.mockResolvedValue(false);
      await expect(service.loginWithPhone({ phone: '+12025551234', pin: '9999' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when tenant is inactive', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        tenant: { ...mockUser.tenant, isActive: false },
      });
      mockPinService.verifyPin.mockResolvedValue(true);
      await expect(service.loginWithPhone({ phone: '+12025551234', pin: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithOtp', () => {
    const mockUser = {
      id: 1,
      userId: 'USR-001',
      phone: '+12025551234',
      phoneVerified: true,
      pinHash: 'hashed-pin',
      isActive: true,
      tenant: { isActive: true, status: 'ACTIVE', tenantId: 'TNT-001', companyName: 'ACME' },
      driver: null,
    };

    it('should return tokens with requiresPinSetup=false when PIN is set', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenId: 'token-id',
      });
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.loginWithOtp({
        phone: '+12025551234',
        code: '1234',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.requiresPinSetup).toBe(false);
    });

    it('should return requiresPinSetup=true when no PIN set', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPrismaService.user.findFirst.mockResolvedValue({
        ...mockUser,
        pinHash: null,
      });
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        refreshTokenId: 'token-id',
      });
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.loginWithOtp({
        phone: '+12025551234',
        code: '1234',
      });

      expect(result.requiresPinSetup).toBe(true);
    });

    it('should throw UnauthorizedException when OTP is invalid', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(false);
      await expect(service.loginWithOtp({ phone: '+12025551234', code: '9999' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('setPin', () => {
    it('should hash and store the PIN', async () => {
      mockPinService.hashPin.mockResolvedValue('hashed-pin');
      mockPrismaService.user.update.mockResolvedValue({});

      await service.setPin('USR-001', '1234');

      expect(mockPinService.hashPin).toHaveBeenCalledWith('1234');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { userId: 'USR-001' },
        data: { pinHash: 'hashed-pin' },
      });
    });
  });

  describe('addPhone', () => {
    it('should throw ConflictException when phone already in use', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 2,
        userId: 'USR-002',
      });
      await expect(service.addPhone('USR-001', '+12025551234')).rejects.toThrow(ConflictException);
    });

    it('should update phone and send OTP', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue({});
      mockTwilioVerifyService.sendVerification.mockResolvedValue(undefined);

      await service.addPhone('USR-001', '+12025551234');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { userId: 'USR-001' },
        data: { phone: '+12025551234', phoneVerified: false },
      });
      expect(mockTwilioVerifyService.sendVerification).toHaveBeenCalledWith('+12025551234');
    });

    it('should allow same user to re-add their own phone', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 1,
        userId: 'USR-001',
      });
      mockPrismaService.user.update.mockResolvedValue({});
      mockTwilioVerifyService.sendVerification.mockResolvedValue(undefined);

      await service.addPhone('USR-001', '+12025551234');

      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should throw ConflictException on P2002 unique constraint', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockRejectedValue({ code: 'P2002' });

      await expect(service.addPhone('USR-001', '+12025551234')).rejects.toThrow(ConflictException);
    });

    it('should rollback phone when twilio fails', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.update.mockResolvedValue({});
      mockTwilioVerifyService.sendVerification.mockRejectedValue(new Error('Twilio down'));

      await expect(service.addPhone('USR-001', '+12025551234')).rejects.toThrow('Twilio down');

      // Second update call is the rollback
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.user.update).toHaveBeenLastCalledWith({
        where: { userId: 'USR-001' },
        data: { phone: null, phoneVerified: false },
      });
    });
  });

  describe('verifyAndAddPhone', () => {
    it('should verify phone and update user', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue({});

      await service.verifyAndAddPhone('USR-001', '+12025551234', '123456');

      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { userId: 'USR-001' },
        data: { phoneVerified: true },
      });
    });

    it('should throw when OTP is invalid', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(false);

      await expect(service.verifyAndAddPhone('USR-001', '+12025551234', '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('sendPhoneOtp', () => {
    it('should send OTP when user exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 1 });
      mockTwilioVerifyService.sendVerification.mockResolvedValue(undefined);

      await service.sendPhoneOtp('+12025551234');

      expect(mockTwilioVerifyService.sendVerification).toHaveBeenCalledWith('+12025551234');
    });

    it('should silently return when user does not exist', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await service.sendPhoneOtp('+12025551234');

      expect(mockTwilioVerifyService.sendVerification).not.toHaveBeenCalled();
    });
  });

  describe('refreshAccessToken', () => {
    it('should return new access token and profile', async () => {
      const user = {
        userId: 'USR-001',
        email: 'test@test.com',
        role: 'ADMIN',
        isActive: true,
        tenant: { tenantId: 'TNT-001', companyName: 'ACME', subdomain: null, status: 'ACTIVE', isActive: true },
        driver: null,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockJwtTokenService.generateAccessTokenOnly.mockReturnValue('new-access-token');

      const result = await service.refreshAccessToken('USR-001', 'token-id');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.user.userId).toBe('USR-001');
    });

    it('should throw when user not found or inactive', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshAccessToken('USR-999', 'token-id')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke token and record logout', async () => {
      mockJwtTokenService.revokeRefreshToken.mockResolvedValue(undefined);
      mockLoginEventService.recordLogout.mockResolvedValue(undefined);

      await service.logout('token-id', 1, 1);

      expect(mockJwtTokenService.revokeRefreshToken).toHaveBeenCalledWith('token-id');
      expect(mockLoginEventService.recordLogout).toHaveBeenCalledWith({
        userId: 1,
        tenantId: 1,
        sessionId: 'token-id',
      });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      const user = {
        userId: 'USR-001',
        email: 'test@test.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        isActive: true,
        phone: '+12025551234',
        phoneVerified: true,
        pinHash: 'hashed',
        tenant: { tenantId: 'TNT-001', companyName: 'ACME', subdomain: 'acme', status: 'ACTIVE', isActive: true },
        driver: null,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.getProfile('USR-001');

      expect(result.userId).toBe('USR-001');
      expect(result.hasPinSet).toBe(true);
      expect(result.tenantName).toBe('ACME');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      await expect(service.getProfile('USR-999')).rejects.toThrow('User not found');
    });
  });

  describe('updateProfile', () => {
    it('should return existing profile when no fields to update', async () => {
      const user = {
        userId: 'USR-001',
        email: 'test@test.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        isActive: true,
        phone: null,
        phoneVerified: false,
        pinHash: null,
        tenant: { tenantId: 'TNT-001', companyName: 'ACME', subdomain: null, status: 'ACTIVE', isActive: true },
        driver: null,
        createdAt: new Date(),
        lastLoginAt: null,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);

      const result = await service.updateProfile('USR-001', {});

      expect(result.userId).toBe('USR-001');
      expect(mockPrismaService.user.update).not.toHaveBeenCalled();
    });

    it('should update firstName', async () => {
      const user = {
        userId: 'USR-001',
        email: 'test@test.com',
        emailVerified: true,
        firstName: 'Jane',
        lastName: 'Doe',
        role: 'ADMIN',
        isActive: true,
        phone: null,
        phoneVerified: false,
        pinHash: null,
        tenant: { tenantId: 'TNT-001', companyName: 'ACME', subdomain: null, status: 'ACTIVE', isActive: true },
        driver: null,
        createdAt: new Date(),
        lastLoginAt: null,
      };
      mockPrismaService.user.update.mockResolvedValue(user);

      const result = await service.updateProfile('USR-001', {
        firstName: 'Jane',
      });

      expect(result.firstName).toBe('Jane');
    });

    it('should throw NotFoundException on P2025', async () => {
      mockPrismaService.user.update.mockRejectedValue({ code: 'P2025' });

      await expect(service.updateProfile('USR-999', { firstName: 'Jane' })).rejects.toThrow('User not found');
    });

    it('should rethrow non-Prisma errors', async () => {
      mockPrismaService.user.update.mockRejectedValue(new Error('DB down'));

      await expect(service.updateProfile('USR-001', { firstName: 'Jane' })).rejects.toThrow('DB down');
    });
  });

  describe('recordPasswordChange', () => {
    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.recordPasswordChange('USR-999', null, false)).rejects.toThrow('User not found');
    });

    it('should update passwordChangedAt without revoking sessions', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.recordPasswordChange('USR-001', null, false);

      expect(result.sessionsRevoked).toBe(0);
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should revoke other sessions when requested', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.update.mockResolvedValue({});
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.recordPasswordChange('USR-001', 'current-token', true);

      expect(result.sessionsRevoked).toBe(3);
    });
  });

  describe('exchangeFirebaseToken', () => {
    const meta = { ip: '127.0.0.1', userAgent: 'test' };

    it('should return tokens for valid firebase user', async () => {
      mockFirebaseAuthService.verifyFirebaseToken.mockResolvedValue({
        uid: 'fb-uid',
        email: 'test@test.com',
      });
      const user = {
        id: 1,
        userId: 'USR-001',
        email: 'test@test.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        isActive: true,
        tenant: {
          id: 1,
          tenantId: 'TNT-001',
          companyName: 'ACME',
          subdomain: 'acme',
          status: 'ACTIVE',
          isActive: true,
        },
        driver: null,
      };
      mockFirebaseAuthService.findOrCreateUserByFirebaseUid.mockResolvedValue(user);
      mockPrismaService.user.update.mockResolvedValue(user);
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'access',
        refreshToken: 'refresh',
        refreshTokenId: 'token-id',
      });
      mockLoginEventService.recordSuccess.mockResolvedValue(undefined);

      const result = await service.exchangeFirebaseToken({ firebaseToken: 'fb-token' }, meta);

      expect(result.accessToken).toBe('access');
      expect(result.user.tenantName).toBe('ACME');
    });

    it('should throw when user not found in DB', async () => {
      mockFirebaseAuthService.verifyFirebaseToken.mockResolvedValue({
        uid: 'fb-uid',
        email: 'test@test.com',
      });
      mockFirebaseAuthService.findOrCreateUserByFirebaseUid.mockResolvedValue(null);

      await expect(service.exchangeFirebaseToken({ firebaseToken: 'fb-token' }, meta)).rejects.toThrow(
        'User not found. Please complete registration.',
      );
    });

    it('should throw when user is deactivated', async () => {
      mockFirebaseAuthService.verifyFirebaseToken.mockResolvedValue({
        uid: 'fb-uid',
        email: 'test@test.com',
      });
      mockFirebaseAuthService.findOrCreateUserByFirebaseUid.mockResolvedValue({
        id: 1,
        isActive: false,
        tenant: { id: 1 },
      });
      mockLoginEventService.recordFailure.mockResolvedValue(undefined);

      await expect(service.exchangeFirebaseToken({ firebaseToken: 'fb-token' }, meta)).rejects.toThrow(
        'Account is deactivated',
      );
    });

    it('should throw when tenant is not ACTIVE', async () => {
      mockFirebaseAuthService.verifyFirebaseToken.mockResolvedValue({
        uid: 'fb-uid',
        email: 'test@test.com',
      });
      mockFirebaseAuthService.findOrCreateUserByFirebaseUid.mockResolvedValue({
        id: 1,
        isActive: true,
        tenant: { id: 1, status: 'PENDING' },
      });
      mockLoginEventService.recordFailure.mockResolvedValue(undefined);

      await expect(service.exchangeFirebaseToken({ firebaseToken: 'fb-token' }, meta)).rejects.toThrow(
        'pending approval',
      );
    });
  });

  describe('loginWithOtp - phoneVerified=false path', () => {
    it('should set phoneVerified when not yet verified', async () => {
      const user = {
        id: 1,
        userId: 'USR-001',
        phone: '+12025551234',
        phoneVerified: false,
        pinHash: null,
        isActive: true,
        tenant: { isActive: true, status: 'ACTIVE', tenantId: 'TNT-001', companyName: 'ACME' },
        driver: null,
      };
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPrismaService.user.findFirst.mockResolvedValue(user);
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        refreshTokenId: 'tid',
      });
      mockPrismaService.user.update.mockResolvedValue(user);

      const result = await service.loginWithOtp({
        phone: '+12025551234',
        code: '1234',
      });

      // First update: phoneVerified=true, second update: lastLoginAt
      expect(mockPrismaService.user.update).toHaveBeenCalledTimes(2);
      expect(result.requiresPinSetup).toBe(true);
    });
  });

  describe('loginWithOtp - user not found after OTP', () => {
    it('should throw UnauthorizedException when user not found', async () => {
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(service.loginWithOtp({ phone: '+12025551234', code: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('loginWithPhone - no pinHash', () => {
    it('should throw when user has no pinHash', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 1,
        userId: 'USR-001',
        phone: '+12025551234',
        phoneVerified: true,
        pinHash: null,
        isActive: true,
        tenant: { isActive: true, status: 'ACTIVE' },
        driver: null,
      });

      await expect(service.loginWithPhone({ phone: '+12025551234', pin: '1234' })).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('generateTokensForUser', () => {
    it('should return tokens for existing user', async () => {
      const user = {
        id: 1,
        userId: 'USR-001',
        email: 'test@test.com',
        emailVerified: true,
        firstName: 'John',
        lastName: 'Doe',
        role: 'ADMIN',
        isActive: true,
        phone: null,
        phoneVerified: false,
        pinHash: null,
        tenant: { tenantId: 'TNT-001', companyName: 'ACME', subdomain: null, status: 'ACTIVE', isActive: true },
        driver: null,
        createdAt: new Date(),
        lastLoginAt: null,
      };
      mockPrismaService.user.findUnique.mockResolvedValue(user);
      mockJwtTokenService.generateTokenPair.mockResolvedValue({
        accessToken: 'at',
        refreshToken: 'rt',
        refreshTokenId: 'tid',
      });

      const result = await service.generateTokensForUser({ id: 1 });

      expect(result.accessToken).toBe('at');
      expect(result.user.userId).toBe('USR-001');
    });

    it('should throw NotFoundException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.generateTokensForUser({ id: 999 })).rejects.toThrow('User not found');
    });
  });
});
