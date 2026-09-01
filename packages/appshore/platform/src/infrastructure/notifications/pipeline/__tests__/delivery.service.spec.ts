import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationDeliveryService } from '../delivery.service';
import { InAppChannelService } from '../../channels/in-app/in-app-channel.service';
import { PrismaService } from '../../../database/prisma.service';
import { FOUNDATION_DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import { PushService } from '../../channels/push/web-push.service';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { EmailService } from '../../../notification/services/email.service';
import { FcmService } from '../../channels/push/fcm.service';
import { DeliveryChannel } from '@appshore/db';
import { WHATSAPP_PORT } from '../../channels/whatsapp/whatsapp.port';
import {
  WhatsAppTemplateRegistry,
  allParams,
  requiredParam,
  type WhatsAppTemplateMap,
} from '../../channels/whatsapp/whatsapp-template.registry';

/** The one template these tests render; ENTRY_WITHDRAWN deliberately has none. */
const TEMPLATES: WhatsAppTemplateMap = {
  INTEGRATION_SYNC_COMPLETED: {
    name: 'tx_draw_published_v1',
    languageCode: 'en',
    category: 'UTILITY',
    body: 'The draw is out: {{1}} — {{2}} via the platform.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.message), requiredParam(ctx.clubName)),
  },
  USER_INVITATION: {
    name: 'tx_match_scheduled_v1',
    languageCode: 'en',
    category: 'UTILITY',
    body: 'Your team: {{1}} — {{2}}.',
    bodyValues: (ctx) => allParams(requiredParam(ctx.message), requiredParam(ctx.clubName)),
  },
};

/** Every planned channel is primary unless a test says otherwise. */
const plan = (...primary: DeliveryChannel[]) => ({ primary, fallback: [] as DeliveryChannel[], suppressed: {} });

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;

  const mockInApp = { create: jest.fn() };
  const mockPrisma = {
    userPreferences: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  const mockEventEmitter = { emit: jest.fn() };
  const mockPush = { sendPushToUser: jest.fn() };
  const mockFcm = { sendToUser: jest.fn() };
  const mockSms = {
    sendSms: jest.fn(),
    getIsConfigured: jest.fn().mockReturnValue(false),
  };
  const mockEmail = { sendEmail: jest.fn() };
  const mockWhatsApp = { isConfigured: true };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        { provide: InAppChannelService, useValue: mockInApp },
        { provide: WhatsAppTemplateRegistry, useValue: new WhatsAppTemplateRegistry(TEMPLATES) },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PushService, useValue: mockPush },
        { provide: FcmService, useValue: mockFcm },
        { provide: SmsService, useValue: mockSms },
        { provide: EmailService, useValue: mockEmail },
        { provide: WHATSAPP_PORT, useValue: mockWhatsApp },
      ],
    }).compile();

    service = module.get<NotificationDeliveryService>(NotificationDeliveryService);
    jest.clearAllMocks();
  });

  describe('deliver', () => {
    it('drops a test-marker delivery across EVERY channel (E57-5)', async () => {
      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'SSE live test (delete me)',
        message: 'anything',
        channels: plan(DeliveryChannel.IN_APP, DeliveryChannel.PUSH, DeliveryChannel.EMAIL, DeliveryChannel.SMS),
      });

      expect(mockInApp.create).not.toHaveBeenCalled();
      expect(mockPush.sendPushToUser).not.toHaveBeenCalled();
      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
      expect(mockSms.sendSms).not.toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
      expect(results).toEqual({});
    });

    it('does not call push a success when the user has no device', async () => {
      // Both transports resolve with 0 for a user who has never registered.
      // Reporting true here is what kept the iOS dead-push window invisible.
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-y' });
      mockPush.sendPushToUser.mockResolvedValue(0);
      mockFcm.sendToUser.mockResolvedValue(0);

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'Match scheduled',
        message: 'Court 1',
        channels: plan(DeliveryChannel.PUSH),
      });

      expect(results.PUSH).toBe(false);
    });

    it('counts push a success when at least one device was reached', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-z' });
      mockPush.sendPushToUser.mockResolvedValue(0);
      mockFcm.sendToUser.mockResolvedValue(2);

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'TEAM',
        title: 'Match scheduled',
        message: 'Court 1',
        channels: plan(DeliveryChannel.PUSH),
      });

      expect(results.PUSH).toBe(true);
    });

    it('labels the email link "View Details" when the trigger gave no label', async () => {
      mockEmail.sendEmail.mockResolvedValue(undefined);
      await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'INTEGRATION_SYNC_COMPLETED',
        category: 'SYSTEM',
        title: 'Draw',
        message: 'Out',
        actionUrl: 'https://app.example/draws/1',
        recipientEmail: 'p@example.com',
        channels: plan(DeliveryChannel.EMAIL),
      });
      expect(mockEmail.sendEmail.mock.calls[0][0].html).toContain('>View Details</a>');
    });

    it('escapes organizer free text in the email body', async () => {
      // A coach types the cancellation reason; it reaches every parent's inbox.
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-x' });

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_JOINED',
        category: 'TEAM',
        title: 'Class cancelled',
        message: 'Under-13 is off. <img src=x onerror="fetch(\'https://evil.example\')">',
        channels: plan(DeliveryChannel.EMAIL),
        recipientEmail: 'parent@example.com',
      });

      const sent = mockEmail.sendEmail.mock.calls[0][0];
      expect(sent.html).not.toContain('<img');
      expect(sent.html).toContain('&lt;img');
    });

    it('should always deliver in-app and emit NOTIFICATION_SENT', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-1' });

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'Route Planned',
        message: 'Your route has been planned',
        channels: plan(DeliveryChannel.IN_APP),
      });

      expect(mockInApp.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        FOUNDATION_DOMAIN_EVENTS.NOTIFICATION_SENT,
        expect.objectContaining({
          event: FOUNDATION_DOMAIN_EVENTS.NOTIFICATION_SENT,
          tenantId: '1',
          data: expect.objectContaining({
            notificationId: 'ntf-1',
            recipientUserIds: ['user-1'],
          }),
        }),
      );
    });

    it('should deliver to push when requested', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-2' });
      mockPush.sendPushToUser.mockResolvedValue(undefined);

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'Route Planned',
        message: 'Your route has been planned',
        channels: plan(DeliveryChannel.IN_APP, DeliveryChannel.PUSH),
      });

      expect(mockPush.sendPushToUser).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: 'Route Planned',
          body: 'Your route has been planned',
        }),
      );
    });

    it('includes the string tenantId in the FCM data payload', async () => {
      // The app compares a push's club against the session's active workspace,
      // and the session identifies its workspace by the STRING tenant id. A
      // numeric db id would never match, so every push would look cross-club.
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-3' });
      mockPush.sendPushToUser.mockResolvedValue(undefined);
      mockFcm.sendToUser.mockResolvedValue(undefined);

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 42,
        tenantSlug: 'TNT-INDIRANAGAR',
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Match 12',
        message: 'Court 3, 9:40am',
        actionUrl: '/matches/12',
        channels: plan(DeliveryChannel.PUSH),
      });

      expect(mockFcm.sendToUser).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          data: expect.objectContaining({
            actionUrl: '/matches/12',
            tenantId: 'TNT-INDIRANAGAR',
          }),
        }),
      );
    });

    it('still sends the push when no tenant slug was resolved', async () => {
      // Fail open: a push without a tenant routes exactly as it always did
      // (PushMessage.isForTenant treats an absent tenant as "mine"). Losing the
      // notification entirely would be far worse than losing the club check.
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-4' });
      mockPush.sendPushToUser.mockResolvedValue(undefined);
      mockFcm.sendToUser.mockResolvedValue(undefined);

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 42,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Match 12',
        message: 'Court 3, 9:40am',
        channels: plan(DeliveryChannel.PUSH),
      });

      expect(mockFcm.sendToUser).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          data: expect.not.objectContaining({ tenantId: expect.anything() }),
        }),
      );
    });

    it('should deliver SMS when phone is provided', async () => {
      mockSms.getIsConfigured.mockReturnValueOnce(true);
      mockSms.sendSms.mockResolvedValue(true);

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'Route Planned',
        message: 'Your route has been planned',
        channels: plan(DeliveryChannel.SMS),
        recipientPhone: '+15551234567',
      });

      expect(mockSms.sendSms).toHaveBeenCalledWith('+15551234567', expect.stringContaining('Route Planned'));
    });

    it('should deliver email when email is provided', async () => {
      mockEmail.sendEmail.mockResolvedValue(undefined);

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'INVOICE_GENERATED',
        category: 'BILLING',
        title: 'Invoice Ready',
        message: 'Invoice INV-001 is ready',
        channels: plan(DeliveryChannel.EMAIL),
        recipientEmail: 'billing@test.com',
        actionUrl: 'https://app.example.com/billing',
        actionLabel: 'View Billing',
      });

      expect(mockEmail.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'billing@test.com',
          subject: expect.stringContaining('Invoice Ready'),
          html: expect.stringContaining('View Billing'),
        }),
      );
      expect(results.EMAIL).toBe(true);
    });

    it('should handle in-app failure gracefully', async () => {
      mockInApp.create.mockRejectedValue(new Error('DB error'));

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.IN_APP),
      });

      expect(results.IN_APP).toBe(false);
    });

    it('should handle email failure gracefully', async () => {
      mockEmail.sendEmail.mockRejectedValue(new Error('SMTP error'));

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.EMAIL),
        recipientEmail: 'test@test.com',
      });

      expect(results.EMAIL).toBe(false);
    });

    it('should handle push failure gracefully', async () => {
      mockPush.sendPushToUser.mockRejectedValue(new Error('Push error'));

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.PUSH),
      });

      expect(results.PUSH).toBe(false);
    });

    it('should handle SMS failure gracefully', async () => {
      mockSms.getIsConfigured.mockReturnValueOnce(true);
      mockSms.sendSms.mockRejectedValue(new Error('SMS error'));

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.SMS),
        recipientPhone: '+15551234567',
      });

      expect(results.SMS).toBe(false);
    });

    it('should skip SSE when recipientUserId is not provided', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-3' });

      await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.IN_APP),
      });

      expect(mockInApp.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should deliver to all channels simultaneously', async () => {
      mockSms.getIsConfigured.mockReturnValueOnce(true);
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-4' });
      mockEmail.sendEmail.mockResolvedValue(undefined);
      mockPush.sendPushToUser.mockResolvedValue(1);
      mockFcm.sendToUser.mockResolvedValue(1);
      mockSms.sendSms.mockResolvedValue(true);

      const { results } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.IN_APP, DeliveryChannel.EMAIL, DeliveryChannel.PUSH, DeliveryChannel.SMS),
        recipientEmail: 'test@test.com',
        recipientPhone: '+15551234567',
      });

      expect(results.IN_APP).toBe(true);
      expect(results.EMAIL).toBe(true);
      expect(results.PUSH).toBe(true);
      expect(results.SMS).toBe(true);
    });

    it('should not deliver email without recipientEmail', async () => {
      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.EMAIL),
        // no recipientEmail
      });

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should not deliver SMS without recipientPhone', async () => {
      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Match update',
        message: 'Details inside',
        channels: plan(DeliveryChannel.SMS),
        // no recipientPhone
      });

      expect(mockSms.sendSms).not.toHaveBeenCalled();
    });
  });
  describe('outcomes', () => {
    it('records SENT / FAILED / SKIPPED per channel — a missing address is a row, not silence', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'n1' });
      mockPush.sendPushToUser.mockResolvedValue(0);
      mockFcm.sendToUser.mockResolvedValue(0);

      const { outcomes } = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3, 6pm',
        message: 'vs Rahul',
        channels: plan(DeliveryChannel.IN_APP, DeliveryChannel.PUSH, DeliveryChannel.EMAIL, DeliveryChannel.SMS),
        // no recipientEmail, no recipientPhone
      });

      expect(outcomes).toHaveLength(4);
      expect(outcomes).toEqual(
        expect.arrayContaining([
          { channel: 'IN_APP', status: 'SENT' },
          { channel: 'EMAIL', status: 'SKIPPED', failureReason: 'NO_ADDRESS' },
          { channel: 'PUSH', status: 'FAILED', failureReason: 'NO_DEVICE' },
          { channel: 'SMS', status: 'SKIPPED', failureReason: 'NO_ADDRESS' },
        ]),
      );
    });

    it('records a provider error as FAILED / provider_error', async () => {
      mockEmail.sendEmail.mockRejectedValueOnce(new Error('smtp down'));
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3',
        message: 'x',
        channels: plan(DeliveryChannel.EMAIL),
        recipientEmail: 'a@b.c',
      });
      expect(outcomes).toEqual([{ channel: 'EMAIL', status: 'FAILED', failureReason: 'PROVIDER_ERROR' }]);
    });

    it('records a dropped test-marker send as SKIPPED on every requested channel', async () => {
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'SSE live test (delete me)',
        message: 'x',
        channels: plan(DeliveryChannel.IN_APP, DeliveryChannel.PUSH),
      });
      expect(outcomes).toEqual([
        { channel: 'IN_APP', status: 'SKIPPED', failureReason: 'DROPPED_TEST_MARKER' },
        { channel: 'PUSH', status: 'SKIPPED', failureReason: 'DROPPED_TEST_MARKER' },
      ]);
    });

    it('records only the channels that were requested', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'n1' });
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3',
        message: 'x',
        channels: plan(DeliveryChannel.IN_APP),
      });
      expect(outcomes).toEqual([{ channel: 'IN_APP', status: 'SENT' }]);
    });
    it('records the in-app row the service itself dropped as SKIPPED, not SENT', async () => {
      mockInApp.create.mockResolvedValue(null);
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3',
        message: 'x',
        channels: plan(DeliveryChannel.IN_APP),
      });
      expect(outcomes).toEqual([{ channel: 'IN_APP', status: 'SKIPPED', failureReason: 'DROPPED_TEST_MARKER' }]);
    });

    it('records SMS as SKIPPED / not_configured when there is no Twilio — that is not a provider error', async () => {
      mockSms.getIsConfigured.mockReturnValueOnce(false);
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3',
        message: 'x',
        channels: plan(DeliveryChannel.SMS),
        recipientPhone: '+919876543210',
      });
      expect(mockSms.sendSms).not.toHaveBeenCalled();
      expect(outcomes).toEqual([{ channel: 'SMS', status: 'SKIPPED', failureReason: 'NOT_CONFIGURED' }]);
    });

    it('records an SMS the provider declined as FAILED — a false return is not a send', async () => {
      mockSms.getIsConfigured.mockReturnValueOnce(true);
      mockSms.sendSms.mockResolvedValueOnce(false);
      const { outcomes } = await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'USER_INVITATION',
        category: 'OPERATIONS',
        title: 'Court 3',
        message: 'x',
        channels: plan(DeliveryChannel.SMS),
        recipientPhone: '+919876543210',
      });
      expect(outcomes).toEqual([{ channel: 'SMS', status: 'FAILED', failureReason: 'PROVIDER_ERROR' }]);
    });
  });
  describe('whatsapp', () => {
    const base = {
      recipientDbId: 100,
      tenantId: 1,
      category: 'TEAM',
      title: 'The draw is out',
      message: 'Men’s Singles',
      channels: plan(DeliveryChannel.WHATSAPP),
      clubName: 'Smash Club',
      whatsappEnabled: true,
      whatsappEntitled: true,
      recipientPhone: '+919876543210',
    };

    it('emits a QUEUED outcome with a pre-generated ledger id and the send spec — nothing is sent here', async () => {
      const { outcomes, pendingSends, results } = await service.deliver({
        ...base,
        type: 'INTEGRATION_SYNC_COMPLETED',
      });

      expect(outcomes).toEqual([
        { channel: 'WHATSAPP', status: 'QUEUED', deliveryId: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      ]);
      expect(pendingSends).toEqual([
        {
          deliveryId: outcomes[0].deliveryId,
          userId: 100,
          send: {
            templateName: 'tx_draw_published_v1',
            languageCode: 'en',
            bodyValues: ['Men’s Singles', 'Smash Club'],
          },
        },
      ]);
      // Queued counts as reached: the trigger's nobody-reached guard releases reminder claims.
      expect(results.WHATSAPP).toBe(true);
    });

    it.each([
      ['no phone', { recipientPhone: undefined }, 'NO_ADDRESS'],
      ['flag off', { whatsappEnabled: false }, 'FLAG_OFF'],
      ['club not on Pro', { whatsappEntitled: false }, 'NOT_ENTITLED'],
      [
        'flag off AND not on Pro — the flag is the reason',
        { whatsappEnabled: false, whatsappEntitled: false },
        'FLAG_OFF',
      ],
      ['no template for the type', { type: 'INTEGRATION_SYNC_FAILED' }, 'NO_TEMPLATE'],
    ])('%s → SKIPPED, nothing pending', async (_label, override, reason) => {
      const { outcomes, pendingSends, results } = await service.deliver({
        ...base,
        type: 'INTEGRATION_SYNC_COMPLETED',
        ...override,
      });
      expect(outcomes).toEqual([{ channel: 'WHATSAPP', status: 'SKIPPED', failureReason: reason }]);
      expect(pendingSends).toEqual([]);
      expect(results.WHATSAPP).toBeUndefined();
    });

    it('a missing club name cannot fill the template — SKIPPED/NO_TEMPLATE, never a half-filled send', async () => {
      const { outcomes, pendingSends } = await service.deliver({
        ...base,
        type: 'INTEGRATION_SYNC_COMPLETED',
        clubName: undefined,
      });
      expect(outcomes[0]).toMatchObject({ status: 'SKIPPED', failureReason: 'NO_TEMPLATE' });
      expect(pendingSends).toEqual([]);
    });

    it('port not configured → SKIPPED/NOT_CONFIGURED', async () => {
      mockWhatsApp.isConfigured = false;
      const { outcomes } = await service.deliver({ ...base, type: 'INTEGRATION_SYNC_COMPLETED' });
      expect(outcomes[0]).toMatchObject({ status: 'SKIPPED', failureReason: 'NOT_CONFIGURED' });
      mockWhatsApp.isConfigured = true;
    });

    it('honours the test-marker drop like every other channel', async () => {
      const { outcomes, pendingSends } = await service.deliver({
        ...base,
        type: 'INTEGRATION_SYNC_COMPLETED',
        title: 'SSE live test (delete me)',
      });
      expect(outcomes[0]).toMatchObject({ status: 'SKIPPED', failureReason: 'DROPPED_TEST_MARKER' });
      expect(pendingSends).toEqual([]);
    });

    it('a delivery without WHATSAPP in its channels never mentions it', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'n1' });
      const { outcomes, pendingSends } = await service.deliver({
        ...base,
        type: 'INTEGRATION_SYNC_COMPLETED',
        channels: plan(DeliveryChannel.IN_APP),
      });
      expect(outcomes.map((o) => o.channel)).toEqual(['IN_APP']);
      expect(pendingSends).toEqual([]);
    });
  });

  describe('fallback channels', () => {
    const base = {
      recipientUserId: 'user-1',
      recipientDbId: 100,
      tenantId: 1,
      type: 'USER_INVITATION',
      category: 'TEAM',
      title: 'Your match is scheduled',
      message: 'Court 1 at 10:00',
      recipientPhone: '+919876543210',
      clubName: 'Smash Club',
      whatsappEnabled: true,
      whatsappEntitled: true,
    };
    const withFallback = (primary: DeliveryChannel[], fallback: DeliveryChannel[]) => ({
      primary,
      fallback,
      suppressed: {},
    });

    beforeEach(() => {
      mockInApp.create.mockResolvedValue({ notificationId: 'n1' });
      mockSms.getIsConfigured.mockReturnValue(true);
      mockSms.sendSms.mockResolvedValue(true);
    });
    afterEach(() => mockSms.getIsConfigured.mockReturnValue(false));

    it('sends the fallback SMS when push reached no device', async () => {
      mockPush.sendPushToUser.mockResolvedValue(0);
      mockFcm.sendToUser.mockResolvedValue(0);

      const { outcomes, results } = await service.deliver({
        ...base,
        channels: withFallback([DeliveryChannel.IN_APP, DeliveryChannel.PUSH], [DeliveryChannel.SMS]),
      });

      expect(mockSms.sendSms).toHaveBeenCalledTimes(1);
      expect(results.SMS).toBe(true);
      expect(outcomes).toEqual(
        expect.arrayContaining([
          { channel: 'PUSH', status: 'FAILED', failureReason: 'NO_DEVICE' },
          { channel: 'SMS', status: 'SENT' },
        ]),
      );
    });

    it('skips the fallback SMS as PRIMARY_REACHED when push reached a device', async () => {
      mockPush.sendPushToUser.mockResolvedValue(1);
      mockFcm.sendToUser.mockResolvedValue(0);

      const { outcomes, results } = await service.deliver({
        ...base,
        channels: withFallback([DeliveryChannel.IN_APP, DeliveryChannel.PUSH], [DeliveryChannel.SMS]),
      });

      expect(mockSms.sendSms).not.toHaveBeenCalled();
      expect(results.SMS).toBeUndefined();
      expect(outcomes).toContainEqual({ channel: 'SMS', status: 'SKIPPED', failureReason: 'PRIMARY_REACHED' });
    });

    it('skips the fallback SMS when WhatsApp was queued — the cheaper channel replaces it', async () => {
      mockPush.sendPushToUser.mockResolvedValue(0);
      mockFcm.sendToUser.mockResolvedValue(0);

      const { outcomes } = await service.deliver({
        ...base,
        channels: withFallback([DeliveryChannel.PUSH, DeliveryChannel.WHATSAPP], [DeliveryChannel.SMS]),
      });

      expect(mockSms.sendSms).not.toHaveBeenCalled();
      expect(outcomes).toContainEqual({ channel: 'SMS', status: 'SKIPPED', failureReason: 'PRIMARY_REACHED' });
      expect(outcomes).toContainEqual(expect.objectContaining({ channel: 'WHATSAPP', status: 'QUEUED' }));
    });

    it.each([DeliveryChannel.SMS, DeliveryChannel.EMAIL])(
      'treats any channel declared as fallback the same way — %s fires only when nothing primary reached',
      async (channel) => {
        mockPush.sendPushToUser.mockResolvedValue(1);
        mockFcm.sendToUser.mockResolvedValue(0);
        mockEmail.sendEmail.mockResolvedValue(undefined);

        const skippedRun = await service.deliver({
          ...base,
          recipientEmail: 'p@example.com',
          channels: withFallback([DeliveryChannel.PUSH], [channel]),
        });
        expect(skippedRun.outcomes).toContainEqual({ channel, status: 'SKIPPED', failureReason: 'PRIMARY_REACHED' });

        mockPush.sendPushToUser.mockResolvedValue(0);
        const sentRun = await service.deliver({
          ...base,
          recipientEmail: 'p@example.com',
          channels: withFallback([DeliveryChannel.PUSH], [channel]),
        });
        expect(sentRun.outcomes).toContainEqual({ channel, status: 'SENT' });
      },
    );

    it('sends the fallback SMS when push was never planned — the user chose no push, not no contact', async () => {
      const { outcomes } = await service.deliver({
        ...base,
        channels: withFallback([DeliveryChannel.IN_APP], [DeliveryChannel.SMS]),
      });

      expect(mockSms.sendSms).toHaveBeenCalledTimes(1);
      expect(outcomes).toContainEqual({ channel: 'SMS', status: 'SENT' });
    });

    it('records every suppressed channel as SKIPPED with its reason', async () => {
      const { outcomes } = await service.deliver({
        ...base,
        channels: {
          primary: [DeliveryChannel.IN_APP],
          fallback: [],
          suppressed: { [DeliveryChannel.EMAIL]: 'USER_OPT_OUT', [DeliveryChannel.WHATSAPP]: 'NO_CONSENT' },
        },
      });

      expect(outcomes).toEqual(
        expect.arrayContaining([
          { channel: 'EMAIL', status: 'SKIPPED', failureReason: 'USER_OPT_OUT' },
          { channel: 'WHATSAPP', status: 'SKIPPED', failureReason: 'NO_CONSENT' },
          { channel: 'IN_APP', status: 'SENT' },
        ]),
      );
    });

    it('drops a test marker across primary, fallback and suppressed channels alike', async () => {
      const { outcomes } = await service.deliver({
        ...base,
        title: 'SSE live test (delete me)',
        channels: {
          primary: [DeliveryChannel.IN_APP],
          fallback: [DeliveryChannel.SMS],
          suppressed: { [DeliveryChannel.EMAIL]: 'USER_OPT_OUT' },
        },
      });

      expect(outcomes.map((o) => o.channel).sort()).toEqual(['EMAIL', 'IN_APP', 'SMS']);
      expect(outcomes.every((o) => o.failureReason === 'DROPPED_TEST_MARKER')).toBe(true);
      expect(mockSms.sendSms).not.toHaveBeenCalled();
    });
  });
});
