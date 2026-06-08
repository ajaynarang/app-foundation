import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ActiveLoadView, RiskBand, RiskScore } from '@sally/shared-types';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M, TOWER_CACHE_NAMESPACE } from '../../../../constants/cache.constants';
import {
  AT_RISK_THRESHOLD,
  CRITICAL_THRESHOLD,
  EXIT_AT_RISK_AT,
  EXIT_CRITICAL_AT,
  RISK_WEIGHT_ETA_SLACK,
  RISK_WEIGHT_HOS,
} from '../tower.constants';

/**
 * Internal event name used by the SSE bridge to fan band changes out to
 * connected dispatchers. Not a SALLY_EVENTS constant — this never crosses
 * the durable-event boundary and never gets persisted.
 */
export const TOWER_RISK_TRANSITION_EVENT = 'tower.risk.transition';

export interface TowerRiskTransitionPayload {
  tenantId: number;
  loadId: string;
  driverId: string;
  fromBand: RiskBand | null;
  toBand: RiskBand;
  score: number;
}

/**
 * Tower v3 — risk-score computer.
 *
 * Launch formula: HOS thinness × 60 + ETA slack thinness × 40. Weather,
 * customer fragility, and traffic are deferred until we have data to
 * weight them empirically.
 */
@Injectable()
export class RiskScoreService {
  private readonly logger = new Logger(RiskScoreService.name);

  constructor(
    private readonly cache: SallyCacheService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async computeScores(tenantId: number, activeLoads: ActiveLoadView[]): Promise<RiskScore[]> {
    const results: RiskScore[] = [];

    for (const load of activeLoads) {
      const score = this.computeRawScore(load);
      const previousBand = await this.readPreviousBand(tenantId, load.loadId);
      const band = this.applyHysteresis(previousBand, score);

      results.push({
        loadId: load.loadId,
        driverId: load.driver.driverId,
        score,
        band,
      });

      if (band !== previousBand) {
        await this.writeBand(tenantId, load.loadId, band);
        const payload: TowerRiskTransitionPayload = {
          tenantId,
          loadId: load.loadId,
          driverId: load.driver.driverId,
          fromBand: previousBand,
          toBand: band,
          score,
        };
        this.eventEmitter.emit(TOWER_RISK_TRANSITION_EVENT, payload);
      }
    }

    return results;
  }

  private computeRawScore(load: ActiveLoadView): number {
    const hosThinness = this.computeHosThinness(load.hos?.driveMinutesRemaining ?? null);
    const slackThinness = this.computeSlackThinness(load.slackMinutes);

    const raw = RISK_WEIGHT_HOS * hosThinness + RISK_WEIGHT_ETA_SLACK * slackThinness;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }

  private computeHosThinness(driveMinutesRemaining: number | null): number {
    if (driveMinutesRemaining === null) return 0; // unknown ELD ≠ exhausted driver
    return this.clamp01(1 - driveMinutesRemaining / 360);
  }

  private computeSlackThinness(slackMinutes: number | null): number {
    if (slackMinutes === null) return 0.5; // no appointment → middling
    return this.clamp01(1 - slackMinutes / 120);
  }

  private clamp01(value: number): number {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  }

  private applyHysteresis(previousBand: RiskBand | null, score: number): RiskBand {
    if (previousBand === 'critical') {
      if (score >= EXIT_CRITICAL_AT) return 'critical';
      if (score >= EXIT_AT_RISK_AT) return 'at-risk';
      return 'on-track';
    }
    if (previousBand === 'at-risk') {
      if (score >= CRITICAL_THRESHOLD) return 'critical';
      if (score >= EXIT_AT_RISK_AT) return 'at-risk';
      return 'on-track';
    }
    // previousBand is null OR 'on-track' — enter thresholds apply
    if (score >= CRITICAL_THRESHOLD) return 'critical';
    if (score >= AT_RISK_THRESHOLD) return 'at-risk';
    return 'on-track';
  }

  private async readPreviousBand(tenantId: number, loadId: string): Promise<RiskBand | null> {
    const cached = await this.cache.get<RiskBand>(buildKey(TOWER_CACHE_NAMESPACE, 'last-risk-band', tenantId, loadId));
    return cached ?? null;
  }

  private async writeBand(tenantId: number, loadId: string, band: RiskBand): Promise<void> {
    await this.cache.set(buildKey(TOWER_CACHE_NAMESPACE, 'last-risk-band', tenantId, loadId), band, CACHE_TTL_WARM_5M);
  }
}
