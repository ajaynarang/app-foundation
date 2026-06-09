import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from '../notification.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { EmailService } from '../services/email.service';
import { NotificationType, NotificationStatus } from '@prisma/client';

describe('NotificationService', () => {
  let service: NotificationService;
  let emailService: EmailService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
    notification: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const mockEmailService = {
    sendEmail: jest.fn(),
    sendTenantRegistrationEmail: jest.fn(),
    sendTenantApprovalEmail: jest.fn(),
    sendTenantRejectionEmail: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'TENANT_BASE_URL') return 'app.appshore.in';
      if (key === 'USE_TENANT_SUBDOMAINS') return true;
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    emailService = module.get<EmailService>(EmailService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAndSendNotification', () => {
    it('should create notification, send email, and update status to SENT', async () => {
      const mockNotification = {
        id: 1,
        notificationId: 'notif_123',
        type: NotificationType.TENANT_REGISTRATION_CONFIRMATION,
        recipient: 'test@example.com',
        status: NotificationStatus.PENDING,
        tenantId: 1,
        metadata: { companyName: 'Test Co' },
      };

      mockPrismaService.notification.create.mockResolvedValue(mockNotification);
      mockPrismaService.notification.update.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.SENT,
        sentAt: new Date(),
      });
      mockEmailService.sendEmail.mockResolvedValue(undefined);

      // Access private method via reflection for testing
      const result = await (service as any).createAndSendNotification(
        NotificationType.TENANT_REGISTRATION_CONFIRMATION,
        'test@example.com',
        { companyName: 'Test Co', tenantId: 1 },
        async () => {
          await emailService.sendEmail({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          });
        },
      );

      expect(mockPrismaService.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: NotificationType.TENANT_REGISTRATION_CONFIRMATION,
          recipient: 'test@example.com',
          status: NotificationStatus.PENDING,
          channel: 'EMAIL',
        }),
      });

      expect(mockEmailService.sendEmail).toHaveBeenCalled();
      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({
          status: NotificationStatus.SENT,
          sentAt: expect.any(Date),
        }),
      });

      expect(result.status).toBe(NotificationStatus.SENT);
    });

    it('should mark notification as FAILED if email sending fails', async () => {
      const mockNotification = {
        id: 1,
        notificationId: 'notif_123',
        type: NotificationType.TENANT_REGISTRATION_CONFIRMATION,
        recipient: 'test@example.com',
        status: NotificationStatus.PENDING,
        tenantId: 1,
      };

      mockPrismaService.notification.create.mockResolvedValue(mockNotification);
      mockPrismaService.notification.update.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.FAILED,
        errorMessage: 'Email service error',
      });
      mockEmailService.sendEmail.mockRejectedValue(new Error('Email service error'));

      const result = await (service as any).createAndSendNotification(
        NotificationType.TENANT_REGISTRATION_CONFIRMATION,
        'test@example.com',
        { companyName: 'Test Co', tenantId: 1 },
        async () => {
          await emailService.sendEmail({
            to: 'test@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
          });
        },
      );

      expect(mockPrismaService.notification.update).toHaveBeenCalledWith({
        where: { id: mockNotification.id },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorMessage: 'Email service error',
        }),
      });

      expect(result.status).toBe(NotificationStatus.FAILED);
    });
  });

  describe('sendTenantRegistrationConfirmation', () => {
    it('should send registration confirmation email and create notification', async () => {
      const mockTenant = { id: 1, tenantId: 'tenant_123' };
      const mockNotification = {
        id: 1,
        notificationId: 'notif_123',
        type: NotificationType.TENANT_REGISTRATION_CONFIRMATION,
        recipient: 'owner@test.com',
        status: NotificationStatus.SENT,
        tenantId: 1,
        metadata: { companyName: 'Test Co', tenantId: 1 },
        sentAt: new Date(),
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.notification.create.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.PENDING,
      });
      mockPrismaService.notification.update.mockResolvedValue(mockNotification);
      mockEmailService.sendTenantRegistrationEmail = jest.fn().mockResolvedValue(undefined);

      const result = await service.sendTenantRegistrationConfirmation(
        'tenant_123',
        'owner@test.com',
        'John',
        'Test Co',
      );

      expect(mockPrismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant_123' },
      });
      expect(mockEmailService.sendTenantRegistrationEmail).toHaveBeenCalledWith('owner@test.com', 'John', 'Test Co');
      expect(result.status).toBe(NotificationStatus.SENT);
    });
  });

  describe('sendTenantApprovalNotification', () => {
    it('should send approval email with login link and create notification', async () => {
      const mockTenant = {
        id: 1,
        tenantId: 'tenant_123',
        subdomain: 'testco',
      };
      const mockNotification = {
        id: 2,
        notificationId: 'notif_456',
        type: NotificationType.TENANT_APPROVED,
        recipient: 'owner@test.com',
        status: NotificationStatus.SENT,
        tenantId: 1,
        metadata: { companyName: 'Test Co', subdomain: 'testco', tenantId: 1 },
        sentAt: new Date(),
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.notification.create.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.PENDING,
      });
      mockPrismaService.notification.update.mockResolvedValue(mockNotification);
      mockEmailService.sendTenantApprovalEmail = jest.fn().mockResolvedValue(undefined);

      const result = await service.sendTenantApprovalNotification(
        'tenant_123',
        'owner@test.com',
        'John',
        'Test Co',
        'testco',
      );

      expect(mockEmailService.sendTenantApprovalEmail).toHaveBeenCalledWith(
        'owner@test.com',
        'John',
        'Test Co',
        'testco',
      );
      expect(result.status).toBe(NotificationStatus.SENT);
    });
  });

  describe('sendTenantRejectionNotification', () => {
    it('should send rejection email with reason and create notification', async () => {
      const mockTenant = { id: 1, tenantId: 'tenant_123' };
      const mockNotification = {
        id: 3,
        notificationId: 'notif_789',
        type: NotificationType.TENANT_REJECTED,
        recipient: 'owner@test.com',
        status: NotificationStatus.SENT,
        tenantId: 1,
        metadata: {
          companyName: 'Test Co',
          rejectionReason: 'Invalid DOT number',
          tenantId: 1,
        },
        sentAt: new Date(),
      };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.notification.create.mockResolvedValue({
        ...mockNotification,
        status: NotificationStatus.PENDING,
      });
      mockPrismaService.notification.update.mockResolvedValue(mockNotification);
      mockEmailService.sendTenantRejectionEmail = jest.fn().mockResolvedValue(undefined);

      const result = await service.sendTenantRejectionNotification(
        'tenant_123',
        'owner@test.com',
        'John',
        'Test Co',
        'Invalid DOT number',
      );

      expect(mockEmailService.sendTenantRejectionEmail).toHaveBeenCalledWith(
        'owner@test.com',
        'John',
        'Test Co',
        'Invalid DOT number',
      );
      expect(result.status).toBe(NotificationStatus.SENT);
    });
  });
});
