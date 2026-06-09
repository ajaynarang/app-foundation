import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotificationDeliveryService } from '../delivery.service';
import { InAppNotificationService } from '../notifications.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DOMAIN_EVENTS } from '../../../infrastructure/events/domain-events.constants';
import { PushService } from '../../../infrastructure/push/push.service';
import { SmsService } from '../../../infrastructure/sms/sms.service';
import { EmailService } from '../../../infrastructure/notification/services/email.service';

describe('NotificationDeliveryService', () => {
  let service: NotificationDeliveryService;

  const mockInApp = { create: jest.fn() };
  const mockPrisma = { userPreferences: { findUnique: jest.fn() } };
  const mockEventEmitter = { emit: jest.fn() };
  const mockPush = { sendPushToUser: jest.fn() };
  const mockSms = {
    sendSms: jest.fn(),
    getIsConfigured: jest.fn().mockReturnValue(false),
  };
  const mockEmail = { sendEmail: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeliveryService,
        { provide: InAppNotificationService, useValue: mockInApp },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: PushService, useValue: mockPush },
        { provide: SmsService, useValue: mockSms },
        { provide: EmailService, useValue: mockEmail },
      ],
    }).compile();

    service = module.get<NotificationDeliveryService>(NotificationDeliveryService);
    jest.clearAllMocks();
  });

  describe('deliver', () => {
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
        channels: ['in_app'],
      });

      expect(mockInApp.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        DOMAIN_EVENTS.NOTIFICATION_SENT,
        expect.objectContaining({
          event: DOMAIN_EVENTS.NOTIFICATION_SENT,
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
        channels: ['in_app', 'push'],
      });

      expect(mockPush.sendPushToUser).toHaveBeenCalledWith(
        100,
        expect.objectContaining({
          title: 'Route Planned',
          body: 'Your route has been planned',
        }),
      );
    });

    it('should deliver SMS when phone is provided', async () => {
      mockSms.sendSms.mockResolvedValue(true);

      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'ROUTE_PLANNED',
        category: 'OPERATIONS',
        title: 'Route Planned',
        message: 'Your route has been planned',
        channels: ['sms'],
        recipientPhone: '+15551234567',
      });

      expect(mockSms.sendSms).toHaveBeenCalledWith('+15551234567', expect.stringContaining('Route Planned'));
    });

    it('should deliver email when email is provided', async () => {
      mockEmail.sendEmail.mockResolvedValue(undefined);

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'INVOICE_GENERATED',
        category: 'BILLING',
        title: 'Invoice Ready',
        message: 'Invoice INV-001 is ready',
        channels: ['email'],
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
      expect(results.email).toBe(true);
    });

    it('should handle in-app failure gracefully', async () => {
      mockInApp.create.mockRejectedValue(new Error('DB error'));

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['in_app'],
      });

      expect(results.in_app).toBe(false);
    });

    it('should handle email failure gracefully', async () => {
      mockEmail.sendEmail.mockRejectedValue(new Error('SMTP error'));

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['email'],
        recipientEmail: 'test@test.com',
      });

      expect(results.email).toBe(false);
    });

    it('should handle push failure gracefully', async () => {
      mockPush.sendPushToUser.mockRejectedValue(new Error('Push error'));

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['push'],
      });

      expect(results.push).toBe(false);
    });

    it('should handle SMS failure gracefully', async () => {
      mockSms.sendSms.mockRejectedValue(new Error('SMS error'));

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['sms'],
        recipientPhone: '+15551234567',
      });

      expect(results.sms).toBe(false);
    });

    it('should skip SSE when recipientUserId is not provided', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-3' });

      await service.deliver({
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['in_app'],
      });

      expect(mockInApp.create).toHaveBeenCalled();
      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should deliver to all channels simultaneously', async () => {
      mockInApp.create.mockResolvedValue({ notificationId: 'ntf-4' });
      mockEmail.sendEmail.mockResolvedValue(undefined);
      mockPush.sendPushToUser.mockResolvedValue(undefined);
      mockSms.sendSms.mockResolvedValue(true);

      const results = await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['in_app', 'email', 'push', 'sms'],
        recipientEmail: 'test@test.com',
        recipientPhone: '+15551234567',
      });

      expect(results.in_app).toBe(true);
      expect(results.email).toBe(true);
      expect(results.push).toBe(true);
      expect(results.sms).toBe(true);
    });

    it('should not deliver email without recipientEmail', async () => {
      await service.deliver({
        recipientUserId: 'user-1',
        recipientDbId: 100,
        tenantId: 1,
        type: 'TEST',
        category: 'SYSTEM',
        title: 'Test',
        message: 'Test',
        channels: ['email'],
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
        title: 'Test',
        message: 'Test',
        channels: ['sms'],
        // no recipientPhone
      });

      expect(mockSms.sendSms).not.toHaveBeenCalled();
    });
  });
});
