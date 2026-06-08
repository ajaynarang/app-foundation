import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { LOOKAHEAD_DEFAULT_HOURS } from '../tower.constants';
import { ActiveLoadsService } from './active-loads.service';
import { RiskScoreService } from './risk-score.service';

/**
 * Tower v3 — risk-projection rebuilder.
 *
 * Tower's risk bands are a *projection* of load-monitoring state. The
 * `GET /command-center/risk-scores` endpoint only recomputes them on page
 * load and on load-change SSE events — but two risk inputs (HOS drive-time
 * remaining and ETA slack) degrade continuously with no load event firing.
 * Left to those triggers alone, a driver burning down hours over several
 * hours keeps a stale "Rolling" band while their real risk is "critical".
 *
 * `MONITORING_CYCLE_COMPLETED` is the system's one authoritative
 * "the fleet has been re-evaluated, truth is fresh" signal — the monitoring
 * engine emits it per tenant roughly every two minutes. This subscriber
 * rebuilds the risk projection on that boundary so HOS / ETA-slack drift is
 * reflected even when no load event has occurred. `computeScores` already
 * emits `tower.risk.transition` on any band change, which the existing SSE
 * pipe fans to connected dispatchers, so this subscriber emits nothing of
 * its own — it is purely an additional caller of the same recompute path.
 */
@Injectable()
export class TowerRiskProjectionSubscriber {
  private readonly logger = new Logger(TowerRiskProjectionSubscriber.name);

  constructor(
    private readonly activeLoadsService: ActiveLoadsService,
    private readonly riskScoreService: RiskScoreService,
  ) {}

  @OnEvent(SALLY_EVENTS.MONITORING_CYCLE_COMPLETED, { async: true })
  async onMonitoringCycleCompleted(event: DomainEvent): Promise<void> {
    const tenantId = this.parseTenant(event);
    if (tenantId === null) return;

    try {
      // Match the lookahead the GET /risk-scores controller uses — its
      // ActiveLoadsQueryDto defaults `lookaheadHours` to LOOKAHEAD_DEFAULT_HOURS,
      // so the recompute covers the same active set as the on-demand path.
      const activeLoads = await this.activeLoadsService.findActiveLoads(tenantId, LOOKAHEAD_DEFAULT_HOURS);
      await this.riskScoreService.computeScores(tenantId, activeLoads);
    } catch (error) {
      // Never crash the event bus — a failed recompute just means bands stay
      // as fresh as the last GET /risk-scores; the next cycle retries.
      this.logger.warn(`tower-risk-projection: recompute failed for tenant ${tenantId}: ${(error as Error).message}`);
    }
  }

  private parseTenant(event: DomainEvent): number | null {
    const tid = typeof event.tenantId === 'string' ? parseInt(event.tenantId, 10) : event.tenantId;
    if (Number.isNaN(tid)) {
      this.logger.warn(`tower-risk-projection: bad tenantId "${event.tenantId}" for ${event.event}`);
      return null;
    }
    return tid;
  }
}
