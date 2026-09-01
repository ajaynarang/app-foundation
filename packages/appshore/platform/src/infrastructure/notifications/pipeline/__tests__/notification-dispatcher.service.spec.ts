import { Test } from '@nestjs/testing';
import { DeliveryChannel, NotificationCategory, NotificationType } from '@appshore/db';
import { NotificationDispatcherService } from '../notification-dispatcher.service';
import { ChannelResolutionService } from '../channel-resolution.service';
import { NotificationDeliveryService } from '../delivery.service';
import { DeliveryLedgerService } from '../delivery-ledger.service';
import { WhatsAppDispatchService } from '../../channels/whatsapp/whatsapp-dispatch.service';
import { NotificationPolicyRegistry } from '../../notification-policy.registry';
import { CHANNEL_RULES, NOTIFICATION_URGENCIES, policy } from '../../notification-policy';
import { PrismaService } from '../../../database/prisma.service';
import { PlansService } from '../../../../domains/plans/plans.service';
import { FeatureFlagsService } from '../../../../domains/feature-flags/feature-flags.service';

const TYPE = NotificationType.USER_INVITATION;
const plan = (primary: DeliveryChannel[]) => ({ primary, fallback: [], suppressed: {}, suppressedByQuietHours: false });

describe('NotificationDispatcherService', () => {
  let service: NotificationDispatcherService;
  const prisma = { tenant: { findUnique: jest.fn() } };
  const resolution = { resolveForAudience: jest.fn() };
  const delivery = { deliver: jest.fn() };
  const ledger = { recordOutcomes: jest.fn().mockResolvedValue(undefined) };
  const flags = { isEnabled: jest.fn() };
  const plans = { getTenantPlan: jest.fn(), isFeatureEnabled: jest.fn() };
  const whatsapp = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const recipients = [
    { id: 1, userId: 'u1', firebaseUid: null, email: null, phone: null },
    { id: 2, userId: 'u2', firebaseUid: null, email: null, phone: null },
  ];
  const message = { tenantId: 7, type: TYPE, title: 'Match', message: 'Court 1', recipients };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.tenant.findUnique.mockResolvedValue({ tenantId: 'demo', companyName: 'Smash Club' });
    flags.isEnabled.mockResolvedValue(true);
    plans.getTenantPlan.mockResolvedValue('PROFESSIONAL');
    plans.isFeatureEnabled.mockResolvedValue(true);
    resolution.resolveForAudience.mockImplementation(
      async ({ userIds }: any) =>
        new Map(userIds.map((id: number) => [id, plan([DeliveryChannel.IN_APP, DeliveryChannel.PUSH])])),
    );
    delivery.deliver.mockResolvedValue({ results: { IN_APP: true }, outcomes: [], pendingSends: [] });

    const module = await Test.createTestingModule({
      providers: [
        NotificationDispatcherService,
        { provide: PrismaService, useValue: prisma },
        { provide: ChannelResolutionService, useValue: resolution },
        { provide: NotificationDeliveryService, useValue: delivery },
        { provide: DeliveryLedgerService, useValue: ledger },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: PlansService, useValue: plans },
        { provide: WhatsAppDispatchService, useValue: whatsapp },
        {
          provide: NotificationPolicyRegistry,
          useValue: new NotificationPolicyRegistry({
            [TYPE]: policy(NotificationCategory.TEAM, NOTIFICATION_URGENCIES.TIMELY, { sms: CHANNEL_RULES.FALLBACK }),
          }),
        },
      ],
    }).compile();
    service = module.get(NotificationDispatcherService);
  });

  it('resolves tenant, flag and entitlement once per dispatch, not per recipient', async () => {
    await service.dispatch(message);
    expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(1);
    expect(flags.isEnabled).toHaveBeenCalledTimes(1);
    expect(plans.isFeatureEnabled).toHaveBeenCalledTimes(1);
    expect(delivery.deliver).toHaveBeenCalledTimes(2);
    expect(delivery.deliver.mock.calls[0][0]).toMatchObject({
      tenantSlug: 'demo',
      clubName: 'Smash Club',
      whatsappEnabled: true,
      whatsappEntitled: true,
      category: NotificationCategory.TEAM,
    });
  });

  it('writes the ledger before enqueueing WhatsApp — the job id is the ledger id', async () => {
    const order: string[] = [];
    ledger.recordOutcomes.mockImplementation(async () => void order.push('ledger'));
    whatsapp.enqueue.mockImplementation(async () => void order.push('queue'));
    delivery.deliver.mockResolvedValue({
      results: { WHATSAPP: true },
      outcomes: [],
      pendingSends: [{ deliveryId: 'd1', userId: 1, send: { templateName: 't', languageCode: 'en', bodyValues: [] } }],
    });

    await service.dispatch(message);

    expect(order).toEqual(['ledger', 'queue']);
    expect(whatsapp.enqueue).toHaveBeenCalledWith(expect.any(Array), { tenantId: 7, type: TYPE });
  });

  it('prefers a recipient-level title and metadata over the message', async () => {
    await service.dispatch({
      ...message,
      metadata: { tournamentId: 31 },
      recipients: [{ ...recipients[0], title: 'Aarav · Match', metadata: { tournamentId: 31, subjectUserId: 9 } }],
    });
    expect(delivery.deliver.mock.calls[0][0]).toMatchObject({ title: 'Aarav · Match', metadata: { subjectUserId: 9 } });
  });

  it('a recipient with nothing to attempt still gets ledger rows for the reasons', async () => {
    resolution.resolveForAudience.mockResolvedValue(
      new Map([
        [1, { primary: [], fallback: [], suppressed: { PUSH: 'USER_OPT_OUT' }, suppressedByQuietHours: false }],
      ]),
    );
    await service.dispatch({ ...message, recipients: [recipients[0]] });
    expect(delivery.deliver).not.toHaveBeenCalled();
    expect(ledger.recordOutcomes.mock.calls[0][0].recipients).toEqual([
      { userId: 1, outcomes: [{ channel: 'PUSH', status: 'SKIPPED', failureReason: 'USER_OPT_OUT' }] },
    ]);
  });

  it('throws when every recipient failed, not when one did', async () => {
    delivery.deliver.mockResolvedValueOnce({ results: { IN_APP: false }, outcomes: [], pendingSends: [] });
    await expect(service.dispatch(message)).resolves.toBeUndefined();

    delivery.deliver.mockResolvedValue({ results: { IN_APP: false, PUSH: false }, outcomes: [], pendingSends: [] });
    await expect(service.dispatch(message)).rejects.toThrow(/every recipient/);
  });

  it('a failed entitlement or tenant lookup degrades, never throws', async () => {
    plans.getTenantPlan.mockRejectedValue(new Error('plans down'));
    prisma.tenant.findUnique.mockRejectedValue(new Error('db down'));
    await service.dispatch(message);
    expect(delivery.deliver.mock.calls[0][0]).toMatchObject({ whatsappEntitled: false, clubName: 'Your club' });
  });
});
