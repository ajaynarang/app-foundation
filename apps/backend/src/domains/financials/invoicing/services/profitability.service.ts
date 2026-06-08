import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { LoadProfitability, DEFAULT_MPG, DEFAULT_FUEL_COST_PER_GALLON_CENTS } from '@sally/shared-types';

export type { LoadProfitability };

@Injectable()
export class ProfitabilityService {
  private readonly logger = new Logger(ProfitabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  /**
   * Calculate profitability for a single load.
   * Revenue = invoice total (or load rate if no invoice)
   * Driver cost = settlement line item pay amount
   * Fuel cost = estimated from route miles / mpg * fuel price
   */
  async calculateForLoad(tenantId: number, loadNumber: string): Promise<LoadProfitability> {
    const cacheKey = buildKey('sally:profitability', 'load', tenantId, loadNumber);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const load = await this.prisma.load.findFirst({
          where: { loadNumber, tenantId },
          include: {
            invoices: {
              where: { status: { not: 'VOID' } },
              select: { totalCents: true },
              take: 1,
            },
            settlementLineItems: { select: { payAmountCents: true } },
            routePlanLoads: {
              include: { plan: { select: { totalDistanceMiles: true } } },
            },
          },
        });

        if (!load) return this.emptyProfitability(loadNumber);

        const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
        const driverCostCents = load.settlementLineItems.reduce((sum, li) => sum + li.payAmountCents, 0);

        // Estimate fuel cost: miles / 6.5 mpg * $3.50/gal
        const routeMiles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? 0;
        const estimatedMpg = DEFAULT_MPG;
        const estimatedFuelPricePerGalCents = DEFAULT_FUEL_COST_PER_GALLON_CENTS;
        const fuelCostCents =
          routeMiles > 0 ? Math.round((routeMiles / estimatedMpg) * estimatedFuelPricePerGalCents) : 0;

        const marginCents = revenueCents - driverCostCents - fuelCostCents;
        const marginPercent = revenueCents > 0 ? (marginCents / revenueCents) * 100 : 0;

        return {
          loadNumber: load.loadNumber,
          revenueCents: revenueCents,
          driverCostCents: driverCostCents,
          fuelCostCents: fuelCostCents,
          marginCents: marginCents,
          marginPercent: Math.round(marginPercent * 10) / 10,
        };
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /** Calculate profitability for all delivered loads */
  async calculateForTenant(tenantId: number, limit = 50): Promise<LoadProfitability[]> {
    const cacheKey = buildKey('sally:profitability', 'tenant', tenantId, limit);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const loads = await this.prisma.load.findMany({
          where: { tenantId, status: 'DELIVERED' },
          include: {
            invoices: {
              where: { status: { not: 'VOID' } },
              select: { totalCents: true },
              take: 1,
            },
            settlementLineItems: { select: { payAmountCents: true } },
            routePlanLoads: {
              include: { plan: { select: { totalDistanceMiles: true } } },
            },
          },
          orderBy: { deliveredAt: 'desc' },
          take: limit,
        });

        return loads.map((load) => {
          const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
          const driverCostCents = load.settlementLineItems.reduce((sum, li) => sum + li.payAmountCents, 0);
          const routeMiles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? 0;
          const fuelCostCents =
            routeMiles > 0 ? Math.round((routeMiles / DEFAULT_MPG) * DEFAULT_FUEL_COST_PER_GALLON_CENTS) : 0;
          const marginCents = revenueCents - driverCostCents - fuelCostCents;
          const marginPercent = revenueCents > 0 ? (marginCents / revenueCents) * 100 : 0;

          return {
            loadNumber: load.loadNumber,
            revenueCents: revenueCents,
            driverCostCents: driverCostCents,
            fuelCostCents: fuelCostCents,
            marginCents: marginCents,
            marginPercent: Math.round(marginPercent * 10) / 10,
          };
        });
      },
      CACHE_TTL_WARM_5M,
    );
  }

  private emptyProfitability(loadNumber: string): LoadProfitability {
    return {
      loadNumber: loadNumber,
      revenueCents: 0,
      driverCostCents: 0,
      fuelCostCents: 0,
      marginCents: 0,
      marginPercent: 0,
    };
  }
}
