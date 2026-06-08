import { UserInvitationsController } from '../user-invitations.controller';

describe('UserInvitationsController', () => {
  let controller: UserInvitationsController;
  let invitationsService: any;
  let authService: any;

  const currentUser = { tenantId: 'tenant_abc', dbId: 1 };

  beforeEach(() => {
    invitationsService = {
      inviteUser: jest.fn().mockResolvedValue({ invitationId: 'inv_1' }),
      getInvitations: jest.fn().mockResolvedValue([]),
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
    const dto = { email: 'new@test.com', role: 'DISPATCHER' };
    await controller.inviteUser(dto as any, currentUser);
    expect(invitationsService.inviteUser).toHaveBeenCalledWith(dto, currentUser);
  });

  it('getInvitations delegates to service', async () => {
    await controller.getInvitations(currentUser, 'pending');
    expect(invitationsService.getInvitations).toHaveBeenCalledWith('tenant_abc', 'pending');
  });

  it('getInvitationByToken delegates to service', async () => {
    await controller.getInvitationByToken('token_123');
    expect(invitationsService.getInvitationByToken).toHaveBeenCalledWith('token_123');
  });

  it('acceptInvitation delegates to service', async () => {
    await controller.acceptInvitation({
      token: 'token_123',
      firebaseUid: 'fb_uid',
    } as any);
    expect(invitationsService.acceptInvitation).toHaveBeenCalledWith('token_123', 'fb_uid');
  });

  it('cancelInvitation delegates to service', async () => {
    await controller.cancelInvitation('inv_1', currentUser, 'No longer needed');
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
