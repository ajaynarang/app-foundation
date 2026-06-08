import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { LaneInsight } from '@sally/shared-types';

const MIN_LOADS_FOR_INSIGHT = 3;
const LOOKBACK_DAYS = 90;
const ABOVE_THRESHOLD = 0.05; // 5%

interface LaneKey {
  originState: string;
  destState: string;
}

@Injectable()
export class LaneRateService {
  private readonly logger = new Logger(LaneRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getLaneInsights(tenantId: number, lanes: LaneKey[]): Promise<Map<string, LaneInsight>> {
    const result = new Map<string, LaneInsight>();
    if (lanes.length === 0) return result;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    // Unique lane pairs
    const uniqueLanes = [...new Set(lanes.map((l) => `${l.originState}-${l.destState}`))];

    // Build state pair filters for the query
    const originStates = [...new Set(lanes.map((l) => l.originState))];
    const destStates = [...new Set(lanes.map((l) => l.destState))];

    // Query historical loads grouped by origin/dest state using Prisma
    const rows = await this.prisma.$queryRaw<
      Array<{
        origin_state: string;
        destination_state: string;
        load_count: bigint;
        avg_rate_cents: number;
        avg_miles: number;
      }>
    >`
      SELECT
        origin_state,
        destination_state,
        COUNT(*)::bigint AS load_count,
        AVG(rate_cents)::float AS avg_rate_cents,
        AVG(estimated_miles)::float AS avg_miles
      FROM loads
      WHERE tenant_id = ${tenantId}
        AND status IN ('DELIVERED', 'IN_TRANSIT')
        AND rate_cents > 0
        AND estimated_miles > 0
        AND delivered_at > ${cutoff}
        AND origin_state = ANY(${originStates})
        AND destination_state = ANY(${destStates})
      GROUP BY origin_state, destination_state
      HAVING COUNT(*) >= ${MIN_LOADS_FOR_INSIGHT}
    `;

    for (const row of rows) {
      const key = `${row.origin_state}-${row.destination_state}`;
      // Only include lanes we actually asked about
      if (!uniqueLanes.includes(key)) continue;

      const avgRatePerMile = row.avg_miles > 0 ? row.avg_rate_cents / 100 / row.avg_miles : 0;

      result.set(key, {
        avgRatePerMile: Math.round(avgRatePerMile * 100) / 100,
        percentDiff: 0, // Computed per-listing when enriching
        verdict: 'market_rate',
        loadCount: Number(row.load_count),
      });
    }

    return result;
  }

  computeVerdict(listingRatePerMile: number, avgRatePerMile: number): Pick<LaneInsight, 'percentDiff' | 'verdict'> {
    if (avgRatePerMile <= 0) return { percentDiff: 0, verdict: 'market_rate' };

    const percentDiff = Math.round(((listingRatePerMile - avgRatePerMile) / avgRatePerMile) * 100);

    let verdict: LaneInsight['verdict'] = 'market_rate';
    if (percentDiff > ABOVE_THRESHOLD * 100) verdict = 'above_market';
    else if (percentDiff < -ABOVE_THRESHOLD * 100) verdict = 'below_market';

    return { percentDiff, verdict };
  }
}
