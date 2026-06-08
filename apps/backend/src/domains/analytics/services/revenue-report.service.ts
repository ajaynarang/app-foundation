import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { GroupByPeriod } from '../dto/report-query.dto';
import { getPeriodKey } from '../utils/period';

export interface RevenuePeriod {
  period: string;
  revenueCents: number;
  loadCount: number;
  avgRatePerMileCents: number;
}

export interface RevenueSummary {
  totalRevenueCents: number;
  totalLoadCount: number;
  avgRatePerMileCents: number;
  periods: RevenuePeriod[];
}

export interface RevenueByCustomer {
  customerId: number;
  companyName: string;
  revenueCents: number;
  loadCount: number;
  avgRatePerMileCents: number;
}

@Injectable()
export class RevenueReportService {
  private readonly logger = new Logger(RevenueReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getRevenueSummary(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    groupBy: GroupByPeriod,
  ): Promise<RevenueSummary> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        rateCents: true,
        deliveredAt: true,
        estimatedMiles: true,
        actualMiles: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
      },
    });

    // Group by period
    const periodMap = new Map<string, { revenueCents: number; loadCount: number; totalMiles: number }>();

    let totalRevenueCents = 0;
    let totalMiles = 0;

    for (const load of loads) {
      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const miles = load.actualMiles ?? load.estimatedMiles ?? 0;
      const periodKey = getPeriodKey(load.deliveredAt, groupBy);

      totalRevenueCents += revenueCents;
      totalMiles += miles;

      const existing = periodMap.get(periodKey) ?? {
        revenueCents: 0,
        loadCount: 0,
        totalMiles: 0,
      };
      existing.revenueCents += revenueCents;
      existing.loadCount += 1;
      existing.totalMiles += miles;
      periodMap.set(periodKey, existing);
    }

    const periods: RevenuePeriod[] = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => ({
        period,
        revenueCents: data.revenueCents,
        loadCount: data.loadCount,
        avgRatePerMileCents: data.totalMiles > 0 ? Math.round(data.revenueCents / data.totalMiles) : 0,
      }));

    return {
      totalRevenueCents,
      totalLoadCount: loads.length,
      avgRatePerMileCents: totalMiles > 0 ? Math.round(totalRevenueCents / totalMiles) : 0,
      periods,
    };
  }

  async getRevenueByCustomer(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<RevenueByCustomer[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
        customerId: { gt: 0 },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        rateCents: true,
        customerId: true,
        estimatedMiles: true,
        actualMiles: true,
        customer: {
          select: { id: true, companyName: true },
        },
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
      },
    });

    const customerMap = new Map<
      number,
      {
        companyName: string;
        revenueCents: number;
        loadCount: number;
        totalMiles: number;
      }
    >();

    for (const load of loads) {
      if (!load.customer) continue;
      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const miles = load.actualMiles ?? load.estimatedMiles ?? 0;
      const existing = customerMap.get(load.customer.id) ?? {
        companyName: load.customer.companyName,
        revenueCents: 0,
        loadCount: 0,
        totalMiles: 0,
      };
      existing.revenueCents += revenueCents;
      existing.loadCount += 1;
      existing.totalMiles += miles;
      customerMap.set(load.customer.id, existing);
    }

    return Array.from(customerMap.entries())
      .map(([customerId, data]) => ({
        customerId,
        companyName: data.companyName,
        revenueCents: data.revenueCents,
        loadCount: data.loadCount,
        avgRatePerMileCents: data.totalMiles > 0 ? Math.round(data.revenueCents / data.totalMiles) : 0,
      }))
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, limit ?? 100);
  }
}
