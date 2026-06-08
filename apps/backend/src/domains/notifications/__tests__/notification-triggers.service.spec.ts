import { Test } from '@nestjs/testing';
import { NotificationTriggersService } from '../notification-triggers.service';
import { InAppNotificationService } from '../notifications.service';
import { ChannelResolutionService } from '../channel-resolution.service';
import { NotificationDeliveryService } from '../delivery.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('NotificationTriggersService', () => {
  let service: NotificationTriggersService;
  let channelResolution: { resolveForNotification: jest.Mock };
  let inAppService: { create: jest.Mock };
  let deliveryService: { deliver: jest.Mock };
  let prisma: {
    user: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    channelResolution = { resolveForNotification: jest.fn() };
    inAppService = {
      create: jest.fn().mockResolvedValue({ notificationId: 'test-notif-id' }),
    };
    deliveryService = {
      deliver: jest.fn().mockResolvedValue({ in_app: true }),
    };
    prisma = {
      user: { findMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        NotificationTriggersService,
        { provide: PrismaService, useValue: prisma },
        { provide: InAppNotificationService, useValue: inAppService },
        { provide: ChannelResolutionService, useValue: channelResolution },
        { provide: NotificationDeliveryService, useValue: deliveryService },
      ],
    }).compile();
    service = module.get(NotificationTriggersService);
  });

  it('delivers via DeliveryService with resolved preferences', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 1, userId: 'uid-1', firebaseUid: 'uid-1', email: 'test@example.com', phone: null },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: false,
      showBrowserNotification: true,
      flashTab: true,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: false,
      skipSms: false,
    });

    await service.trigger({
      tenantId: 1,
      type: 'INVOICE_GENERATED' as any,
      category: 'BILLING',
      title: 'Test',
      message: 'Test message',
      recipientUserIds: [1],
    });

    expect(channelResolution.resolveForNotification).toHaveBeenCalledWith({
      userId: 1,
      category: 'BILLING',
    });
    expect(deliveryService.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'uid-1',
        recipientDbId: 1,
        channels: expect.arrayContaining(['in_app', 'email', 'sms', 'push']),
        recipientEmail: 'test@example.com',
      }),
    );
  });

  it('skips all channels when all are disabled for the category', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 1, userId: 'uid-1', firebaseUid: 'uid-1', email: 'test@example.com', phone: null },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: false,
      showBrowserNotification: false,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: true,
      skipEmail: true,
      skipSms: true,
    });

    await service.trigger({
      tenantId: 1,
      type: 'INVOICE_GENERATED' as any,
      category: 'BILLING',
      title: 'Test',
      message: 'Test message',
      recipientUserIds: [1],
    });

    // When all channels disabled, deliveryService should not be called
    expect(deliveryService.deliver).not.toHaveBeenCalled();
  });

  it('resolves recipients by role and delivers to each', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 10,
        userId: 'uid-10',
        firebaseUid: 'uid-10',
        email: 'admin1@example.com',
        phone: null,
      },
      {
        id: 20,
        userId: 'uid-20',
        firebaseUid: 'uid-20',
        email: 'admin2@example.com',
        phone: null,
      },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: true,
      showBrowserNotification: true,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: false,
      skipSms: false,
    });

    await service.trigger({
      tenantId: 5,
      type: 'SETTLEMENT_READY' as any,
      category: 'BILLING',
      title: 'Test',
      message: 'Test',
      recipientRoles: ['OWNER', 'ADMIN'],
    });

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 5,
          role: { in: ['OWNER', 'ADMIN'] },
        }),
      }),
    );
    expect(deliveryService.deliver).toHaveBeenCalledTimes(2);
  });

  it('includes SMS channel when skipSms is false and phone exists', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 1,
        firebaseUid: 'uid-1',
        email: 'test@example.com',
        phone: '+15551234567',
      },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: true,
      showBrowserNotification: true,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: false,
      skipSms: false,
    });

    await service.trigger({
      tenantId: 1,
      type: 'PAYMENT_RECEIVED' as any,
      category: 'BILLING',
      title: 'Payment',
      message: 'Payment received',
      recipientUserIds: [1],
    });

    expect(deliveryService.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.arrayContaining(['in_app', 'email', 'sms', 'push']),
        recipientPhone: '+15551234567',
      }),
    );
  });

  it('passes undefined recipientUserId when userId is missing', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 1, userId: '', firebaseUid: null, email: 'test@example.com', phone: null },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: true,
      showBrowserNotification: true,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: false,
      skipSms: false,
    });

    await service.trigger({
      tenantId: 1,
      type: 'INVOICE_GENERATED' as any,
      category: 'BILLING',
      title: 'Test',
      message: 'Test',
      recipientUserIds: [1],
    });

    expect(deliveryService.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: undefined,
        recipientDbId: 1,
      }),
    );
  });

  it('does not include email/sms/push channels when skipEmail and skipSms are true', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: 1,
        firebaseUid: 'uid-1',
        email: 'test@example.com',
        phone: '+15551234567',
      },
    ]);
    channelResolution.resolveForNotification.mockResolvedValue({
      playSound: false,
      showBrowserNotification: false,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: true,
      skipSms: true,
    });

    await service.trigger({
      tenantId: 1,
      type: 'INVOICE_GENERATED' as any,
      category: 'BILLING',
      title: 'Test',
      message: 'Test',
      recipientUserIds: [1],
    });

    expect(deliveryService.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: ['in_app'],
        recipientEmail: undefined,
        recipientPhone: undefined,
      }),
    );
  });

  // ─── Convenience methods ───

  describe('convenience trigger methods', () => {
    const allChannelsPrefs = {
      playSound: false,
      showBrowserNotification: true,
      flashTab: false,
      suppressedByQuietHours: false,
      skipInApp: false,
      skipEmail: false,
      skipSms: false,
    };

    beforeEach(() => {
      prisma.user.findMany.mockResolvedValue([
        { id: 1, userId: 'uid-1', firebaseUid: 'uid-1', email: 'admin@test.com', phone: null },
      ]);
      channelResolution.resolveForNotification.mockResolvedValue(allChannelsPrefs);
    });

    it('userJoined sends TEAM notification', async () => {
      await service.userJoined(1, 'Jane Doe', 'MEMBER');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'USER_JOINED',
          category: 'TEAM',
          title: expect.stringContaining('Jane Doe'),
        }),
      );
    });

    it('integrationSyncFailed sends SYSTEM notification', async () => {
      await service.integrationSyncFailed(1, 'QuickBooks', 'API key expired');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTEGRATION_SYNC_FAILED',
          category: 'SYSTEM',
          message: 'API key expired',
        }),
      );
    });

    it('userRoleChanged notifies both user and admins', async () => {
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 5 }, { id: 10 }]) // admins
        .mockResolvedValueOnce([
          { id: 5, userId: 'uid-5', firebaseUid: 'uid-5', email: 'a@t.com', phone: null },
          { id: 10, userId: 'uid-10', firebaseUid: 'uid-10', email: 'b@t.com', phone: null },
          { id: 42, userId: 'uid-42', firebaseUid: 'uid-42', email: 'c@t.com', phone: null },
        ]);

      await service.userRoleChanged(1, 42, 'Jane Doe', 'MEMBER', 'ADMIN');

      expect(deliveryService.deliver).toHaveBeenCalled();
    });

    it('integrationSyncCompleted sends SYSTEM notification', async () => {
      await service.integrationSyncCompleted(1, 'QuickBooks', '10 records synced');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTEGRATION_SYNC_COMPLETED',
          category: 'SYSTEM',
        }),
      );
    });
  });

  // ─── Error handling ───

  describe('error handling', () => {
    it('should not throw when recipient delivery fails', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 1, userId: 'uid-1', firebaseUid: 'uid-1', email: 'test@test.com', phone: null },
      ]);
      channelResolution.resolveForNotification.mockRejectedValue(new Error('Channel resolution failed'));

      // Should not throw
      await service.trigger({
        tenantId: 1,
        type: 'INVOICE_GENERATED' as any,
        category: 'BILLING',
        title: 'Test',
        message: 'Test',
        recipientUserIds: [1],
      });

      expect(deliveryService.deliver).not.toHaveBeenCalled();
    });

    it('should return empty recipients when no roles or user IDs specified', async () => {
      await service.trigger({
        tenantId: 1,
        type: 'INVOICE_GENERATED' as any,
        category: 'BILLING',
        title: 'Test',
        message: 'Test',
      });

      expect(deliveryService.deliver).not.toHaveBeenCalled();
    });
  });
});
