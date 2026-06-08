import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface FleetUtilizationRow {
  vehicleId: number;
  unitNumber: string;
  type: string;
  loadCount: number;
  totalMiles: number;
  revenuePerMileCents: number;
  revenueCents: number;
}

@Injectable()
export class FleetUtilizationService {
  private readonly logger = new Logger(FleetUtilizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getFleetUtilization(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<FleetUtilizationRow[]> {
    const vehicles = await this.prisma.vehicle.findMany({
      where: { tenantId, lifecycleStatus: 'ACTIVE' },
      select: { id: true, unitNumber: true, equipmentType: true },
    });

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
        vehicleId: { gt: 0 },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        vehicleId: true,
        rateCents: true,
        estimatedMiles: true,
        actualMiles: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
      },
    });

    const vehicleMap = new Map<
      number,
      {
        unitNumber: string;
        type: string;
        loadCount: number;
        totalMiles: number;
        revenueCents: number;
      }
    >();

    for (const v of vehicles) {
      vehicleMap.set(v.id, {
        unitNumber: v.unitNumber,
        type: v.equipmentType ?? 'Unknown',
        loadCount: 0,
        totalMiles: 0,
        revenueCents: 0,
      });
    }

    for (const load of loads) {
      if (!load.vehicleId) continue;
      const entry = vehicleMap.get(load.vehicleId);
      if (!entry) continue;

      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      const miles = load.actualMiles ?? load.estimatedMiles ?? 0;

      entry.loadCount += 1;
      entry.totalMiles += miles;
      entry.revenueCents += revenueCents;
    }

    return Array.from(vehicleMap.entries())
      .map(([vehicleId, data]) => ({
        vehicleId,
        unitNumber: data.unitNumber,
        type: data.type,
        loadCount: data.loadCount,
        totalMiles: data.totalMiles,
        revenueCents: data.revenueCents,
        revenuePerMileCents: data.totalMiles > 0 ? Math.round(data.revenueCents / data.totalMiles) : 0,
      }))
      .filter((v) => v.loadCount > 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, limit ?? 100);
  }
}
