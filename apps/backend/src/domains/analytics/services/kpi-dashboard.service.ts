import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';

export interface KpiDashboard {
  todayRevenueCents: number;
  mtdRevenueCents: number;
  activeLoads: number;
  onTimePercent: number;
  fleetUtilizationPercent: number;
  arOutstandingCents: number;
  shieldScore: number | null;
  mtdMarginPercent: number;
}

@Injectable()
export class KpiDashboardService {
  private readonly logger = new Logger(KpiDashboardService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getKpis(tenantId: number): Promise<KpiDashboard> {
    return this.cache.getOrSet<KpiDashboard>(
      buildKey('sally:analytics', 'kpi', tenantId),
      () => this.computeKpis(tenantId),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeKpis(tenantId: number): Promise<KpiDashboard> {
    const now = new Date();
    // UTC midnight boundaries to avoid server-timezone dependency
    const todayStr = now.toISOString().split('T')[0];
    const todayStart = new Date(`${todayStr}T00:00:00.000Z`);
    const monthStart = new Date(`${todayStr.slice(0, 7)}-01T00:00:00.000Z`);

    const [
      todayRevenue,
      mtdRevenue,
      activeLoads,
      onTimeStats,
      fleetStats,
      arOutstanding,
      latestShieldAudit,
      mtdMarginData,
    ] = await Promise.all([
      // Today's revenue: sum of invoices created today
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          createdAt: { gte: todayStart },
          status: { not: 'VOID' },
        },
        _sum: { totalCents: true },
      }),

      // MTD revenue
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          createdAt: { gte: monthStart },
          status: { not: 'VOID' },
        },
        _sum: { totalCents: true },
      }),

      // Active loads
      this.prisma.load.count({
        where: {
          tenantId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
        },
      }),

      // On-time delivery stats (loads delivered in last 30 days)
      this.getOnTimeStats(tenantId, now),

      // Fleet utilization
      this.getFleetUtilizationStats(tenantId),

      // AR outstanding
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          status: { notIn: ['PAID', 'VOID'] },
        },
        _sum: { balanceCents: true },
      }),

      // Latest shield score
      this.prisma.shieldAudit.findFirst({
        where: {
          tenantId,
          status: 'COMPLETED',
          overallScore: { gt: 0 },
        },
        orderBy: { completedAt: 'desc' },
        select: { overallScore: true },
      }),

      // MTD margin data
      this.getMtdMarginData(tenantId, monthStart, now),
    ]);

    const result: KpiDashboard = {
      todayRevenueCents: todayRevenue._sum.totalCents ?? 0,
      mtdRevenueCents: mtdRevenue._sum.totalCents ?? 0,
      activeLoads,
      onTimePercent: onTimeStats.onTimePercent,
      fleetUtilizationPercent: fleetStats.utilizationPercent,
      arOutstandingCents: arOutstanding._sum.balanceCents ?? 0,
      shieldScore: latestShieldAudit?.overallScore ?? null,
      mtdMarginPercent: mtdMarginData.marginPercent,
    };

    return result;
  }

  private async getOnTimeStats(tenantId: number, now: Date): Promise<{ onTimePercent: number }> {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const deliveredLoads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: thirtyDaysAgo },
      },
      select: {
        deliveredAt: true,
        deliveryDate: true,
      },
    });

    if (deliveredLoads.length === 0) {
      return { onTimePercent: 100 };
    }

    const onTimeCount = deliveredLoads.filter((load) => {
      if (!load.deliveryDate || !load.deliveredAt) return true;
      const deliveryDeadline = new Date(load.deliveryDate);
      deliveryDeadline.setHours(23, 59, 59, 999);
      return load.deliveredAt <= deliveryDeadline;
    }).length;

    return {
      onTimePercent: Math.round((onTimeCount / deliveredLoads.length) * 1000) / 10,
    };
  }

  private async getFleetUtilizationStats(tenantId: number): Promise<{ utilizationPercent: number }> {
    const [totalActiveDrivers, driversWithActiveLoad] = await Promise.all([
      this.prisma.driver.count({
        where: {
          tenantId,
          status: 'ACTIVE',
        },
      }),
      this.prisma.load.groupBy({
        by: ['driverId'],
        where: {
          tenantId,
          status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
          driverId: { gt: 0 },
        },
      }),
    ]);

    if (totalActiveDrivers === 0) {
      return { utilizationPercent: 0 };
    }

    return {
      utilizationPercent: Math.round((driversWithActiveLoad.length / totalActiveDrivers) * 1000) / 10,
    };
  }

  private async getMtdMarginData(tenantId: number, monthStart: Date, now: Date): Promise<{ marginPercent: number }> {
    const [revenueResult, costResult] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: {
          tenantId,
          createdAt: { gte: monthStart, lte: now },
          status: { not: 'VOID' },
        },
        _sum: { totalCents: true },
      }),
      this.prisma.settlement.aggregate({
        where: {
          tenantId,
          createdAt: { gte: monthStart, lte: now },
          status: { not: 'VOID' },
        },
        _sum: { grossPayCents: true },
      }),
    ]);

    const revenue = revenueResult._sum.totalCents ?? 0;
    const costs = costResult._sum.grossPayCents ?? 0;

    if (revenue === 0) {
      return { marginPercent: 0 };
    }

    return {
      marginPercent: Math.round(((revenue - costs) / revenue) * 1000) / 10,
    };
  }
}
