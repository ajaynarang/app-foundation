import { Test, TestingModule } from '@nestjs/testing';
import { UserInvitationsService } from '../user-invitations.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';
import { SmsService } from '../../../../infrastructure/sms/sms.service';
import { TwilioVerifyService } from '../../../../infrastructure/sms/twilio-verify.service';
import { PinService } from '../../../../auth/pin.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';

describe('UserInvitationsService', () => {
  let service: UserInvitationsService;

  const mockPrismaService = {
    userInvitation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    tenant: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailService = {
    sendUserInvitation: jest.fn(),
  };

  const mockSmsService = {
    sendSms: jest.fn(),
  };

  const mockTwilioVerifyService = {
    sendVerification: jest.fn(),
    checkVerification: jest.fn(),
  };

  const mockPinService = {
    hashPin: jest.fn(),
    verifyPin: jest.fn(),
    generateTemporaryPin: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserInvitationsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: SmsService,
          useValue: mockSmsService,
        },
        {
          provide: TwilioVerifyService,
          useValue: mockTwilioVerifyService,
        },
        {
          provide: PinService,
          useValue: mockPinService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<UserInvitationsService>(UserInvitationsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inviteUser', () => {
    const defaultCurrentUser = {
      id: 1,
      userId: 'user_admin1',
      role: 'ADMIN',
      tenantId: 'tenant_abc',
      tenant: { id: 1 },
    };

    it('should create invitation for new user', async () => {
      const inviteDto = {
        email: 'newuser@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'MEMBER' as any,
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.create.mockResolvedValue({
        id: 1,
        invitationId: 'inv_abc123',
        email: inviteDto.email,
        status: 'PENDING',
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
        tenant: { companyName: 'Fleet Co' },
      });

      const result = await service.inviteUser(inviteDto, defaultCurrentUser);

      expect(result.status).toBe('PENDING');
      expect(mockPrismaService.userInvitation.create).toHaveBeenCalled();
    });

    it('should throw error if user already exists', async () => {
      const inviteDto = {
        email: 'existing@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'MEMBER' as any,
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue({ id: 1 });

      await expect(service.inviteUser(inviteDto, defaultCurrentUser)).rejects.toThrow(ConflictException);
    });
  });

  describe('acceptInvitation', () => {
    it('should accept valid invitation and create user', async () => {
      const token = 'valid-token';
      const firebaseUid = 'firebase-uid-123';

      const mockInvitation = {
        id: 1,
        invitationId: 'inv_abc',
        email: 'newuser@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: 'MEMBER',
        tenantId: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 1,
        userId: 'user_abc123',
        email: mockInvitation.email,
      };

      mockPrismaService.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'ACCEPTED',
      });

      const result = await service.acceptInvitation(token, firebaseUid);

      expect(result).toEqual(mockUser);
    });

    it('should throw error if invitation expired', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await expect(service.acceptInvitation('token', 'firebase-uid')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getInvitations', () => {
    it('should return invitations for tenant', async () => {
      const mockInvitations = [
        { id: 1, email: 'user1@example.com', status: 'PENDING' },
        { id: 2, email: 'user2@example.com', status: 'ACCEPTED' },
      ];

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findMany.mockResolvedValue(mockInvitations);

      const result = await service.getInvitations('tenant_abc');

      expect(result).toEqual(mockInvitations);
    });
  });

  describe('cancelInvitation', () => {
    it('should cancel pending invitation', async () => {
      const mockInvitation = {
        id: 1,
        invitationId: 'inv_abc',
        tenantId: 1,
        status: 'PENDING',
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrismaService.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'CANCELLED',
      });

      const result = await service.cancelInvitation('inv_abc', 'tenant_abc', 'No longer needed');

      expect(result.status).toBe('CANCELLED');
    });

    it('should throw error if invitation already accepted', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'ACCEPTED',
      });

      await expect(service.cancelInvitation('inv_abc', 'tenant_abc', 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  describe('resendInvitation', () => {
    it('should generate new token and reset expiry for pending invitation', async () => {
      const mockInvitation = {
        id: 1,
        invitationId: 'inv_abc',
        tenantId: 1,
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tenant: { companyName: 'Fleet Co' },
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrismaService.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        token: 'new-token',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      await service.resendInvitation('inv_abc', 'tenant_abc');

      expect(mockPrismaService.userInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { invitationId: 'inv_abc' },
          data: expect.objectContaining({
            token: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should throw error if invitation is not PENDING', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        invitationId: 'inv_abc',
        tenantId: 1,
        status: 'ACCEPTED',
      });

      await expect(service.resendInvitation('inv_abc', 'tenant_abc')).rejects.toThrow(BadRequestException);
    });

    it('should throw error if invitation not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.resendInvitation('inv_nonexistent', 'tenant_abc')).rejects.toThrow(NotFoundException);
    });

    it('should resend via SMS when inviteChannel is SMS', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        invitationId: 'inv_sms',
        tenantId: 1,
        phone: '+15551234567',
        email: null,
        firstName: 'Mike',
        lastName: 'Driver',
        status: 'PENDING',
        inviteChannel: 'SMS',
        tenant: { companyName: 'Fleet Co' },
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
      });
      mockPrismaService.userInvitation.update.mockResolvedValue({
        token: 'new-sms-token',
      });

      await service.resendInvitation('inv_sms', 'tenant_abc');

      expect(mockSmsService.sendSms).toHaveBeenCalledWith('+15551234567', expect.stringContaining('SALLY Fleet'));
    });

    it('should throw when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.resendInvitation('inv_abc', 'bad_tenant')).rejects.toThrow(NotFoundException);
    });

    it('should throw when invitation belongs to different tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999, // different tenant
        status: 'PENDING',
        tenant: { companyName: 'Other' },
        invitedByUser: { firstName: 'A', lastName: 'B' },
      });

      await expect(service.resendInvitation('inv_abc', 'tenant_abc')).rejects.toThrow('does not belong');
    });
  });

  describe('getInvitationByToken', () => {
    it('should return invitation with tenant and inviter details', async () => {
      const invitation = {
        id: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tenant: {
          tenantId: 'tnt-1',
          companyName: 'Fleet Co',
          subdomain: 'fleet',
        },
        invitedByUser: {
          firstName: 'Admin',
          lastName: 'User',
          email: 'a@b.com',
        },
      };
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(invitation);

      const result = await service.getInvitationByToken('valid-token');

      expect(result).toEqual(invitation);
    });

    it('should throw NotFoundException for invalid token', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.getInvitationByToken('bad-token')).rejects.toThrow(NotFoundException);
    });

    it('should throw for non-PENDING invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACCEPTED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await expect(service.getInvitationByToken('accepted-token')).rejects.toThrow('no longer valid');
    });

    it('should throw for expired invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.getInvitationByToken('expired-token')).rejects.toThrow('expired');
    });
  });

  describe('getInvitationLink', () => {
    it('should return invite link for pending invitation', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'PENDING',
        token: 'existing-token',
      });

      const result = await service.getInvitationLink('inv_abc', 'tenant_abc');

      expect(result.inviteLink).toContain('existing-token');
    });

    it('should throw for non-pending invitation', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'ACCEPTED',
      });

      await expect(service.getInvitationLink('inv_abc', 'tenant_abc')).rejects.toThrow('Cannot get link');
    });
  });

  describe('inviteUser — role restrictions', () => {
    it('should reject SUPER_ADMIN role invitation', async () => {
      await expect(
        service.inviteUser(
          {
            email: 'a@b.com',
            firstName: 'A',
            lastName: 'B',
            role: 'SUPER_ADMIN' as any,
          },
          { userId: 'u1', role: 'ADMIN', tenantId: 'tnt_1' },
        ),
      ).rejects.toThrow('SUPER_ADMIN');
    });

    it('should reject OWNER role invitation', async () => {
      await expect(
        service.inviteUser(
          {
            email: 'a@b.com',
            firstName: 'A',
            lastName: 'B',
            role: 'OWNER' as any,
          },
          { userId: 'u1', role: 'ADMIN', tenantId: 'tnt_1' },
        ),
      ).rejects.toThrow('OWNER');
    });

    it('should reject ADMIN inviting another ADMIN', async () => {
      await expect(
        service.inviteUser(
          {
            email: 'a@b.com',
            firstName: 'A',
            lastName: 'B',
            role: 'ADMIN' as any,
          },
          { userId: 'u1', role: 'ADMIN', tenantId: 'tnt_1' },
        ),
      ).rejects.toThrow('Only the tenant owner');
    });

    it('should reject SUPER_ADMIN user from inviting', async () => {
      await expect(
        service.inviteUser(
          {
            email: 'a@b.com',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'u1', role: 'SUPER_ADMIN', tenantId: null },
        ),
      ).rejects.toThrow('Super admins cannot invite');
    });

    it('should reject when user has no tenantId', async () => {
      await expect(
        service.inviteUser(
          {
            email: 'a@b.com',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'u1', role: 'ADMIN', tenantId: null },
        ),
      ).rejects.toThrow('must belong to a tenant');
    });
  });

  describe('inviteUser — phone-only invitation (SMS)', () => {
    it('should send invitation via SMS when phone without email', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.create.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
        tenant: { companyName: 'Fleet Co' },
      });

      await service.inviteUser(
        {
          phone: '+15551234567',
          firstName: 'Driver',
          lastName: 'One',
          role: 'MEMBER' as any,
        },
        { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
      );

      expect(mockSmsService.sendSms).toHaveBeenCalledWith('+15551234567', expect.stringContaining('SALLY Fleet'));
      expect(mockEmailService.sendUserInvitation).not.toHaveBeenCalled();
    });
  });

  describe('cancelInvitation — edge cases', () => {
    it('should throw when invitation already cancelled', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'CANCELLED',
      });

      await expect(service.cancelInvitation('inv_abc', 'tenant_abc')).rejects.toThrow('already cancelled');
    });

    it('should throw when invitation belongs to different tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
        status: 'PENDING',
      });

      await expect(service.cancelInvitation('inv_abc', 'tenant_abc')).rejects.toThrow('does not belong');
    });
  });

  describe('getInvitations — super admin (no tenantId)', () => {
    it('should return all invitations when tenantIdString is undefined', async () => {
      mockPrismaService.userInvitation.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.getInvitations(undefined);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findMany.mockResolvedValue([]);

      await service.getInvitations('tenant_abc', 'PENDING');

      expect(mockPrismaService.userInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PENDING' }),
        }),
      );
    });
  });

  describe('acceptInvitation — not found', () => {
    it('should throw when invitation not found', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvitation('bad-token', 'uid')).rejects.toThrow(NotFoundException);
    });

    it('should throw when invitation is not PENDING', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'CANCELLED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await expect(service.acceptInvitation('token', 'uid')).rejects.toThrow('no longer valid');
    });
  });

  describe('acceptPhoneInvitation', () => {
    it('should verify OTP, hash PIN, create user and accept invitation', async () => {
      const mockInvitation = {
        id: 1,
        token: 'phone-token',
        phone: '+15551234567',
        firstName: 'Mike',
        lastName: 'Driver',
        role: 'MEMBER',
        tenantId: 1,
        email: null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 2,
        userId: 'user_driver1',
        phone: '+15551234567',
      };

      mockPrismaService.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPinService.hashPin.mockResolvedValue('hashed-pin');
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback(mockPrismaService);
      });
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'ACCEPTED',
      });

      const result = await service.acceptPhoneInvitation({
        token: 'phone-token',
        phone: '+15551234567',
        otp: '123456',
        pin: '1234',
      });

      expect(result).toEqual(mockUser);
      expect(mockTwilioVerifyService.checkVerification).toHaveBeenCalledWith('+15551234567', '123456');
      expect(mockPinService.hashPin).toHaveBeenCalledWith('1234');
    });

    it('should throw for invalid or expired invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptPhoneInvitation({
          token: 'bad-token',
          phone: '+15551234567',
          otp: '123456',
          pin: '1234',
        }),
      ).rejects.toThrow('Invalid or expired invitation');
    });

    it('should throw when invitation status is not PENDING', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'ACCEPTED',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await expect(
        service.acceptPhoneInvitation({
          token: 'token',
          phone: '+15551234567',
          otp: '123456',
          pin: '1234',
        }),
      ).rejects.toThrow('Invalid or expired invitation');
    });

    it('should throw when invitation has expired', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(
        service.acceptPhoneInvitation({
          token: 'token',
          phone: '+15551234567',
          otp: '123456',
          pin: '1234',
        }),
      ).rejects.toThrow('Invalid or expired invitation');
    });

    it('should throw when phone number does not match invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        phone: '+15559999999',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      await expect(
        service.acceptPhoneInvitation({
          token: 'token',
          phone: '+15551234567',
          otp: '123456',
          pin: '1234',
        }),
      ).rejects.toThrow('Phone number does not match invitation');
    });

    it('should throw for invalid OTP', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        phone: '+15551234567',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      mockTwilioVerifyService.checkVerification.mockResolvedValue(false);

      await expect(
        service.acceptPhoneInvitation({
          token: 'token',
          phone: '+15551234567',
          otp: 'wrong',
          pin: '1234',
        }),
      ).rejects.toThrow('Invalid or expired verification code');
    });
  });

  describe('inviteUser — phone user already exists', () => {
    it('should throw ConflictException when phone number already in use', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst
        .mockResolvedValueOnce(null) // email check
        .mockResolvedValueOnce({ id: 99 }); // phone check

      await expect(
        service.inviteUser(
          {
            email: 'new@test.com',
            phone: '+15551234567',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
        ),
      ).rejects.toThrow('phone number already exists');
    });
  });

  describe('inviteUser — missing email and phone', () => {
    it('should throw when neither email nor phone provided', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });

      await expect(
        service.inviteUser(
          {
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
        ),
      ).rejects.toThrow('Either email or phone is required');
    });
  });

  describe('inviteUser — pending invitation exists', () => {
    it('should throw ConflictException for duplicate pending invitation', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.findFirst.mockResolvedValue({
        id: 1,
        status: 'PENDING',
      });

      await expect(
        service.inviteUser(
          {
            email: 'new@test.com',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
        ),
      ).rejects.toThrow('Invitation already sent');
    });
  });

  describe('inviteUser — tenant not found', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteUser(
          {
            email: 'new@test.com',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'user_admin1', role: 'ADMIN', tenantId: 'bad_tenant' },
        ),
      ).rejects.toThrow('Tenant not found');
    });
  });

  describe('inviteUser — inviting user not found', () => {
    it('should throw NotFoundException when inviting user not found in DB', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.inviteUser(
          {
            email: 'new@test.com',
            firstName: 'A',
            lastName: 'B',
            role: 'MEMBER' as any,
          },
          { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
        ),
      ).rejects.toThrow('Inviting user not found');
    });
  });

  describe('cancelInvitation — additional edge cases', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.cancelInvitation('inv_abc', 'bad_tenant')).rejects.toThrow('Tenant not found');
    });

    it('should throw NotFoundException when invitation not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.cancelInvitation('inv_nonexistent', 'tenant_abc')).rejects.toThrow('Invitation not found');
    });
  });

  describe('getInvitations — tenant not found', () => {
    it('should throw NotFoundException when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getInvitations('bad_tenant')).rejects.toThrow('Tenant not found');
    });
  });

  describe('getInvitationLink — edge cases', () => {
    it('should throw when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getInvitationLink('inv_abc', 'bad_tenant')).rejects.toThrow('Tenant not found');
    });

    it('should throw when invitation not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.getInvitationLink('inv_nonexistent', 'tenant_abc')).rejects.toThrow('Invitation not found');
    });

    it('should throw when invitation belongs to different tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
        status: 'PENDING',
      });

      await expect(service.getInvitationLink('inv_abc', 'tenant_abc')).rejects.toThrow('does not belong');
    });
  });
});
