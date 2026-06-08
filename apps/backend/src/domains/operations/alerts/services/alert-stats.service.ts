import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertCacheService } from './alert-cache.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../../../constants/cache.constants';

const ALERT_STATUS = AlertStatusSchema.enum;

export interface AlertStats {
  active: number;
  critical: number;
  avgResponseTimeMinutes: number;
  resolvedToday: number;
}

export interface SmartAlertStats {
  driversWithIssues: number;
  totalActiveDrivers: number;
  loadsAtRisk: number;
  totalActiveLoads: number;
  recurringAlerts: number;
  avgResolveTimeMinutes: number;
}

@Injectable()
export class AlertStatsService {
  private readonly logger = new Logger(AlertStatsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertCache: AlertCacheService,
    private readonly sallyCache: SallyCacheService,
  ) {}

  async getStats(tenantId: number): Promise<AlertStats> {
    const cacheKey = buildKey('sally:alerts', 'stats', tenantId);
    return this.sallyCache.getOrSet(
      cacheKey,
      async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [active, critical, resolvedToday, acknowledgedToday] = await Promise.all([
          this.prisma.alert.count({
            where: { tenantId, status: ALERT_STATUS.ACTIVE },
          }),
          this.prisma.alert.count({
            where: { tenantId, status: ALERT_STATUS.ACTIVE, priority: AlertPriority.CRITICAL },
          }),
          this.prisma.alert.count({
            where: {
              tenantId,
              status: { in: [ALERT_STATUS.RESOLVED, ALERT_STATUS.AUTO_RESOLVED] },
              resolvedAt: { gte: todayStart },
            },
          }),
          this.prisma.alert.findMany({
            where: {
              tenantId,
              acknowledgedAt: { not: null, gte: todayStart },
            },
            select: { createdAt: true, acknowledgedAt: true },
          }),
        ]);

        let avgResponseTimeMinutes = 0;
        if (acknowledgedToday.length > 0) {
          const totalMs = acknowledgedToday.reduce((sum, alert) => {
            const diff = alert.acknowledgedAt.getTime() - alert.createdAt.getTime();
            return sum + diff;
          }, 0);
          avgResponseTimeMinutes = Math.round(totalMs / acknowledgedToday.length / 60000);
        }

        return { active, critical, avgResponseTimeMinutes, resolvedToday };
      },
      CACHE_TTL_HOT_30S,
    );
  }

  async getSmartStats(tenantId: number): Promise<SmartAlertStats> {
    const cacheKey = buildKey('sally:alerts', 'smart-stats', tenantId);
    return this.sallyCache.getOrSet(
      cacheKey,
      async () => {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const [
          driversWithIssues,
          totalActiveDrivers,
          loadsWithIssues,
          totalActiveLoads,
          recurringAlerts,
          resolvedToday,
        ] = await Promise.all([
          this.prisma.alert
            .groupBy({
              by: ['driverId'],
              where: {
                tenantId,
                status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
              },
            })
            .then((r) => r.length),
          this.prisma.load
            .groupBy({
              by: ['driverId'],
              where: {
                tenantId,
                status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
                driverId: { not: null },
              },
            })
            .then((r) => r.length),
          this.prisma.alert
            .groupBy({
              by: ['loadId'],
              where: {
                tenantId,
                status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
                loadId: { not: null },
              },
            })
            .then((r) => r.length),
          this.prisma.load.count({
            where: {
              tenantId,
              status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
            },
          }),
          this.prisma.alert.count({
            where: {
              tenantId,
              status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
              occurrenceCount: { gte: 3 },
            },
          }),
          this.prisma.alert.findMany({
            where: {
              tenantId,
              status: { in: [ALERT_STATUS.RESOLVED, ALERT_STATUS.AUTO_RESOLVED] },
              resolvedAt: { gte: todayStart },
            },
            select: { createdAt: true, resolvedAt: true },
          }),
        ]);

        let avgResolveTimeMinutes = 0;
        if (resolvedToday.length > 0) {
          const totalMs = resolvedToday.reduce((sum, a) => {
            return sum + (a.resolvedAt.getTime() - a.createdAt.getTime());
          }, 0);
          avgResolveTimeMinutes = Math.round(totalMs / resolvedToday.length / 60000);
        }

        return {
          driversWithIssues,
          totalActiveDrivers,
          loadsAtRisk: loadsWithIssues,
          totalActiveLoads,
          recurringAlerts,
          avgResolveTimeMinutes,
        };
      },
      CACHE_TTL_HOT_30S,
    );
  }
}
