import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';

export interface DriverPerformanceRow {
  driverId: number;
  driverName: string;
  loadsCompleted: number;
  revenueCents: number;
  earningsCents: number;
  onTimePercent: number;
  totalMiles: number;
}

@Injectable()
export class DriverPerformanceService {
  private readonly logger = new Logger(DriverPerformanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getDriverPerformance(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<DriverPerformanceRow[]> {
    return this.cache.getOrSet(
      buildKey(
        'sally:analytics',
        'driver-performance',
        String(tenantId),
        dateFrom.toISOString().split('T')[0],
        dateTo.toISOString().split('T')[0],
      ),
      () => this.computeDriverPerformance(tenantId, dateFrom, dateTo, limit),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeDriverPerformance(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<DriverPerformanceRow[]> {
    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
      },
    });

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
        driverId: { gt: 0 },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        driverId: true,
        rateCents: true,
        deliveredAt: true,
        deliveryDate: true,
        estimatedMiles: true,
        actualMiles: true,
        isRelay: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
        settlementLineItems: {
          select: { payAmountCents: true },
        },
        legs: {
          select: {
            driverId: true,
            actualMiles: true,
          },
        },
      },
    });

    const driverMap = new Map<
      number,
      {
        name: string;
        loadsCompleted: number;
        revenueCents: number;
        earningsCents: number;
        onTimeCount: number;
        totalMiles: number;
      }
    >();

    // Init all drivers
    for (const d of drivers) {
      driverMap.set(d.id, {
        name: d.name,
        loadsCompleted: 0,
        revenueCents: 0,
        earningsCents: 0,
        onTimeCount: 0,
        totalMiles: 0,
      });
    }

    for (const load of loads) {
      if (!load.driverId) continue;

      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const earningsCents = load.settlementLineItems.reduce((sum, li) => sum + li.payAmountCents, 0);

      // On-time check
      let isOnTime = true;
      if (load.deliveryDate && load.deliveredAt) {
        const deadline = new Date(load.deliveryDate);
        deadline.setHours(23, 59, 59, 999);
        isOnTime = load.deliveredAt <= deadline;
      }

      // For relay loads: attribute miles to each leg's driver
      if (load.isRelay && load.legs.length > 0) {
        for (const leg of load.legs) {
          if (!leg.driverId) continue;
          const legEntry = driverMap.get(leg.driverId);
          if (!legEntry) continue;
          legEntry.loadsCompleted += 1;
          legEntry.totalMiles += leg.actualMiles ?? 0;
          if (isOnTime) legEntry.onTimeCount += 1;
        }
        // Attribute revenue/earnings to the load-level driver
        const entry = driverMap.get(load.driverId);
        if (entry) {
          entry.revenueCents += revenueCents;
          entry.earningsCents += earningsCents;
        }
      } else {
        // Standard load: attribute everything to the load-level driver
        const entry = driverMap.get(load.driverId);
        if (!entry) continue;
        const miles = load.actualMiles ?? load.estimatedMiles ?? 0;
        entry.loadsCompleted += 1;
        entry.revenueCents += revenueCents;
        entry.earningsCents += earningsCents;
        entry.totalMiles += miles;
        if (isOnTime) entry.onTimeCount += 1;
      }
    }

    return Array.from(driverMap.entries())
      .map(([driverId, data]) => ({
        driverId,
        driverName: data.name,
        loadsCompleted: data.loadsCompleted,
        revenueCents: data.revenueCents,
        earningsCents: data.earningsCents,
        onTimePercent: data.loadsCompleted > 0 ? Math.round((data.onTimeCount / data.loadsCompleted) * 1000) / 10 : 100,
        totalMiles: data.totalMiles,
      }))
      .filter((d) => d.loadsCompleted > 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, limit ?? 100);
  }
}
