import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { currentRls } from '@appshore/kernel/infrastructure/rls/rls-context';
import { UserRole } from '@appshore/db';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator';
import { AUTH_THROTTLE_LIMIT_OTP_SEND, AUTH_THROTTLE_TTL_MS } from '../../../constants';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { CancelInvitationDto } from '../dto/cancel-invitation.dto';
import { InvitationListQueryDto } from '../dto/invitation-list-query.dto';
import { UserInvitationsController } from '../user-invitations.controller';

describe('UserInvitationsController', () => {
  let controller: UserInvitationsController;
  let invitationsService: any;
  let authService: any;

  const currentUser = { tenantId: 'tenant_abc', dbId: 1 };

  beforeEach(() => {
    invitationsService = {
      inviteUser: jest.fn().mockResolvedValue({ invitationId: 'inv_1' }),
      listInvitations: jest.fn().mockResolvedValue({ items: [], nextCursor: null, total: 0 }),
      previewInvitation: jest.fn().mockResolvedValue({ invitationId: 'inv_1' }),
      acceptInvitation: jest.fn().mockResolvedValue({ id: 1, userId: 'user_1' }),
      cancelInvitation: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      rotateInvitationLink: jest.fn().mockResolvedValue({ inviteLink: 'http://test.com/accept?token=abc' }),
      resendInvitation: jest.fn().mockResolvedValue({ status: 'sent' }),
      acceptPhoneInvitation: jest.fn().mockResolvedValue({ id: 1, userId: 'user_1' }),
      tenantDbIdForToken: jest.fn().mockResolvedValue(null),
    };

    authService = {
      generateTokensForUser: jest.fn().mockResolvedValue({ accessToken: 'jwt_abc' }),
    };

    controller = new UserInvitationsController(invitationsService, authService);
  });

  it('inviteUser delegates to service', async () => {
    const dto = { email: 'new@test.com', role: 'MEMBER' };
    await controller.inviteUser(dto as any, currentUser);
    expect(invitationsService.inviteUser).toHaveBeenCalledWith(dto, currentUser);
  });

  it('getInvitations delegates to service', async () => {
    const page = await controller.getInvitations(
      currentUser,
      await readQueryDto(InvitationListQueryDto, { status: 'PENDING,EXPIRED', limit: '10', cursor: 'abc' }),
    );
    expect(invitationsService.listInvitations).toHaveBeenCalledWith(
      'tenant_abc',
      expect.objectContaining({ statuses: ['PENDING', 'EXPIRED'], limit: 10, cursor: 'abc' }),
    );
    expect(page).toEqual({ items: [], nextCursor: null, total: 0 });
  });

  it('getInvitations answers 400 naming status for an unknown one', async () => {
    expect(await fieldErrorsOf(readQueryDto(InvitationListQueryDto, { status: 'pending' }))).toHaveProperty('status');
  });

  it('previewInvitation reads the token from the body and delegates to service', async () => {
    await controller.previewInvitation({ token: 'token_123' });
    expect(invitationsService.previewInvitation).toHaveBeenCalledWith('token_123');
  });

  it('acceptInvitation delegates to service', async () => {
    await controller.acceptInvitation({
      token: 'token_123',
      firebaseUid: 'fb_uid',
    });
    expect(invitationsService.acceptInvitation).toHaveBeenCalledWith('token_123', 'fb_uid');
  });

  it("acceptInvitation answers the account's public profile, never its row (no password, PIN or Firebase uid)", async () => {
    invitationsService.acceptInvitation.mockResolvedValue({
      id: 7,
      userId: 'user_7',
      email: 'jane@example.com',
      emailVerified: true,
      firstName: 'Jane',
      lastName: 'Doe',
      role: 'MEMBER',
      isActive: true,
      passwordHash: '$2b$12$secret',
      pinHash: 'pin-hash',
      firebaseUid: 'fb_uid',
      tenantId: 3,
      tenant: { id: 3, tenantId: 'ten_abc', companyName: 'Acme' },
      createdAt: new Date('2026-11-15T00:00:00Z'),
    });

    const answer = await controller.acceptInvitation({ token: 'tok', firebaseUid: 'fb_uid' });

    expect(answer).toMatchObject({ userId: 'user_7', email: 'jane@example.com', tenantId: 'ten_abc' });
    for (const key of ['passwordHash', 'pinHash', 'firebaseUid', 'tenant', 'id'])
      expect(answer).not.toHaveProperty(key);
    expect(answer.hasPinSet).toBe(true);
  });

  it('cancelInvitation delegates to service', async () => {
    await controller.cancelInvitation(
      'inv_1',
      currentUser,
      await readBodyDto(CancelInvitationDto, { reason: 'No longer needed' }),
    );
    expect(invitationsService.cancelInvitation).toHaveBeenCalledWith('inv_1', 'tenant_abc', 'No longer needed');
  });

  it('rotateInvitationLink delegates to service', async () => {
    await controller.rotateInvitationLink('inv_1', currentUser);
    expect(invitationsService.rotateInvitationLink).toHaveBeenCalledWith('inv_1', 'tenant_abc');
  });

  describe('who may get a link, and where a token travels', () => {
    const proto = UserInvitationsController.prototype as any;
    const route = (name: string) => ({
      method: Reflect.getMetadata(METHOD_METADATA, proto[name]),
      path: Reflect.getMetadata(PATH_METADATA, proto[name]),
    });

    it('POST :invitation_id/link is for OWNER and ADMIN only: a MEMBER cannot read a bearer link', () => {
      expect(route('rotateInvitationLink')).toEqual({ method: RequestMethod.POST, path: ':invitation_id/link' });
      expect(Reflect.getMetadata(ROLES_KEY, proto.rotateInvitationLink)).toEqual([UserRole.OWNER, UserRole.ADMIN]);
    });

    it('has no GET :invitation_id/link and no route that takes a token in its path', () => {
      const routes = Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && Reflect.getMetadata(PATH_METADATA, proto[name]) !== undefined)
        .map(route);
      expect(routes).not.toContainEqual({ method: RequestMethod.GET, path: ':invitation_id/link' });
      expect(routes.filter((r) => /:token\b/.test(r.path))).toEqual([]);
      expect(proto.getInvitationLink).toBeUndefined();
      expect(proto.getInvitationByToken).toBeUndefined();
    });

    it('POST preview is public and the token is a body field', () => {
      expect(route('previewInvitation')).toEqual({ method: RequestMethod.POST, path: 'preview' });
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.previewInvitation)).toBe(true);
    });

    it.each(['previewInvitation', 'acceptInvitation'])('%s uses the OTP_SEND throttle, not the global one', (name) => {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto[name])).toBe(AUTH_THROTTLE_LIMIT_OTP_SEND);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto[name])).toBe(AUTH_THROTTLE_TTL_MS);
    });
  });

  it('resendInvitation delegates to service', async () => {
    await controller.resendInvitation('inv_1', currentUser);
    expect(invitationsService.resendInvitation).toHaveBeenCalledWith('inv_1', 'tenant_abc');
  });

  it('acceptPhoneInvitation returns tokens', async () => {
    const dto = { token: 'token_123', phone: '+15551234567', pin: '1234' };
    const result = await controller.acceptPhoneInvitation(dto as any);
    expect(invitationsService.acceptPhoneInvitation).toHaveBeenCalledWith(dto);
    expect(authService.generateTokensForUser).toHaveBeenCalled();
    expect(result.accessToken).toBe('jwt_abc');
  });

  describe('tenant context of the public routes', () => {
    const seenIn = (method: string) => {
      const seen: unknown[] = [];
      invitationsService[method].mockImplementation(async () => {
        seen.push(currentRls());
        return { id: 1, userId: 'user_1' };
      });
      return seen;
    };

    it.each([
      ['previewInvitation', () => controller.previewInvitation({ token: 'tok' })],
      ['acceptInvitation', () => controller.acceptInvitation({ token: 'tok', firebaseUid: 'fb' } as any)],
      ['acceptPhoneInvitation', () => controller.acceptPhoneInvitation({ token: 'tok' } as any)],
    ])("%s runs as the invitation's tenant", async (method, call) => {
      invitationsService.tenantDbIdForToken.mockResolvedValue(5);
      const seen = seenIn(method);

      await call();

      expect(invitationsService.tenantDbIdForToken).toHaveBeenCalledWith('tok');
      expect(seen).toEqual([{ kind: 'tenant', tenantId: 5, source: 'invitation' }]);
    });

    it('leaves an unknown token with no context, so the service answers its own not-found', async () => {
      const seen = seenIn('previewInvitation');
      await controller.previewInvitation({ token: 'nope' });
      expect(seen).toEqual([undefined]);
    });
  });
});
