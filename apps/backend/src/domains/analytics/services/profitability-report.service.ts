import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import { GroupByPeriod } from '../dto/report-query.dto';
import { getPeriodKey } from '../utils/period';

export interface ProfitabilityPeriod {
  period: string;
  revenueCents: number;
  costsCents: number;
  marginCents: number;
  marginPercent: number;
}

export interface ProfitabilityTrend {
  totalRevenueCents: number;
  totalCostsCents: number;
  totalMarginCents: number;
  overallMarginPercent: number;
  periods: ProfitabilityPeriod[];
}

export interface LoadProfitabilityRow {
  loadNumber: string;
  customerName: string;
  deliveredAt: Date | null;
  revenueCents: number;
  driverCostCents: number;
  fuelCostCents: number;
  totalCostCents: number;
  marginCents: number;
  marginPercent: number;
}

@Injectable()
export class ProfitabilityReportService {
  private readonly logger = new Logger(ProfitabilityReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  private async getFuelConfig(tenantId: number): Promise<{ mpg: number; fuelPricePerGalCents: number }> {
    const settings = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId },
      select: { costPerMile: true },
    });
    // costPerMile is a general cost metric; fuel is typically ~40% of cost-per-mile
    // Use cost_per_mile * 0.4 as fuel cost per mile, convert to per-gallon via mpg
    // Default: $3.50/gal, 6.5 MPG (industry averages for Class 8 trucks)
    const DEFAULT_MPG = 6.5;
    const DEFAULT_FUEL_PRICE_CENTS = 350;
    return {
      mpg: DEFAULT_MPG,
      fuelPricePerGalCents: settings?.costPerMile
        ? Math.round(Number(settings.costPerMile) * 0.4 * DEFAULT_MPG * 100)
        : DEFAULT_FUEL_PRICE_CENTS,
    };
  }

  async getProfitabilityTrend(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    groupBy: GroupByPeriod,
  ): Promise<ProfitabilityTrend> {
    return this.cache.getOrSet(
      buildKey(
        'sally:profitability',
        'trend',
        String(tenantId),
        dateFrom.toISOString().split('T')[0],
        dateTo.toISOString().split('T')[0],
        groupBy,
      ),
      () => this.computeProfitabilityTrend(tenantId, dateFrom, dateTo, groupBy),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeProfitabilityTrend(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    groupBy: GroupByPeriod,
  ): Promise<ProfitabilityTrend> {
    const fuelConfig = await this.getFuelConfig(tenantId);
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        deliveredAt: true,
        rateCents: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
        settlementLineItems: {
          select: { payAmountCents: true },
        },
        routePlanLoads: {
          include: {
            plan: { select: { totalDistanceMiles: true } },
          },
        },
      },
    });

    const periodMap = new Map<string, { revenueCents: number; costsCents: number }>();
    let totalRevenueCents = 0;
    let totalCostsCents = 0;

    for (const load of loads) {
      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const driverCostCents = load.settlementLineItems.reduce((sum, li) => sum + li.payAmountCents, 0);
      const routeMiles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? 0;
      const fuelCostCents =
        routeMiles > 0 ? Math.round((routeMiles / fuelConfig.mpg) * fuelConfig.fuelPricePerGalCents) : 0;
      const costsCents = driverCostCents + fuelCostCents;

      totalRevenueCents += revenueCents;
      totalCostsCents += costsCents;

      const periodKey = getPeriodKey(load.deliveredAt, groupBy);
      const existing = periodMap.get(periodKey) ?? {
        revenueCents: 0,
        costsCents: 0,
      };
      existing.revenueCents += revenueCents;
      existing.costsCents += costsCents;
      periodMap.set(periodKey, existing);
    }

    const periods: ProfitabilityPeriod[] = Array.from(periodMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, data]) => {
        const marginCents = data.revenueCents - data.costsCents;
        return {
          period,
          revenueCents: data.revenueCents,
          costsCents: data.costsCents,
          marginCents,
          marginPercent: data.revenueCents > 0 ? Math.round((marginCents / data.revenueCents) * 1000) / 10 : 0,
        };
      });

    const totalMarginCents = totalRevenueCents - totalCostsCents;

    return {
      totalRevenueCents,
      totalCostsCents,
      totalMarginCents,
      overallMarginPercent: totalRevenueCents > 0 ? Math.round((totalMarginCents / totalRevenueCents) * 1000) / 10 : 0,
      periods,
    };
  }

  async getProfitabilityByLoad(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit: number,
  ): Promise<LoadProfitabilityRow[]> {
    return this.cache.getOrSet(
      buildKey(
        'sally:profitability',
        'by-load',
        String(tenantId),
        dateFrom.toISOString().split('T')[0],
        dateTo.toISOString().split('T')[0],
        String(limit),
      ),
      () => this.computeProfitabilityByLoad(tenantId, dateFrom, dateTo, limit),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeProfitabilityByLoad(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit: number,
  ): Promise<LoadProfitabilityRow[]> {
    const fuelConfig = await this.getFuelConfig(tenantId);
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
      },
      include: {
        customer: { select: { companyName: true } },
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
        settlementLineItems: {
          select: { payAmountCents: true },
        },
        routePlanLoads: {
          include: {
            plan: { select: { totalDistanceMiles: true } },
          },
        },
      },
      orderBy: { deliveredAt: 'desc' },
      take: Math.min(limit, 10_000), // Safety valve — prevents OOM on large tenants
    });

    return loads.map((load) => {
      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const driverCostCents = load.settlementLineItems.reduce((sum, li) => sum + li.payAmountCents, 0);
      const routeMiles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? 0;
      const fuelCostCents =
        routeMiles > 0 ? Math.round((routeMiles / fuelConfig.mpg) * fuelConfig.fuelPricePerGalCents) : 0;
      const totalCostCents = driverCostCents + fuelCostCents;
      const marginCents = revenueCents - totalCostCents;

      return {
        loadNumber: load.loadNumber,
        customerName: load.customer?.companyName ?? 'Unknown',
        deliveredAt: load.deliveredAt,
        revenueCents,
        driverCostCents,
        fuelCostCents,
        totalCostCents,
        marginCents,
        marginPercent: revenueCents > 0 ? Math.round((marginCents / revenueCents) * 1000) / 10 : 0,
      };
    });
  }
}
