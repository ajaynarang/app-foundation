import { Test } from '@nestjs/testing';
import { NotificationTriggersService } from '../notification-triggers.service';
import { InAppNotificationService } from '../notifications.service';
import { ChannelResolutionService } from '../channel-resolution.service';
import { NotificationDeliveryService } from '../delivery.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

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

    it('invoiceGenerated sends BILLING notification to dispatchers', async () => {
      await service.invoiceGenerated(1, 'INV-001', 'LD-001', '$2,500');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INVOICE_GENERATED',
          category: 'BILLING',
          title: expect.stringContaining('INV-001'),
        }),
      );
    });

    it('invoiceSent sends BILLING notification', async () => {
      await service.invoiceSent(1, 'INV-001', 'Acme Corp');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INVOICE_SENT',
          title: expect.stringContaining('INV-001'),
          message: expect.stringContaining('Acme Corp'),
        }),
      );
    });

    it('settlementReady sends to OWNER and ADMIN roles', async () => {
      await service.settlementReady(1, 'SET-001', 'John Driver', '$3,000');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: { in: ['OWNER', 'ADMIN'] },
          }),
        }),
      );
    });

    it('userJoined sends TEAM notification', async () => {
      await service.userJoined(1, 'Jane Doe', 'DISPATCHER');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'USER_JOINED',
          category: 'TEAM',
          title: expect.stringContaining('Jane Doe'),
        }),
      );
    });

    it('driverActivated sends TEAM notification', async () => {
      await service.driverActivated(1, 'Bob Wilson');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DRIVER_ACTIVATED',
          category: 'TEAM',
          message: expect.stringContaining('Bob Wilson'),
        }),
      );
    });

    it('integrationSyncFailed sends SYSTEM notification', async () => {
      await service.integrationSyncFailed(1, 'Samsara', 'API key expired');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INTEGRATION_SYNC_FAILED',
          category: 'SYSTEM',
          message: 'API key expired',
        }),
      );
    });

    it('customerInvoiceSent sends to customer users only', async () => {
      // First call: customer users
      prisma.user.findMany
        .mockResolvedValueOnce([{ id: 50 }]) // customer query
        .mockResolvedValueOnce([
          {
            id: 50,
            userId: 'uid-50',
            firebaseUid: 'uid-50',
            email: 'cust@test.com',
            phone: null,
          },
        ]); // recipient resolve

      await service.customerInvoiceSent(1, 10, 'INV-002', '$1,500');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            role: 'CUSTOMER',
            customerId: 10,
          }),
        }),
      );
    });

    it('customerInvoiceSent skips when no customer users exist', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]); // no customer users

      await service.customerInvoiceSent(1, 10, 'INV-002', '$1,500');

      // deliver should not be called because there are no customer users
      expect(deliveryService.deliver).not.toHaveBeenCalled();
    });

    it('paymentReceived sends BILLING notification', async () => {
      await service.paymentReceived(1, 'INV-001', '$5,000', 'Acme Corp');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'PAYMENT_RECEIVED',
          category: 'BILLING',
          title: expect.stringContaining('INV-001'),
          message: expect.stringContaining('Acme Corp'),
        }),
      );
    });

    it('customerPaymentConfirmed sends to customer users only', async () => {
      prisma.user.findMany.mockResolvedValueOnce([{ id: 60 }]).mockResolvedValueOnce([
        {
          id: 60,
          userId: 'uid-60',
          firebaseUid: 'uid-60',
          email: 'cust@test.com',
          phone: null,
        },
      ]);

      await service.customerPaymentConfirmed(1, 10, 'INV-003', '$2,000');

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ role: 'CUSTOMER', customerId: 10 }),
        }),
      );
    });

    it('customerPaymentConfirmed skips when no customer users', async () => {
      prisma.user.findMany.mockResolvedValueOnce([]);

      await service.customerPaymentConfirmed(1, 10, 'INV-003', '$2,000');
      expect(deliveryService.deliver).not.toHaveBeenCalled();
    });

    it('driverPaymentProcessed sends to specific driver user', async () => {
      await service.driverPaymentProcessed(1, 42, 'STL-001', '$3,000');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DRIVER_PAYMENT_PROCESSED',
          category: 'BILLING',
        }),
      );
    });

    it('driverDeactivated includes reason when provided', async () => {
      await service.driverDeactivated(1, 'John Doe', 'Left company');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DRIVER_DEACTIVATED',
          message: expect.stringContaining('Left company'),
        }),
      );
    });

    it('driverDeactivated works without reason', async () => {
      await service.driverDeactivated(1, 'John Doe');

      expect(deliveryService.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DRIVER_DEACTIVATED',
          message: 'John Doe has been deactivated',
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

      await service.userRoleChanged(1, 42, 'Jane Doe', 'DISPATCHER', 'ADMIN');

      expect(deliveryService.deliver).toHaveBeenCalled();
    });

    it('integrationSyncCompleted sends SYSTEM notification', async () => {
      await service.integrationSyncCompleted(1, 'Samsara', '10 drivers synced');

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
