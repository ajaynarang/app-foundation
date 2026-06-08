import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

interface ChannelFlags {
  inApp: boolean;
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface ResolvedChannels {
  channels: string[];
  playSound: boolean;
  showBrowserNotification: boolean;
  flashTab: boolean;
  suppressedByQuietHours: boolean;
}

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

  async resolveChannels(params: {
    tenantId: number;
    userId: number;
    alertPriority: AlertPriority;
    alertType: string;
  }): Promise<ResolvedChannels> {
    // 1. Get tenant defaults
    const tenantConfig = await this.prisma.alertConfiguration.findUnique({
      where: { tenantId: params.tenantId },
    });

    const defaultChannels: Record<AlertPriority, ChannelFlags> = {
      [AlertPriority.CRITICAL]: { inApp: true, email: true, push: true, sms: true },
      [AlertPriority.HIGH]: { inApp: true, email: true, push: true, sms: false },
      [AlertPriority.MEDIUM]: { inApp: true, email: false, push: false, sms: false },
      [AlertPriority.LOW]: { inApp: true, email: false, push: false, sms: false },
    };

    const tenantDefaults = (tenantConfig?.defaultChannels as unknown as Partial<Record<AlertPriority, ChannelFlags>>)?.[
      params.alertPriority
    ] ??
      defaultChannels[params.alertPriority] ?? {
        inApp: true,
        email: false,
        push: false,
        sms: false,
      };

    // 2. Get user overrides
    const userPrefs = await this.prisma.userPreferences.findUnique({
      where: { userId: params.userId },
    });

    const userOverrides = (userPrefs?.alertChannels as unknown as Partial<Record<AlertPriority, ChannelFlags>>)?.[
      params.alertPriority
    ];
    const channels: ChannelFlags = userOverrides ? { ...userOverrides } : { ...tenantDefaults };

    // 3. Mandatory alert types always get in-app
    const alertTypes = (tenantConfig?.alertTypes as Record<string, { mandatory?: boolean }>) ?? {};
    if (alertTypes[params.alertType]?.mandatory) {
      channels.inApp = true;
    }

    // 4. Quiet hours suppression (except CRITICAL)
    const inQuietHours = this.isInQuietHours(userPrefs);
    if (inQuietHours && params.alertPriority !== AlertPriority.CRITICAL) {
      channels.push = false;
    }

    // 5. Sound flags
    const soundSettings = (userPrefs?.soundSettings as Partial<Record<AlertPriority, boolean>>) ?? {
      [AlertPriority.CRITICAL]: true,
      [AlertPriority.HIGH]: true,
      [AlertPriority.MEDIUM]: false,
      [AlertPriority.LOW]: false,
    };
    const playSound = soundSettings[params.alertPriority] ?? false;

    return {
      channels: this.toChannelList(channels),
      playSound: inQuietHours && params.alertPriority !== AlertPriority.CRITICAL ? false : playSound,
      showBrowserNotification: channels.push,
      flashTab: params.alertPriority === AlertPriority.CRITICAL,
      suppressedByQuietHours: inQuietHours && params.alertPriority !== AlertPriority.CRITICAL,
    };
  }

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

  private toChannelList(flags: ChannelFlags): string[] {
    const list: string[] = [];
    if (flags.inApp) list.push('in_app');
    if (flags.email) list.push('email');
    if (flags.push) list.push('push');
    if (flags.sms) list.push('sms');
    return list;
  }
}
