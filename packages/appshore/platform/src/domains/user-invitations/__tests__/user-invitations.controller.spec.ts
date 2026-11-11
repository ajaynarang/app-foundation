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
      getInvitationByToken: jest.fn().mockResolvedValue({ invitationId: 'inv_1' }),
      acceptInvitation: jest.fn().mockResolvedValue({ userId: 'user_1' }),
      cancelInvitation: jest.fn().mockResolvedValue({ status: 'cancelled' }),
      getInvitationLink: jest.fn().mockResolvedValue({ link: 'http://test.com/accept?token=abc' }),
      resendInvitation: jest.fn().mockResolvedValue({ status: 'sent' }),
      acceptPhoneInvitation: jest.fn().mockResolvedValue({ id: 1, userId: 'user_1' }),
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

  it('getInvitationByToken delegates to service', async () => {
    await controller.getInvitationByToken('token_123');
    expect(invitationsService.getInvitationByToken).toHaveBeenCalledWith('token_123');
  });

  it('acceptInvitation delegates to service', async () => {
    await controller.acceptInvitation({
      token: 'token_123',
      firebaseUid: 'fb_uid',
    });
    expect(invitationsService.acceptInvitation).toHaveBeenCalledWith('token_123', 'fb_uid');
  });

  it('cancelInvitation delegates to service', async () => {
    await controller.cancelInvitation(
      'inv_1',
      currentUser,
      await readBodyDto(CancelInvitationDto, { reason: 'No longer needed' }),
    );
    expect(invitationsService.cancelInvitation).toHaveBeenCalledWith('inv_1', 'tenant_abc', 'No longer needed');
  });

  it('getInvitationLink delegates to service', async () => {
    await controller.getInvitationLink('inv_1', currentUser);
    expect(invitationsService.getInvitationLink).toHaveBeenCalledWith('inv_1', 'tenant_abc');
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
});
