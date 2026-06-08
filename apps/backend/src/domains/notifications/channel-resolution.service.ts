import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface ResolvedNotificationPrefs {
  suppressedByQuietHours: boolean;
  skipInApp: boolean;
  skipEmail: boolean;
  skipSms: boolean;
}

@Injectable()
export class ChannelResolutionService {
  private readonly logger = new Logger(ChannelResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveForNotification(params: { userId: number; category: string }): Promise<ResolvedNotificationPrefs> {
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId: params.userId },
    });

    if (!userPrefs) {
      return {
        suppressedByQuietHours: false,
        skipInApp: false,
        skipEmail: false,
        skipSms: false,
      };
    }

    // Check category-level channel preferences
    const categoryKey = params.category.toLowerCase();
    const notifPrefs = userPrefs.notificationPreferences as Record<string, Record<string, boolean>> | null;
    const skipInApp = notifPrefs?.[categoryKey]?.inApp === false;
    const skipEmail = notifPrefs?.[categoryKey]?.email === false;
    const skipSms = notifPrefs?.[categoryKey]?.sms === false;

    // Quiet hours check
    const inQuietHours = this.isInQuietHours(userPrefs);

    return {
      suppressedByQuietHours: inQuietHours,
      skipInApp,
      skipEmail,
      skipSms,
    };
  }

  private isInQuietHours(prefs: any): boolean {
    if (!prefs?.quietHoursEnabled || !prefs?.quietHoursStart || !prefs?.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const tz = prefs.timezone || 'America/New_York';
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });
    const currentTime = formatter.format(now);

    const start = prefs.quietHoursStart;
    const end = prefs.quietHoursEnd;

    // Handle overnight quiet hours (e.g., 22:00 - 06:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }
    return currentTime >= start && currentTime < end;
  }
}
