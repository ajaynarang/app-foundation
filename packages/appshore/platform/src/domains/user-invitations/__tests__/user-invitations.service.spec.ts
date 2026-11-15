import { Test, TestingModule } from '@nestjs/testing';
import { UserInvitationsService } from '../user-invitations.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../infrastructure/notification/services/email.service';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { TwilioVerifyService } from '../../../infrastructure/sms/twilio-verify.service';
import { PinService } from '../../../auth/pin.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantEntitlementsService } from '../../entitlements/tenant-entitlements.service';
import { fixtureModel, tiedTimestamps, walkCursorList } from '../../../test/helpers';
import { hashToken } from '../../../auth/token-hash';

/** The raw token in a link the service built (emailed, texted or returned). */
const tokenInLink = (link: string) => new URL(link).searchParams.get('token') as string;

describe('UserInvitationsService', () => {
  let service: UserInvitationsService;

  const mockPrismaService = {
    workspaceMember: {
      findFirst: jest.fn(),
      upsert: jest.fn(),
    },
    userInvitation: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
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

  const mockEntitlements = { assertUserSeatAvailable: jest.fn() };

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
        { provide: TenantEntitlementsService, useValue: mockEntitlements },
      ],
    }).compile();

    service = module.get<UserInvitationsService>(UserInvitationsService);

    jest.clearAllMocks();
    mockEntitlements.assertUserSeatAvailable.mockResolvedValue(undefined);
    // The conditional move wins unless a test says another request got there first.
    mockPrismaService.userInvitation.updateMany.mockResolvedValue({ count: 1 });
    mockPrismaService.$transaction.mockImplementation(async (callback) => callback(mockPrismaService));
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

    it('a pending invitation takes a seat: refused, and nothing written or sent, when the plan is full', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'tenant_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.findFirst.mockResolvedValue(null);
      mockEntitlements.assertUserSeatAvailable.mockRejectedValue(
        new ForbiddenException({ code: 'USER_LIMIT_REACHED', detail: 'full' }),
      );

      await expect(
        service.inviteUser(
          { email: 'new@example.com', firstName: 'N', lastName: 'U', role: 'MEMBER' as any },
          defaultCurrentUser,
        ),
      ).rejects.toMatchObject({ response: { code: 'USER_LIMIT_REACHED' } });
      expect(mockEntitlements.assertUserSeatAvailable).toHaveBeenCalledWith(1, { route: 'POST /invitations' });
      expect(mockPrismaService.userInvitation.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendUserInvitation).not.toHaveBeenCalled();
    });

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
        tenant: { companyName: 'Acme Co' },
      });

      const result = await service.inviteUser(inviteDto, defaultCurrentUser);

      expect(result.status).toBe('PENDING');
      expect(mockPrismaService.userInvitation.create).toHaveBeenCalled();
    });

    it("answers the public invitation only: never a link, the token, the Int key or the inviter's whole row", async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'tenant_abc' });
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 1 });
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.findFirst.mockResolvedValue(null);
      mockPrismaService.userInvitation.create.mockResolvedValue({
        id: 7,
        invitationId: 'inv_abc123',
        tenantId: 1,
        invitedBy: 1,
        tokenHash: hashToken('secret-token'),
        email: 'newuser@example.com',
        phone: null,
        inviteChannel: 'EMAIL',
        firstName: 'John',
        lastName: 'Doe',
        role: 'MEMBER',
        status: 'PENDING',
        expiresAt: new Date(),
        acceptedAt: null,
        cancelledAt: null,
        createdAt: new Date(),
        invitedByUser: { userId: 'user_admin1', email: 'a@example.com', firstName: 'Admin', lastName: 'User' },
        tenant: { companyName: 'Acme Co' },
      });

      const result = await service.inviteUser(
        { email: 'newuser@example.com', firstName: 'John', lastName: 'Doe', role: 'MEMBER' as any },
        defaultCurrentUser,
      );

      expect(result).toMatchObject({ invitationId: 'inv_abc123', invitedBy: { userId: 'user_admin1' } });
      for (const key of ['id', 'token', 'tokenHash', 'inviteLink', 'tenantId', 'tenant', 'invitedByUser']) {
        expect(result).not.toHaveProperty(key);
      }
      // The inviter is read for the email and the response only: never the password or PIN hash.
      const include = mockPrismaService.userInvitation.create.mock.calls[0][0].include;
      expect(include.invitedByUser).toEqual({ select: expect.not.objectContaining({ passwordHash: true }) });
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
      mockPrismaService.user.findFirst.mockResolvedValue(null); // no existing account — invite creates one
      mockPrismaService.user.create.mockResolvedValue(mockUser);
      mockPrismaService.userInvitation.update.mockResolvedValue({
        ...mockInvitation,
        status: 'ACCEPTED',
      });

      const result = await service.acceptInvitation(token, firebaseUid);

      expect(result).toEqual(mockUser);
      // Looked up by the token's hash: the raw token is never a query value.
      expect(mockPrismaService.userInvitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken(token) },
      });
    });

    it('is single use under a race: the loser of the conditional move is a 409 and creates nobody', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tokenHash: hashToken('raced-token'),
        email: 'new@example.com',
        tenantId: 1,
        role: 'MEMBER',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
      });
      // Both requests read PENDING before either transaction ran; the other one moved the row first.
      mockPrismaService.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.acceptInvitation('raced-token', 'fb')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
      expect(mockPrismaService.userInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 1, tokenHash: hashToken('raced-token'), status: 'PENDING' },
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
      expect(mockPrismaService.workspaceMember.upsert).not.toHaveBeenCalled();
    });

    it('answers 409 INVALID_STATE if the invitation expired', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        status: 'PENDING',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });

      await expect(service.acceptInvitation('token', 'firebase-uid')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });
  });

  describe('listInvitations: a cursor list, newest first', () => {
    // A bulk invite writes several rows in one millisecond.
    const stamps = tiedTimestamps(7);
    const rows = stamps.map((createdAt, index) => ({
      id: index + 1,
      invitationId: `inv_${(index * 3) % 7}`,
      tenantId: index === 6 ? 99 : 1,
      tokenHash: hashToken(`secret-token-${index}`),
      email: `user${index}@example.com`,
      phone: null,
      inviteChannel: 'EMAIL',
      firstName: 'Sam',
      lastName: 'Doe',
      role: 'MEMBER',
      status: index === 0 ? 'ACCEPTED' : 'PENDING',
      expiresAt: new Date('2026-04-01T00:00:00.000Z'),
      acceptedAt: null,
      cancelledAt: null,
      createdAt,
      invitedByUser: { userId: 'usr_owner', email: 'owner@example.com', firstName: 'O', lastName: 'W' },
    }));

    beforeEach(() => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'tenant_abc' });
      Object.assign(mockPrismaService.userInvitation, fixtureModel(rows));
    });

    it("returns each of the tenant's invitations once, ties included", async () => {
      const { pages, items } = await walkCursorList((cursor) =>
        service.listInvitations('tenant_abc', { limit: 2, cursor }),
      );

      expect(pages.map((page) => page.length)).toEqual([2, 2, 2]);
      expect(new Set(items.map((invitation) => invitation.invitationId)).size).toBe(6);
      const times = items.map((invitation) => invitation.createdAt.getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('never returns the acceptance token or the Int key, and names the inviter by public id', async () => {
      const { items } = await service.listInvitations('tenant_abc');

      expect(mockPrismaService.userInvitation.findMany.mock.calls[0][0].select).not.toHaveProperty('token');
      expect(mockPrismaService.userInvitation.findMany.mock.calls[0][0].select).not.toHaveProperty('tokenHash');
      for (const item of items) {
        expect(item).not.toHaveProperty('token');
        expect(item).not.toHaveProperty('tokenHash');
        expect(item).not.toHaveProperty('id');
      }
      expect(items[0].invitedBy).toEqual({
        userId: 'usr_owner',
        email: 'owner@example.com',
        firstName: 'O',
        lastName: 'W',
      });
    });

    it('filters by status in the page and the total', async () => {
      const page = await service.listInvitations('tenant_abc', { statuses: ['ACCEPTED'] as never });
      expect(page).toMatchObject({ total: 1, nextCursor: null });
      expect(page.items[0].status).toBe('ACCEPTED');
      // Several statuses at once: what the invitations screen asks for (pending or expired).
      const open = await service.listInvitations('tenant_abc', { statuses: ['PENDING', 'EXPIRED'] as never });
      expect(open.total).toBe(5);
    });

    it('answers 404 for an unknown tenant and 400 for a cursor it did not issue', async () => {
      await expect(service.listInvitations('tenant_abc', { cursor: 'nope' })).rejects.toMatchObject({ status: 400 });
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);
      await expect(service.listInvitations('ghost')).rejects.toThrow(NotFoundException);
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

    it('answers 409 INVALID_STATE if the invitation was already accepted', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: 'ACCEPTED',
      });

      await expect(service.cancelInvitation('inv_abc', 'tenant_abc', 'reason')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });
  });

  describe('resendInvitation', () => {
    it('should generate new token and reset expiry for pending invitation', async () => {
      const mockInvitation = {
        id: 1,
        invitationId: 'inv_abc',
        tenantId: 1,
        tokenHash: hashToken('old-token'),
        email: 'user@example.com',
        firstName: 'John',
        lastName: 'Doe',
        status: 'PENDING',
        inviteChannel: 'EMAIL',
        linkSharedAt: new Date('2026-11-01T00:00:00Z'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        tenant: { companyName: 'Acme Co' },
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(mockInvitation);
      mockPrismaService.userInvitation.findUniqueOrThrow.mockResolvedValue({
        invitationId: 'inv_abc',
        email: 'user@example.com',
        status: 'PENDING',
        invitedByUser: null,
      });

      const resent = await service.resendInvitation('inv_abc', 'tenant_abc');
      for (const key of ['id', 'token', 'tokenHash', 'tenantId', 'inviteLink']) expect(resent).not.toHaveProperty(key);

      // Rotated with a conditional move: a new hash, a new expiry, and the link is no longer shared.
      const move = mockPrismaService.userInvitation.updateMany.mock.calls[0][0];
      expect(move.where).toEqual({ id: 1, tokenHash: hashToken('old-token'), status: 'PENDING' });
      expect(move.data).toEqual({
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        expiresAt: expect.any(Date),
        linkSharedAt: null,
      });
      expect(move.data.tokenHash).not.toBe(hashToken('old-token'));
      // The emailed token is the one whose hash was stored.
      const emailedToken = mockEmailService.sendUserInvitation.mock.calls[0][5];
      expect(hashToken(emailedToken)).toBe(move.data.tokenHash);
    });

    it('a resend that loses a race with an accept or a rotate is a 409 and sends nothing', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'tenant_abc' });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        tokenHash: hashToken('old-token'),
        email: 'user@example.com',
        status: 'PENDING',
        tenant: { companyName: 'Acme Co' },
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
      });
      mockPrismaService.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.resendInvitation('inv_abc', 'tenant_abc')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
      expect(mockEmailService.sendUserInvitation).not.toHaveBeenCalled();
    });

    it('answers 409 INVALID_STATE if the invitation is not PENDING', async () => {
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

      await expect(service.resendInvitation('inv_abc', 'tenant_abc')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
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
        lastName: 'Rivera',
        status: 'PENDING',
        inviteChannel: 'SMS',
        tenant: { companyName: 'Acme Co' },
        invitedByUser: { firstName: 'Admin', lastName: 'User' },
      });
      mockPrismaService.userInvitation.findUniqueOrThrow.mockResolvedValue({
        invitationId: 'inv_sms',
        invitedByUser: null,
      });

      await service.resendInvitation('inv_sms', 'tenant_abc');

      expect(mockSmsService.sendSms).toHaveBeenCalledTimes(1);
      const [smsTo, smsBody] = mockSmsService.sendSms.mock.calls[0];
      expect(smsTo).toBe('+15551234567');
      expect(smsBody).toContain('invited');
      expect(smsBody).toContain('/accept-invitation?token=');
    });

    it('should throw when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.resendInvitation('inv_abc', 'bad_tenant')).rejects.toThrow(NotFoundException);
    });

    it("answers not found for another tenant's invitation, the same as one that does not exist", async () => {
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

      const error = await service.resendInvitation('inv_abc', 'tenant_abc').catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('Invitation not found');
      expect(mockPrismaService.userInvitation.update).not.toHaveBeenCalled();
      expect(mockPrismaService.userInvitation.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('tenantDbIdForToken', () => {
    it("answers the invitation's tenant DB id by the token's hash, selecting nothing else", async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({ tenantId: 5 });
      await expect(service.tenantDbIdForToken('tok')).resolves.toBe(5);
      expect(mockPrismaService.userInvitation.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashToken('tok') },
        select: { tenantId: true },
      });
    });

    it('answers null for an unknown or empty token', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);
      await expect(service.tenantDbIdForToken('nope')).resolves.toBeNull();
      await expect(service.tenantDbIdForToken('')).resolves.toBeNull();
    });
  });

  describe('previewInvitation', () => {
    const previewRow = {
      invitationId: 'inv_abc',
      email: 'invitee@example.com',
      phone: null,
      inviteChannel: 'EMAIL',
      firstName: 'Pat',
      lastName: 'Lee',
      role: 'MEMBER',
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      tenant: { tenantId: 'tnt-1', companyName: 'Acme Co', subdomain: 'acme' },
      invitedByUser: { firstName: 'Admin', lastName: 'User' },
    };

    it('answers the public preview: no token, no hash, no Int id, the inviter by name only', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(previewRow);

      const result = await service.previewInvitation('valid-token');

      expect(result).toEqual({
        invitationId: 'inv_abc',
        email: 'invitee@example.com',
        phone: null,
        inviteChannel: 'EMAIL',
        firstName: 'Pat',
        lastName: 'Lee',
        role: 'MEMBER',
        expiresAt: previewRow.expiresAt,
        tenant: { tenantId: 'tnt-1', companyName: 'Acme Co', subdomain: 'acme' },
        invitedBy: { firstName: 'Admin', lastName: 'User' },
      });
      const query = mockPrismaService.userInvitation.findUnique.mock.calls[0][0];
      expect(query.where).toEqual({ tokenHash: hashToken('valid-token') });
      // What is read is what may be answered: nothing secret or internal is even selected.
      for (const key of ['id', 'token', 'tokenHash', 'tenantId', 'invitedBy', 'acceptedByUserId']) {
        expect(query.select).not.toHaveProperty(key);
      }
      expect(query.select.invitedByUser).toEqual({ select: { firstName: true, lastName: true } });
      expect(query.select.tenant).toEqual({ select: { tenantId: true, companyName: true, subdomain: true } });
    });

    it('answers 404 for an unknown token, and for an empty one without a query', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);
      await expect(service.previewInvitation('bad-token')).rejects.toThrow(NotFoundException);
      mockPrismaService.userInvitation.findUnique.mockClear();
      await expect(service.previewInvitation('')).rejects.toThrow(NotFoundException);
      expect(mockPrismaService.userInvitation.findUnique).not.toHaveBeenCalled();
    });

    it('answers 409 INVALID_STATE for an invitation that is no longer pending', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({ ...previewRow, status: 'CANCELLED' });
      await expect(service.previewInvitation('cancelled-token')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE', detail: 'This invitation is no longer valid' },
      });
    });

    it('answers 409 INVALID_STATE for an expired invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        ...previewRow,
        expiresAt: new Date(Date.now() - 1000),
      });
      await expect(service.previewInvitation('expired-token')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
    });
  });

  describe('rotateInvitationLink', () => {
    const pending = {
      id: 1,
      invitationId: 'inv_abc',
      tenantId: 1,
      tokenHash: hashToken('emailed-token'),
      status: 'PENDING',
      linkSharedAt: null,
    };

    beforeEach(() => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({ id: 1, tenantId: 'tenant_abc' });
    });

    it('returns a new link once, stores only its hash, stamps linkSharedAt, and sends nothing', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(pending);

      const result = await service.rotateInvitationLink('inv_abc', 'tenant_abc');

      const raw = tokenInLink(result.inviteLink);
      expect(result.inviteLink).toContain('/accept-invitation?token=');
      expect(raw).not.toBe('emailed-token');
      const move = mockPrismaService.userInvitation.updateMany.mock.calls[0][0];
      // Conditional on the token the caller read: the emailed token's hash is replaced, so the emailed link is dead.
      expect(move.where).toEqual({ id: 1, tokenHash: hashToken('emailed-token'), status: 'PENDING' });
      expect(move.data).toEqual({ tokenHash: hashToken(raw), linkSharedAt: expect.any(Date) });
      expect(JSON.stringify(move)).not.toContain(raw);
      expect(mockEmailService.sendUserInvitation).not.toHaveBeenCalled();
      expect(mockSmsService.sendSms).not.toHaveBeenCalled();
    });

    it('a second rotation gives another link: each one is shown once', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(pending);
      const first = await service.rotateInvitationLink('inv_abc', 'tenant_abc');
      const second = await service.rotateInvitationLink('inv_abc', 'tenant_abc');
      expect(tokenInLink(second.inviteLink)).not.toBe(tokenInLink(first.inviteLink));
    });

    it('answers 409 INVALID_STATE, with the same detail as before, for a non-pending invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({ ...pending, status: 'ACCEPTED' });

      await expect(service.rotateInvitationLink('inv_abc', 'tenant_abc')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE', detail: 'An invitation that is accepted has no link to share' },
      });
      expect(mockPrismaService.userInvitation.updateMany).not.toHaveBeenCalled();
    });

    it('a rotation that loses a race with an accept is a 409 and shows no link', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(pending);
      mockPrismaService.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.rotateInvitationLink('inv_abc', 'tenant_abc')).rejects.toMatchObject({
        status: 409,
        response: { code: 'INVALID_STATE' },
      });
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
        tenant: { companyName: 'Acme Co' },
      });

      await service.inviteUser(
        {
          phone: '+15551234567',
          firstName: 'Sam',
          lastName: 'One',
          role: 'MEMBER',
        },
        { userId: 'user_admin1', role: 'ADMIN', tenantId: 'tenant_abc' },
      );

      expect(mockSmsService.sendSms).toHaveBeenCalledTimes(1);
      const [smsTo, smsBody] = mockSmsService.sendSms.mock.calls[0];
      expect(smsTo).toBe('+15551234567');
      expect(smsBody).toContain('invited');
      expect(smsBody).toContain('/accept-invitation?token=');
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

    it("answers not found for another tenant's invitation, the same as one that does not exist", async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
        status: 'PENDING',
      });

      const error = await service.cancelInvitation('inv_abc', 'tenant_abc').catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('Invitation not found');
      expect(mockPrismaService.userInvitation.update).not.toHaveBeenCalled();
    });
  });

  describe('getInvitations — super admin (no tenantId)', () => {
    it('should return all invitations when tenantIdString is undefined', async () => {
      const row = (invitationId: string) => ({ invitationId, createdAt: new Date(), invitedByUser: null });
      mockPrismaService.userInvitation.findMany.mockResolvedValue([row('inv_1'), row('inv_2')]);
      mockPrismaService.userInvitation.count.mockResolvedValue(2);

      const result = await service.listInvitations(undefined);

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(mockPrismaService.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('should filter by status', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findMany.mockResolvedValue([]);
      mockPrismaService.userInvitation.count.mockResolvedValue(0);

      await service.listInvitations('tenant_abc', { statuses: ['PENDING'] as never });

      expect(mockPrismaService.userInvitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: { in: ['PENDING'] } }),
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
        tokenHash: hashToken('phone-token'),
        phone: '+15551234567',
        firstName: 'Mike',
        lastName: 'Rivera',
        role: 'MEMBER',
        tenantId: 1,
        email: null,
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      const mockUser = {
        id: 2,
        userId: 'user_member1',
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

    it('is single use under a race: the loser of the conditional move is a 409 and creates nobody', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tokenHash: hashToken('phone-token'),
        phone: '+15551234567',
        email: null,
        tenantId: 1,
        role: 'MEMBER',
        status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
      });
      mockTwilioVerifyService.checkVerification.mockResolvedValue(true);
      mockPinService.hashPin.mockResolvedValue('hashed-pin');
      mockPrismaService.userInvitation.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.acceptPhoneInvitation({ token: 'phone-token', phone: '+15551234567', otp: '123456', pin: '1234' }),
      ).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
      expect(mockPrismaService.userInvitation.updateMany).toHaveBeenCalledWith({
        where: { id: 1, tokenHash: hashToken('phone-token'), status: 'PENDING' },
        data: expect.objectContaining({ status: 'ACCEPTED' }),
      });
      expect(mockPrismaService.user.create).not.toHaveBeenCalled();
    });

    it('answers 409 INVALID_STATE for an invalid or expired invitation', async () => {
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptPhoneInvitation({
          token: 'bad-token',
          phone: '+15551234567',
          otp: '123456',
          pin: '1234',
        }),
      ).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
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
      ).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
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
      ).rejects.toMatchObject({ status: 409, response: { code: 'INVALID_STATE' } });
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

      await expect(service.listInvitations('bad_tenant')).rejects.toThrow('Tenant not found');
    });
  });

  describe('rotateInvitationLink — edge cases', () => {
    it('should throw when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.rotateInvitationLink('inv_abc', 'bad_tenant')).rejects.toThrow('Tenant not found');
    });

    it('should throw when invitation not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue(null);

      await expect(service.rotateInvitationLink('inv_nonexistent', 'tenant_abc')).rejects.toThrow(
        'Invitation not found',
      );
    });

    it("answers not found for another tenant's invitation, the same as one that does not exist", async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 'tenant_abc',
      });
      mockPrismaService.userInvitation.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
        status: 'PENDING',
      });

      const error = await service.rotateInvitationLink('inv_abc', 'tenant_abc').catch((e) => e);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.message).toBe('Invitation not found');
      expect(mockPrismaService.userInvitation.update).not.toHaveBeenCalled();
    });
  });
});
