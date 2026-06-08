import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '../../../constants/cache.constants';
import { UpdateAlertConfigDto } from './dto/alert-config.dto';

@Injectable()
export class AlertConfigService {
  private readonly logger = new Logger(AlertConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
  ) {}

  getDefaults() {
    return {
      alertTypes: {
        // Compliance — HOS thresholds
        HOS_DRIVE_WARNING: {
          enabled: true,
          mandatory: true,
          thresholdPercent: 75,
        },
        HOS_DRIVE_CRITICAL: {
          enabled: true,
          mandatory: true,
          thresholdPercent: 90,
        },
        HOS_ON_DUTY_WARNING: {
          enabled: true,
          mandatory: true,
          thresholdPercent: 75,
        },
        HOS_ON_DUTY_CRITICAL: {
          enabled: true,
          mandatory: true,
          thresholdPercent: 90,
        },
        HOS_BREAK_WARNING: {
          enabled: true,
          mandatory: false,
          thresholdPercent: 75,
        },
        HOS_BREAK_CRITICAL: {
          enabled: true,
          mandatory: false,
          thresholdPercent: 90,
        },
        HOS_APPROACHING_LIMIT: {
          enabled: true,
          mandatory: false,
          thresholdPercent: 85,
        },
        CYCLE_APPROACHING_LIMIT: {
          enabled: true,
          mandatory: false,
          thresholdMinutes: 300,
        },

        // Schedule
        ROUTE_DELAY: { enabled: true, mandatory: false, thresholdMinutes: 30 },
        APPOINTMENT_AT_RISK: {
          enabled: true,
          mandatory: false,
          thresholdMinutes: 30,
        },
        MISSED_APPOINTMENT: { enabled: true, mandatory: true },
        DOCK_TIME_EXCEEDED: {
          enabled: true,
          mandatory: false,
          thresholdMinutes: 60,
        },
        UNCONFIRMED_PICKUP: { enabled: true, mandatory: false },
        UNCONFIRMED_DELIVERY: { enabled: true, mandatory: false },

        // Safety
        DRIVER_NOT_MOVING: {
          enabled: true,
          mandatory: false,
          thresholdMinutes: 120,
        },
        SPEEDING: { enabled: true, mandatory: false, thresholdPercent: 10 },
        UNAUTHORIZED_STOP: {
          enabled: true,
          mandatory: false,
          thresholdMinutes: 15,
        },

        // Route
        WEATHER_ALERT: { enabled: true, mandatory: false },
        ROAD_CLOSURE: { enabled: true, mandatory: false },
        FUEL_LOW: { enabled: true, mandatory: false, thresholdPercent: 20 },
      },
      escalationPolicy: {
        [AlertPriority.CRITICAL]: {
          acknowledgeSlaMinutes: 5,
          escalateTo: 'supervisors',
          channels: ['email', 'sms'],
        },
        [AlertPriority.HIGH]: {
          acknowledgeSlaMinutes: 15,
          escalateTo: 'all_dispatchers',
          channels: ['email'],
        },
      },
      groupingConfig: {
        dedupWindowMinutes: 15,
        groupSameTypePerDriver: true,
        smartGroupAcrossDrivers: true,
        linkCascading: true,
      },
      defaultChannels: {
        [AlertPriority.CRITICAL]: { inApp: true, email: true, push: true, sms: true },
        [AlertPriority.HIGH]: { inApp: true, email: true, push: true, sms: false },
        [AlertPriority.MEDIUM]: { inApp: true, email: false, push: false, sms: false },
        [AlertPriority.LOW]: { inApp: true, email: false, push: false, sms: false },
      },
    };
  }

  async getConfig(tenantId: number) {
    return this.cache.getOrSet(
      buildKey('sally:settings', 'alerts', tenantId),
      async () => {
        const config = await this.prisma.alertConfiguration.findUnique({
          where: { tenantId },
        });

        if (!config) return this.getDefaults();

        return {
          alertTypes: config.alertTypes,
          escalationPolicy: config.escalationPolicy,
          groupingConfig: config.groupingConfig,
          defaultChannels: config.defaultChannels,
        };
      },
      CACHE_TTL_COLD_30M,
    );
  }

  async updateConfig(tenantId: number, dto: UpdateAlertConfigDto) {
    const defaults = this.getDefaults();

    const result = await this.prisma.alertConfiguration.upsert({
      where: { tenantId },
      create: {
        tenantId,
        alertTypes: dto.alertTypes || defaults.alertTypes,
        escalationPolicy: dto.escalationPolicy || defaults.escalationPolicy,
        groupingConfig: dto.groupingConfig || defaults.groupingConfig,
        defaultChannels: dto.defaultChannels || defaults.defaultChannels,
      },
      update: {
        ...(dto.alertTypes && { alertTypes: dto.alertTypes }),
        ...(dto.escalationPolicy && { escalationPolicy: dto.escalationPolicy }),
        ...(dto.groupingConfig && { groupingConfig: dto.groupingConfig }),
        ...(dto.defaultChannels && { defaultChannels: dto.defaultChannels }),
      },
    });

    await this.cache.del(buildKey('sally:settings', 'alerts', tenantId));

    return result;
  }
}
