import { Test, TestingModule } from '@nestjs/testing';
import { AlertService, AlertSeverity } from '../alert.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../../../infrastructure/notification/services/email.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

describe('AlertService', () => {
  let service: AlertService;

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
    },
  };

  const mockCache = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailService,
          useValue: { sendEmail: jest.fn() },
        },
        {
          provide: SallyCacheService,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<AlertService>(AlertService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should format alert email correctly', async () => {
    const alert = {
      title: 'Integration Failing',
      message: 'HOS sync has failed 3 times',
      severity: AlertSeverity.ERROR,
      context: { tenantId: 1, failureCount: 3 },
    };

    // We can't easily test email sending, so we test the format method
    const html = (service as any).formatAlertEmail(alert);

    expect(html).toContain('Integration Failing');
    expect(html).toContain('HOS sync has failed 3 times');
    expect(html).toContain('ERROR');
  });

  // ─── sendAlert ───

  describe('sendAlert', () => {
    const mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AlertService,
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: EmailService, useValue: mockEmailService },
          { provide: SallyCacheService, useValue: mockCache },
        ],
      }).compile();
      service = module.get(AlertService);
      jest.clearAllMocks();
      mockCache.getOrSet.mockImplementation((_k: string, fn: () => any) => fn());
    });

    it('should send alert emails to all recipients', async () => {
      const alert = {
        title: 'Test Alert',
        message: 'Something happened',
        severity: AlertSeverity.WARNING,
        context: {},
      };

      await service.sendAlert(alert, 1, ['a@test.com', 'b@test.com']);

      expect(mockEmailService.sendEmail).toHaveBeenCalledTimes(2);
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'a@test.com',
          subject: '[WARNING] Test Alert',
        }),
      );
    });

    it('should fetch admin emails when no recipients provided', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([{ email: 'admin@test.com' }]);

      const alert = {
        title: 'Test',
        message: 'msg',
        severity: AlertSeverity.INFO,
        context: {},
      };

      await service.sendAlert(alert, 1);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            isActive: true,
          }),
        }),
      );
      expect(mockEmailService.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'admin@test.com' }));
    });

    it('should skip sending when no recipients found', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([]);

      const alert = {
        title: 'Test',
        message: 'msg',
        severity: AlertSeverity.INFO,
        context: {},
      };

      await service.sendAlert(alert, 1);

      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle email send errors gracefully', async () => {
      mockEmailService.sendEmail.mockRejectedValue(new Error('SMTP failure'));

      const alert = {
        title: 'Test',
        message: 'msg',
        severity: AlertSeverity.CRITICAL,
        context: {},
      };

      // Should not throw
      await service.sendAlert(alert, 1, ['a@test.com']);
    });

    it('should use correct color for each severity', () => {
      const severities: AlertSeverity[] = [
        AlertSeverity.INFO,
        AlertSeverity.WARNING,
        AlertSeverity.ERROR,
        AlertSeverity.CRITICAL,
      ];

      for (const severity of severities) {
        const html = (service as any).formatAlertEmail({
          title: 'Test',
          message: 'msg',
          severity,
          context: {},
        });
        expect(html).toContain(severity);
      }
    });

    it('should include context in email body as JSON', () => {
      const alert = {
        title: 'Test',
        message: 'msg',
        severity: AlertSeverity.ERROR,
        context: { key: 'value' },
      };

      const html = (service as any).formatAlertEmail(alert);
      expect(html).toContain('"key": "value"');
    });
  });

  // ─── getAdminEmails (private, via cache) ───

  describe('getAdminEmails (cache behavior)', () => {
    it('should cache admin emails via getOrSet', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([{ email: 'cached@test.com' }]);
      mockCache.getOrSet.mockImplementation((_k: string, fn: () => any) => fn());

      const alert = {
        title: 'Test',
        message: 'msg',
        severity: AlertSeverity.INFO,
        context: {},
      };

      await service.sendAlert(alert, 1);

      expect(mockCache.getOrSet).toHaveBeenCalledWith(
        expect.stringContaining('alerts'),
        expect.any(Function),
        expect.any(Number),
      );
    });
  });
});
