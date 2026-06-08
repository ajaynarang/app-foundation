import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import type {
  LaneIntelligence,
  ComputedLaneRate,
  LaneRateTarget,
  LaneRateConfidence,
  LaneRateTrend,
  UpsertLaneRateTargetInput,
} from '@sally/shared-types';

const MIN_LOADS_FOR_INSIGHT = 3;
const HIGH_CONFIDENCE_THRESHOLD = 6;
const LOOKBACK_DAYS = 90;
const RECENT_WINDOW_DAYS = 30;
const TREND_THRESHOLD = 0.05; // 5%

@Injectable()
export class LaneIntelligenceService {
  private readonly logger = new Logger(LaneIntelligenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get lane intelligence: computed historical stats + dispatcher-set target rate.
   */
  async getLaneIntelligence(
    tenantId: number,
    originState: string,
    destState: string,
    equipmentType?: string,
  ): Promise<LaneIntelligence> {
    const [computed, target] = await Promise.all([
      this.computeLaneRate(tenantId, originState, destState),
      this.findTarget(tenantId, originState, destState, equipmentType),
    ]);

    return { computed, target };
  }

  /**
   * Compute historical rate stats from delivered/in-transit loads on this lane.
   * Uses raw SQL because we need conditional aggregation for trend calculation.
   */
  private async computeLaneRate(
    tenantId: number,
    originState: string,
    destState: string,
  ): Promise<ComputedLaneRate | null> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - LOOKBACK_DAYS);

    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - RECENT_WINDOW_DAYS);

    const rows = await this.prisma.$queryRaw<
      Array<{
        load_count: bigint;
        avg_rate_per_mile: number | null;
        min_rate_per_mile: number | null;
        max_rate_per_mile: number | null;
        recent_avg: number | null;
        older_avg: number | null;
      }>
    >`
      SELECT
        COUNT(*)::bigint AS load_count,
        AVG(rate_cents::float / estimated_miles)::float AS avg_rate_per_mile,
        MIN(rate_cents::float / estimated_miles)::float AS min_rate_per_mile,
        MAX(rate_cents::float / estimated_miles)::float AS max_rate_per_mile,
        AVG(CASE WHEN delivered_at > ${recentCutoff} THEN rate_cents::float / estimated_miles END)::float AS recent_avg,
        AVG(CASE WHEN delivered_at <= ${recentCutoff} THEN rate_cents::float / estimated_miles END)::float AS older_avg
      FROM loads
      WHERE tenant_id = ${tenantId}
        AND status IN ('DELIVERED', 'IN_TRANSIT')
        AND rate_cents > 0
        AND estimated_miles > 0
        AND delivered_at > ${cutoff}
        AND origin_state = ${originState}
        AND destination_state = ${destState}
    `;

    const row = rows[0];
    if (!row || Number(row.load_count) < MIN_LOADS_FOR_INSIGHT) {
      return null;
    }

    const loadCount = Number(row.load_count);
    const avgCentsPerMile = row.avg_rate_per_mile ?? 0;
    const minCentsPerMile = row.min_rate_per_mile ?? 0;
    const maxCentsPerMile = row.max_rate_per_mile ?? 0;

    const confidence: LaneRateConfidence = loadCount >= HIGH_CONFIDENCE_THRESHOLD ? 'high' : 'low';

    let trend: LaneRateTrend = 'flat';
    if (row.recent_avg != null && row.older_avg != null && row.older_avg > 0) {
      const pctChange = (row.recent_avg - row.older_avg) / row.older_avg;
      if (pctChange > TREND_THRESHOLD) trend = 'up';
      else if (pctChange < -TREND_THRESHOLD) trend = 'down';
    }

    return {
      avgRateCentsPerMile: Math.round(avgCentsPerMile),
      minRateCentsPerMile: Math.round(minCentsPerMile),
      maxRateCentsPerMile: Math.round(maxCentsPerMile),
      loadCount,
      confidence,
      trend,
    };
  }

  /**
   * Find the matching lane rate target. Falls back to equipment-agnostic target
   * if no equipment-specific target exists.
   */
  private async findTarget(
    tenantId: number,
    originState: string,
    destState: string,
    equipmentType?: string,
  ): Promise<LaneRateTarget | null> {
    const targets = await this.prisma.laneRateTarget.findMany({
      where: {
        tenantId,
        originState,
        destinationState: destState,
        equipmentType: equipmentType ? { in: [equipmentType, 'ALL'] } : 'ALL',
      },
      orderBy: { equipmentType: 'asc' },
    });

    // Prefer equipment-specific match over the 'ALL' fallback
    const match =
      (equipmentType ? targets.find((t) => t.equipmentType === equipmentType) : undefined) ??
      targets.find((t) => t.equipmentType === 'ALL') ??
      null;

    if (!match) return null;

    return this.toTargetResponse(match);
  }

  /**
   * Upsert a lane rate target.
   */
  async upsertTarget(tenantId: number, userId: number, data: UpsertLaneRateTargetInput): Promise<LaneRateTarget> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, email: true },
    });
    const userName = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : 'Unknown';

    const result = await this.prisma.laneRateTarget.upsert({
      where: {
        tenantId_originState_destinationState_equipmentType: {
          tenantId,
          originState: data.originState,
          destinationState: data.destinationState,
          equipmentType: data.equipmentType || 'ALL',
        },
      },
      create: {
        tenantId,
        originState: data.originState,
        destinationState: data.destinationState,
        targetRateCentsPerMile: data.targetRateCentsPerMile,
        notes: data.notes || null,
        equipmentType: data.equipmentType || 'ALL',
        setByUserId: userId,
        setByUserName: userName,
      },
      update: {
        targetRateCentsPerMile: data.targetRateCentsPerMile,
        notes: data.notes || null,
        setByUserId: userId,
        setByUserName: userName,
      },
    });

    return this.toTargetResponse(result);
  }

  /**
   * Delete a lane rate target.
   */
  async deleteTarget(laneRateTargetId: string, tenantId: number): Promise<void> {
    const target = await this.prisma.laneRateTarget.findFirst({
      where: { laneRateTargetId, tenantId },
    });
    if (!target) {
      throw new NotFoundException('Lane rate target not found');
    }
    await this.prisma.laneRateTarget.delete({ where: { id: target.id } });
  }

  /**
   * List all lane rate targets for a tenant.
   */
  async listTargets(tenantId: number): Promise<LaneRateTarget[]> {
    const targets = await this.prisma.laneRateTarget.findMany({
      where: { tenantId },
      orderBy: [{ originState: 'asc' }, { destinationState: 'asc' }],
    });

    return targets.map((t) => this.toTargetResponse(t));
  }

  private toTargetResponse(t: {
    laneRateTargetId: string;
    originState: string;
    destinationState: string;
    targetRateCentsPerMile: number;
    notes: string | null;
    equipmentType: string;
    setByUserName: string;
    updatedAt: Date;
  }): LaneRateTarget {
    return {
      laneRateTargetId: t.laneRateTargetId,
      originState: t.originState,
      destinationState: t.destinationState,
      targetRateCentsPerMile: t.targetRateCentsPerMile,
      notes: t.notes,
      equipmentType: t.equipmentType,
      setByUserName: t.setByUserName,
      updatedAt: t.updatedAt.toISOString(),
    };
  }
}
