import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';

export interface LaneAnalysisRow {
  originCity: string;
  originState: string;
  destinationCity: string;
  destinationState: string;
  loadCount: number;
  totalRevenueCents: number;
  avgRatePerMileCents: number;
  avgTransitHours: number;
}

@Injectable()
export class LaneAnalysisService {
  private readonly logger = new Logger(LaneAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getLaneAnalysis(tenantId: number, dateFrom: Date, dateTo: Date, limit?: number): Promise<LaneAnalysisRow[]> {
    return this.cache.getOrSet(
      buildKey(
        'sally:analytics',
        'lane-analysis',
        String(tenantId),
        dateFrom.toISOString().split('T')[0],
        dateTo.toISOString().split('T')[0],
      ),
      () => this.computeLaneAnalysis(tenantId, dateFrom, dateTo, limit),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeLaneAnalysis(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<LaneAnalysisRow[]> {
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
        originCity: { not: '' },
        destinationCity: { not: '' },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        originCity: true,
        originState: true,
        destinationCity: true,
        destinationState: true,
        rateCents: true,
        estimatedMiles: true,
        actualMiles: true,
        pickupDate: true,
        deliveredAt: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
      },
    });

    const laneMap = new Map<
      string,
      {
        originCity: string;
        originState: string;
        destinationCity: string;
        destinationState: string;
        revenueCents: number;
        loadCount: number;
        totalMiles: number;
        transitHoursSum: number;
        transitCount: number;
      }
    >();

    for (const load of loads) {
      const key = `${load.originCity},${load.originState}->${load.destinationCity},${load.destinationState}`;
      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const miles = load.actualMiles ?? load.estimatedMiles ?? 0;

      let transitHours = 0;
      let hasTransit = false;
      if (load.pickupDate && load.deliveredAt) {
        transitHours = (load.deliveredAt.getTime() - new Date(load.pickupDate).getTime()) / (1000 * 60 * 60);
        hasTransit = true;
      }

      const existing = laneMap.get(key) ?? {
        originCity: load.originCity,
        originState: load.originState ?? '',
        destinationCity: load.destinationCity,
        destinationState: load.destinationState ?? '',
        revenueCents: 0,
        loadCount: 0,
        totalMiles: 0,
        transitHoursSum: 0,
        transitCount: 0,
      };
      existing.revenueCents += revenueCents;
      existing.loadCount += 1;
      existing.totalMiles += miles;
      if (hasTransit) {
        existing.transitHoursSum += transitHours;
        existing.transitCount += 1;
      }
      laneMap.set(key, existing);
    }

    return Array.from(laneMap.values())
      .map((data) => ({
        originCity: data.originCity,
        originState: data.originState,
        destinationCity: data.destinationCity,
        destinationState: data.destinationState,
        loadCount: data.loadCount,
        totalRevenueCents: data.revenueCents,
        avgRatePerMileCents: data.totalMiles > 0 ? Math.round(data.revenueCents / data.totalMiles) : 0,
        avgTransitHours: data.transitCount > 0 ? Math.round((data.transitHoursSum / data.transitCount) * 10) / 10 : 0,
      }))
      .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents)
      .slice(0, limit ?? 100);
  }
}
