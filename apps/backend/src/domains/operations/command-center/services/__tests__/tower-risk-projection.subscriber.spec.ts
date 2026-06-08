import { Test, TestingModule } from '@nestjs/testing';
import type { ActiveLoadView, RiskScore } from '@sally/shared-types';
import { DomainEvent } from '../../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { LOOKAHEAD_DEFAULT_HOURS } from '../../tower.constants';
import { ActiveLoadsService } from '../active-loads.service';
import { RiskScoreService } from '../risk-score.service';
import { TowerRiskProjectionSubscriber } from '../tower-risk-projection.subscriber';

describe('TowerRiskProjectionSubscriber', () => {
  let subscriber: TowerRiskProjectionSubscriber;
  let activeLoads: { findActiveLoads: jest.Mock };
  let riskScore: { computeScores: jest.Mock };

  const cycleEvent = (tenantId: string) =>
    new DomainEvent(SALLY_EVENTS.MONITORING_CYCLE_COMPLETED, tenantId, {
      loadsMonitored: 3,
      driversMonitored: 2,
      triggersThisCycle: 1,
      status: 'ok',
      timestamp: new Date().toISOString(),
    });

  beforeEach(async () => {
    activeLoads = { findActiveLoads: jest.fn().mockResolvedValue([] as ActiveLoadView[]) };
    riskScore = { computeScores: jest.fn().mockResolvedValue([] as RiskScore[]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TowerRiskProjectionSubscriber,
        { provide: ActiveLoadsService, useValue: activeLoads },
        { provide: RiskScoreService, useValue: riskScore },
      ],
    }).compile();

    subscriber = module.get(TowerRiskProjectionSubscriber);
  });

  it('recomputes risk scores on MONITORING_CYCLE_COMPLETED with the parsed tenantId and default lookahead', async () => {
    const loads = [{ loadId: 'LD-1' }] as unknown as ActiveLoadView[];
    activeLoads.findActiveLoads.mockResolvedValue(loads);

    await subscriber.onMonitoringCycleCompleted(cycleEvent('42'));

    expect(activeLoads.findActiveLoads).toHaveBeenCalledWith(42, LOOKAHEAD_DEFAULT_HOURS);
    expect(riskScore.computeScores).toHaveBeenCalledWith(42, loads);
  });

  it('drops the event when the tenantId is non-numeric — neither service is called', async () => {
    await subscriber.onMonitoringCycleCompleted(cycleEvent('not-a-number'));

    expect(activeLoads.findActiveLoads).not.toHaveBeenCalled();
    expect(riskScore.computeScores).not.toHaveBeenCalled();
  });

  it('catches a findActiveLoads failure without rethrowing and never calls computeScores', async () => {
    activeLoads.findActiveLoads.mockRejectedValue(new Error('GPS lookup exploded'));

    await expect(subscriber.onMonitoringCycleCompleted(cycleEvent('7'))).resolves.toBeUndefined();

    expect(riskScore.computeScores).not.toHaveBeenCalled();
  });

  it('catches a computeScores failure without rethrowing', async () => {
    riskScore.computeScores.mockRejectedValue(new Error('cache down'));

    await expect(subscriber.onMonitoringCycleCompleted(cycleEvent('7'))).resolves.toBeUndefined();
  });

  it('no-ops cleanly when the tenant has zero active loads', async () => {
    activeLoads.findActiveLoads.mockResolvedValue([]);

    await subscriber.onMonitoringCycleCompleted(cycleEvent('9'));

    expect(activeLoads.findActiveLoads).toHaveBeenCalledWith(9, LOOKAHEAD_DEFAULT_HOURS);
    expect(riskScore.computeScores).toHaveBeenCalledWith(9, []);
  });

  it('tolerates a tenantId that arrives as a number rather than a string', async () => {
    // DomainEvent.tenantId is typed string, but the parse guard is defensive —
    // a numeric value must pass straight through without NaN-dropping.
    const event = cycleEvent('11');
    (event as unknown as { tenantId: number }).tenantId = 11;

    await subscriber.onMonitoringCycleCompleted(event);

    expect(activeLoads.findActiveLoads).toHaveBeenCalledWith(11, LOOKAHEAD_DEFAULT_HOURS);
  });
});
