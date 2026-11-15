import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { currentRls, isRlsStrict, runAsTenant } from '@appshore/kernel/infrastructure/rls/rls-context';
import { OAuthTokenGuard } from '../../oauth-provider/oauth-token.guard';
import { ApiKeyAuthGuard } from '../../api-keys/guards/api-key-auth.guard';
import { REFRESH_TOKEN_COOKIE_NAME } from '../../../constants/auth.constants';
import { UserRole } from '@appshore/db';
import { ROLES_KEY } from '../../../auth/decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../../auth/decorators/public.decorator';
import { AUTH_THROTTLE_LIMIT_STRICT, AUTH_THROTTLE_LIMIT_TOKEN, AUTH_THROTTLE_TTL_MS } from '../../../constants';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf, readBodyDto } from '../../../test/helpers/field-errors.helpers';
import { CancelInvitationDto } from '../dto/cancel-invitation.dto';
import { InvitationListQueryDto } from '../dto/invitation-list-query.dto';
import { UserInvitationsController } from '../user-invitations.controller';

describe('UserInvitationsController', () => {
  let controller: UserInvitationsController;
  let invitationsService: any;
  let authService: any;
  let response: { cookie: jest.Mock; clearCookie: jest.Mock };

  const currentUser = { tenantId: 'tenant_abc', dbId: 1 };
  const req = { ip: '203.0.113.9', headers: { 'user-agent': 'qa-agent' } } as any;
  const session = {
    accessToken: 'jwt_abc',
    refreshToken: 'refresh_secret',
    user: { userId: 'user_1', email: 'jane@example.com' },
  };

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
      joinInvitation: jest.fn().mockResolvedValue({ workspace: { tenantId: 'ten_two', name: 'Two' }, role: 'MEMBER' }),
      tenantDbIdForToken: jest.fn().mockResolvedValue(null),
    };

    authService = {
      startSession: jest.fn().mockResolvedValue(session),
      generateTokensForUser: jest.fn(),
    };
    response = { cookie: jest.fn(), clearCookie: jest.fn() };

    controller = new UserInvitationsController(invitationsService, authService, { get: () => undefined } as any);
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

  describe('accept and accept-phone sign in with the cookie, never a refresh token in the body', () => {
    it.each([
      ['acceptInvitation', 'email_password', { token: 'token_123456789012', password: 'Password123!' }],
      ['acceptPhoneInvitation', 'phone_otp', { token: 'token_123', phone: '+15551234567', otp: '123456', pin: '1234' }],
    ])('%s', async (method, authMethod, dto) => {
      const answer = await (controller as any)[method](dto, req, response);

      expect(invitationsService[method]).toHaveBeenCalledWith(dto);
      expect(authService.startSession).toHaveBeenCalledWith(1, authMethod, {
        ip: '203.0.113.9',
        userAgent: 'qa-agent',
      });
      expect(response.cookie).toHaveBeenCalledWith(
        REFRESH_TOKEN_COOKIE_NAME,
        'refresh_secret',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(answer).toEqual({ accessToken: 'jwt_abc', user: session.user });
      expect(JSON.stringify(answer)).not.toContain('refresh_secret');
      // The body-token helper is the dev switcher's only.
      expect(authService.generateTokensForUser).not.toHaveBeenCalled();
    });
  });

  describe('POST join: a signed-in, JWT-session-only route', () => {
    const proto = UserInvitationsController.prototype as any;

    it('is not @Public() and carries neither the OAuth nor the API-key guard, so no agent joins for a user', () => {
      expect(Reflect.getMetadata(PATH_METADATA, proto.joinInvitation)).toBe('join');
      expect(Reflect.getMetadata(METHOD_METADATA, proto.joinInvitation)).toBe(RequestMethod.POST);
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, proto.joinInvitation)).toBeUndefined();
      expect(Reflect.getMetadata(IS_PUBLIC_KEY, UserInvitationsController)).toBeUndefined();
      const guards = [
        ...((Reflect.getMetadata(GUARDS_METADATA, proto.joinInvitation) as unknown[]) ?? []),
        ...((Reflect.getMetadata(GUARDS_METADATA, UserInvitationsController) as unknown[]) ?? []),
      ];
      expect(guards).not.toContain(OAuthTokenGuard);
      expect(guards).not.toContain(ApiKeyAuthGuard);
      // Any role may join; only the email and its proof decide.
      expect(Reflect.getMetadata(ROLES_KEY, proto.joinInvitation)).toBeUndefined();
    });

    it('uses the STRICT throttle', () => {
      expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto.joinInvitation)).toBe(AUTH_THROTTLE_LIMIT_STRICT);
      expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto.joinInvitation)).toBe(AUTH_THROTTLE_TTL_MS);
    });

    it("leaves the session's tenant for the invitation's, under strict mode, and passes the caller's DB id", async () => {
      expect(isRlsStrict()).toBe(true);
      invitationsService.tenantDbIdForToken.mockResolvedValue(5);
      const seen: unknown[] = [];
      invitationsService.joinInvitation.mockImplementation(async () => {
        seen.push(currentRls());
        return { workspace: { tenantId: 'ten_five', name: 'Five' }, role: 'MEMBER' };
      });

      const answer = await runAsTenant(3, 'jwt', () => controller.joinInvitation({ token: 'tok' }, currentUser));

      expect(invitationsService.joinInvitation).toHaveBeenCalledWith('tok', 1);
      expect(seen).toEqual([{ kind: 'tenant', tenantId: 5, source: 'invitation' }]);
      expect(answer).toEqual({ workspace: { tenantId: 'ten_five', name: 'Five' }, role: 'MEMBER' });
    });

    it('an unknown token is 404 before any context change', async () => {
      await expect(controller.joinInvitation({ token: 'nope' }, currentUser)).rejects.toMatchObject({ status: 404 });
      expect(invitationsService.joinInvitation).not.toHaveBeenCalled();
    });
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

    it.each(['previewInvitation', 'acceptInvitation'])(
      '%s uses the token-route throttle, not the global one',
      (name) => {
        expect(Reflect.getMetadata('THROTTLER:LIMITdefault', proto[name])).toBe(AUTH_THROTTLE_LIMIT_TOKEN);
        expect(Reflect.getMetadata('THROTTLER:TTLdefault', proto[name])).toBe(AUTH_THROTTLE_TTL_MS);
      },
    );
  });

  it('resendInvitation delegates to service', async () => {
    await controller.resendInvitation('inv_1', currentUser);
    expect(invitationsService.resendInvitation).toHaveBeenCalledWith('inv_1', 'tenant_abc');
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
      [
        'acceptInvitation',
        () => controller.acceptInvitation({ token: 'tok', password: 'pw' } as any, req, response as any),
      ],
      ['acceptPhoneInvitation', () => controller.acceptPhoneInvitation({ token: 'tok' } as any, req, response as any)],
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
