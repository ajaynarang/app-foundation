import { Test } from '@nestjs/testing';
import { ChannelResolutionService } from '../channel-resolution.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

describe('ChannelResolutionService', () => {
  let service: ChannelResolutionService;
  let prisma: {
    userPreferences: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userPreferences: { findUnique: jest.fn() },
    };
    const module = await Test.createTestingModule({
      providers: [ChannelResolutionService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ChannelResolutionService);
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
