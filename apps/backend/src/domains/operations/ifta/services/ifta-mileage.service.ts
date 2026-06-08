import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { getQuarterPeriod } from '../ifta.types';

export interface StateMileageEntry {
  jurisdiction: string;
  totalMiles: number;
  loadIds: number[];
  source: 'LOAD_DERIVED' | 'MANUAL';
}

export interface AddManualMileageInput {
  jurisdiction: string;
  totalMiles: number;
  year: number;
  quarter: number;
  vehicleId?: number;
}

@Injectable()
export class IftaMileageService {
  private readonly logger = new Logger(IftaMileageService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Aggregates load mileage by state for a given quarter.
   * Miles are split 50/50 for inter-state loads, 100% for intra-state.
   * Uses actualMiles if available, falls back to estimatedMiles.
   * Skips loads missing origin, destination, or mileage data.
   */
  async aggregateLoadMileageByState(tenantId: number, year: number, quarter: number): Promise<StateMileageEntry[]> {
    const { periodStart, periodEnd } = getQuarterPeriod(year, quarter);

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: {
          gte: periodStart,
          lte: periodEnd,
        },
      },
      select: {
        id: true,
        loadNumber: true,
        originState: true,
        destinationState: true,
        actualMiles: true,
        estimatedMiles: true,
        vehicleId: true,
        deliveredAt: true,
      },
    });

    // Map keyed by jurisdiction for aggregation
    const stateMap = new Map<string, { totalMiles: number; loadIds: number[] }>();

    for (const load of loads) {
      const { originState, destinationState, actualMiles, estimatedMiles, id: loadId } = load;

      // Skip loads missing state data
      if (!originState || !destinationState) {
        continue;
      }

      const miles = actualMiles ?? estimatedMiles;

      // Skip loads with no mileage data
      if (!miles || miles <= 0) {
        continue;
      }

      if (originState === destinationState) {
        // Intra-state: all miles to one state
        this.addMilesToState(stateMap, originState, miles, loadId);
      } else {
        // Inter-state: split 50/50
        const halfMiles = miles / 2;
        this.addMilesToState(stateMap, originState, halfMiles, loadId);
        this.addMilesToState(stateMap, destinationState, halfMiles, loadId);
      }
    }

    return Array.from(stateMap.entries()).map(([jurisdiction, data]) => ({
      jurisdiction,
      totalMiles: data.totalMiles,
      loadIds: data.loadIds,
      source: 'LOAD_DERIVED' as const,
    }));
  }

  /**
   * Upserts a manual mileage entry for a jurisdiction in a given quarter.
   * Creates the quarter record if it does not exist.
   */
  async addManualMileage(tenantId: number, input: AddManualMileageInput) {
    const { jurisdiction, totalMiles, year, quarter, vehicleId } = input;

    const quarterRecord = await this.ensureQuarterExists(tenantId, year, quarter);

    return this.prisma.iftaStateMileage.upsert({
      where: {
        quarterId_jurisdiction: {
          quarterId: quarterRecord.id,
          jurisdiction,
        },
      },
      create: {
        quarterId: quarterRecord.id,
        tenantId,
        vehicleId: vehicleId ?? null,
        jurisdiction,
        totalMiles,
        source: 'MANUAL',
      },
      update: {
        totalMiles,
        source: 'MANUAL',
      },
    });
  }

  /**
   * Returns all mileage entries for a given quarter.
   */
  async getMileageForQuarter(tenantId: number, quarterId: number) {
    return this.prisma.iftaStateMileage.findMany({
      where: {
        quarterId,
        tenantId,
      },
      orderBy: {
        jurisdiction: 'asc',
      },
    });
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  private addMilesToState(
    stateMap: Map<string, { totalMiles: number; loadIds: number[] }>,
    state: string,
    miles: number,
    loadId: number,
  ): void {
    const existing = stateMap.get(state);
    if (existing) {
      existing.totalMiles += miles;
      if (!existing.loadIds.includes(loadId)) {
        existing.loadIds.push(loadId);
      }
    } else {
      stateMap.set(state, { totalMiles: miles, loadIds: [loadId] });
    }
  }

  private async ensureQuarterExists(tenantId: number, year: number, quarter: number) {
    const existing = await this.prisma.iftaQuarter.findUnique({
      where: {
        tenantId_year_quarter: {
          tenantId,
          year,
          quarter,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const { periodStart, periodEnd } = getQuarterPeriod(year, quarter);

    return this.prisma.iftaQuarter.create({
      data: {
        tenantId,
        year,
        quarter,
        periodStart,
        periodEnd,
      },
    });
  }
}
