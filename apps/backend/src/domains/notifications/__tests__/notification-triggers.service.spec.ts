import { Test } from '@nestjs/testing';
import { UserRole } from '@appshore/db';
import { PlatformNotificationType } from '@app/shared-types';
import { NotificationTriggersService } from '../notification-triggers.service';
import { NotificationDispatcherService } from '@appshore/platform/infrastructure/notifications/pipeline/notification-dispatcher.service';
import { RecipientResolutionService } from '@appshore/platform/infrastructure/notifications/pipeline/recipient-resolution.service';

const staff = [
  { id: 1, userId: 'u1', firebaseUid: null, email: 'o@x.com', phone: null },
  { id: 2, userId: 'u2', firebaseUid: null, email: 'a@x.com', phone: null },
];

describe('NotificationTriggersService', () => {
  let service: NotificationTriggersService;
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const recipients = {
    resolveByRoles: jest.fn().mockResolvedValue(staff),
    resolveByUserIds: jest
      .fn()
      .mockImplementation(async (_t: number, ids: number[]) =>
        ids.map((id) => ({ id, userId: `u${id}`, firebaseUid: null, email: null, phone: null })),
      ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        NotificationTriggersService,
        { provide: NotificationDispatcherService, useValue: dispatcher },
        { provide: RecipientResolutionService, useValue: recipients },
      ],
    }).compile();
    service = module.get(NotificationTriggersService);
  });

  it('userJoined reaches the staff roles with the TEAM-typed message', async () => {
    await service.userJoined(7, 'Priya', 'ADMIN');
    expect(recipients.resolveByRoles).toHaveBeenCalledWith(7, [UserRole.OWNER, UserRole.ADMIN]);
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        type: PlatformNotificationType.USER_JOINED,
        title: 'Priya Joined',
        recipients: staff,
      }),
    );
  });

  it.each([
    ['failed-test', 'AI key is failing'],
    ['credit-refused', 'AI key is out of credit'],
  ] as const)(
    'aiCredentialFailing (%s) reaches owners and admins, links to AI settings, names only the last four',
    async (cause, title) => {
      await service.aiCredentialFailing(7, { type: 'ANTHROPIC_KEY', lastFour: 'wxyz' }, cause);
      expect(recipients.resolveByRoles).toHaveBeenCalledWith(7, [UserRole.OWNER, UserRole.ADMIN]);
      const sent = dispatcher.dispatch.mock.calls[0][0];
      expect(sent).toMatchObject({
        tenantId: 7,
        type: PlatformNotificationType.AI_CREDENTIAL_FAILING,
        title,
        actionUrl: '/settings/ai',
      });
      expect(sent.message).toContain('Anthropic key ending wxyz');
    },
  );

  it('userRoleChanged notifies the person and every admin, once each', async () => {
    await service.userRoleChanged(7, 2, 'Arun', 'MEMBER', 'ADMIN');
    expect(recipients.resolveByUserIds).toHaveBeenCalledWith(7, [2, 1], { scopeToMembership: true });
    const { recipients: sent, type } = dispatcher.dispatch.mock.calls[0][0];
    expect(type).toBe(PlatformNotificationType.ROLE_CHANGED);
    expect(sent.map((r: { id: number }) => r.id)).toEqual([2, 1]);
  });

  it.each([
    ['integrationSyncCompleted', PlatformNotificationType.INTEGRATION_SYNC_COMPLETED, 'Sync Complete'],
    ['integrationSyncFailed', PlatformNotificationType.INTEGRATION_SYNC_FAILED, 'Sync Failed'],
  ] as const)('%s links staff to a web-app route, not the retired console', async (method, type, titleTail) => {
    await (service as any)[method](7, 'HubSpot', 'details');
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type, title: `HubSpot ${titleTail}`, actionUrl: '/settings/general' }),
    );
  });

  it('with neither roles nor ids there is nobody to resolve, and dispatch still runs the ledger path', async () => {
    recipients.resolveByRoles.mockResolvedValueOnce([]);
    await service.trigger({ tenantId: 7, type: PlatformNotificationType.SETTINGS_UPDATED, title: 't', message: 'm' });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ recipients: [] }));
  });
});
