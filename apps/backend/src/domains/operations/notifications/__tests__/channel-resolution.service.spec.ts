import { Test } from '@nestjs/testing';
import { AlertPriority } from '@prisma/client';
import { ChannelResolutionService } from '../channel-resolution.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('ChannelResolutionService', () => {
  let service: ChannelResolutionService;
  let prisma: {
    userPreferences: { findUnique: jest.Mock };
    alertConfiguration: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userPreferences: { findUnique: jest.fn() },
      alertConfiguration: { findUnique: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ChannelResolutionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelResolutionService);
  });

  describe('resolveChannels (alert channel merge logic)', () => {
    const baseParams = {
      tenantId: 1,
      userId: 10,
      alertPriority: AlertPriority.CRITICAL,
      alertType: 'HOS_DRIVE_CRITICAL',
    };

    it('uses hardcoded defaults when no tenant config or user prefs exist', async () => {
      prisma.alertConfiguration.findUnique.mockResolvedValue(null);
      prisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.resolveChannels(baseParams);

      expect(result.channels).toEqual(expect.arrayContaining(['in_app', 'email', 'push', 'sms']));
    });

    it('uses tenant defaultChannels when no user override exists', async () => {
      prisma.alertConfiguration.findUnique.mockResolvedValue({
        defaultChannels: {
          CRITICAL: { inApp: true, email: true, push: false, sms: false },
        },
        alertTypes: {},
      });
      prisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.resolveChannels(baseParams);

      expect(result.channels).toEqual(expect.arrayContaining(['in_app', 'email']));
      expect(result.channels).not.toContain('push');
      expect(result.channels).not.toContain('sms');
    });

    it('user override replaces tenant defaults', async () => {
      prisma.alertConfiguration.findUnique.mockResolvedValue({
        defaultChannels: {
          CRITICAL: { inApp: true, email: true, push: true, sms: true },
        },
        alertTypes: {},
      });
      // User disables email for critical alerts
      prisma.userPreferences.findUnique.mockResolvedValue({
        alertChannels: {
          CRITICAL: { inApp: true, email: false, push: true, sms: false },
        },
      });

      const result = await service.resolveChannels(baseParams);

      expect(result.channels).toContain('in_app');
      expect(result.channels).not.toContain('email');
      expect(result.channels).toContain('push');
      expect(result.channels).not.toContain('sms');
    });

    it('mandatory alert types always include in-app even if user disables it', async () => {
      prisma.alertConfiguration.findUnique.mockResolvedValue({
        defaultChannels: {
          CRITICAL: { inApp: true, email: true, push: true, sms: true },
        },
        alertTypes: {
          HOS_DRIVE_CRITICAL: { enabled: true, mandatory: true },
        },
      });
      // User tries to disable all channels including in-app
      prisma.userPreferences.findUnique.mockResolvedValue({
        alertChannels: {
          CRITICAL: { inApp: false, email: false, push: false, sms: false },
        },
      });

      const result = await service.resolveChannels(baseParams);

      // Mandatory forces in-app back on
      expect(result.channels).toContain('in_app');
    });

    it('suppresses push during quiet hours for non-critical', async () => {
      const now = new Date();
      const tz = 'UTC';
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      });
      const currentTime = formatter.format(now);
      const startHour = parseInt(currentTime.split(':')[0]);
      const start = `${String(startHour).padStart(2, '0')}:00`;
      const end = `${String((startHour + 2) % 24).padStart(2, '0')}:00`;

      prisma.alertConfiguration.findUnique.mockResolvedValue({
        defaultChannels: {
          HIGH: { inApp: true, email: true, push: true, sms: false },
        },
        alertTypes: {},
      });
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
        timezone: tz,
      });

      const result = await service.resolveChannels({
        ...baseParams,
        alertPriority: AlertPriority.HIGH,
      });

      expect(result.channels).not.toContain('push');
      expect(result.suppressedByQuietHours).toBe(true);
    });

    it('does NOT suppress push during quiet hours for critical', async () => {
      const now = new Date();
      const tz = 'UTC';
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      });
      const currentTime = formatter.format(now);
      const startHour = parseInt(currentTime.split(':')[0]);
      const start = `${String(startHour).padStart(2, '0')}:00`;
      const end = `${String((startHour + 2) % 24).padStart(2, '0')}:00`;

      prisma.alertConfiguration.findUnique.mockResolvedValue({
        defaultChannels: {
          CRITICAL: { inApp: true, email: true, push: true, sms: true },
        },
        alertTypes: {},
      });
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
        timezone: tz,
      });

      const result = await service.resolveChannels({
        ...baseParams,
        alertPriority: AlertPriority.CRITICAL,
      });

      // Critical alerts are NEVER suppressed by quiet hours
      expect(result.channels).toContain('push');
      expect(result.suppressedByQuietHours).toBe(false);
    });
  });

  describe('resolveForNotification', () => {
    it('returns defaults when user has no preferences', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'BILLING',
      });

      expect(result.suppressedByQuietHours).toBe(false);
      expect(result.skipInApp).toBe(false);
      expect(result.skipEmail).toBe(false);
      expect(result.skipSms).toBe(false);
    });

    it('suppresses during quiet hours', async () => {
      // Force isInQuietHours to return true by setting a window that covers all times
      const now = new Date();
      const tz = 'UTC';
      const formatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: tz,
      });
      const currentTime = formatter.format(now);
      // Set quiet hours to cover current time
      const startHour = parseInt(currentTime.split(':')[0]);
      const start = `${String(startHour).padStart(2, '0')}:00`;
      const end = `${String((startHour + 2) % 24).padStart(2, '0')}:00`;

      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: true,
        quietHoursStart: start,
        quietHoursEnd: end,
        timezone: tz,
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'BILLING',
      });

      expect(result.suppressedByQuietHours).toBe(true);
    });

    it('does not suppress when quiet hours disabled', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        quietHoursEnabled: false,
        quietHoursStart: '22:00',
        quietHoursEnd: '06:00',
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'BILLING',
      });

      expect(result.suppressedByQuietHours).toBe(false);
    });

    it('skips in-app when category inApp is disabled', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notificationPreferences: {
          billing: { inApp: false, email: false, sms: false },
        },
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'BILLING',
      });

      expect(result.skipInApp).toBe(true);
      expect(result.skipEmail).toBe(true);
      expect(result.skipSms).toBe(true);
    });

    it('skips email but keeps sms when category email is disabled', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notificationPreferences: {
          billing: { inApp: true, email: false, sms: true },
        },
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'BILLING',
      });

      expect(result.skipInApp).toBe(false);
      expect(result.skipEmail).toBe(true);
      expect(result.skipSms).toBe(false);
    });

    it('defaults category to enabled when notificationPreferences is null', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notificationPreferences: null,
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'SYSTEM',
      });

      expect(result.skipInApp).toBe(false);
      expect(result.skipEmail).toBe(false);
      expect(result.skipSms).toBe(false);
    });

    it('defaults category to enabled when category not in preferences', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue({
        notificationPreferences: {
          billing: { inApp: true, email: true, sms: false },
        },
      });

      const result = await service.resolveForNotification({
        userId: 1,
        category: 'TEAM',
      });

      expect(result.skipInApp).toBe(false);
      expect(result.skipEmail).toBe(false);
      expect(result.skipSms).toBe(false);
    });
  });
});
