import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, TestingModule } from '@nestjs/testing';
import type { ActiveLoadView } from '@sally/shared-types';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { RiskScoreService } from '../risk-score.service';

describe('RiskScoreService', () => {
  let service: RiskScoreService;
  let emitter: EventEmitter2;

  const mockCache = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCache.get.mockResolvedValue(undefined);
    mockCache.set.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [RiskScoreService, { provide: SallyCacheService, useValue: mockCache }, EventEmitter2],
    }).compile();

    service = module.get(RiskScoreService);
    emitter = module.get(EventEmitter2);
  });

  // Risk scoring only reads driveMinutesRemaining; duty/cycle/break are filled
  // with comfortable values so the fixture satisfies the 4-clock HOS schema.
  const hos = (driveMinutesRemaining: number): ActiveLoadView['hos'] => ({
    driveMinutesRemaining,
    dutyMinutesRemaining: 480,
    cycleMinutesRemaining: 2400,
    breakMinutesRemaining: 120,
    isEldConnected: true,
    lastSyncAt: null,
  });

  const baseLoad = (overrides: Partial<ActiveLoadView> = {}): ActiveLoadView => ({
    loadId: 'LD-001',
    loadNumber: 'LD-20260515-001',
    referenceNumber: null,
    customerName: 'Acme',
    driver: { driverId: 'DRV-001', name: 'Hector Velez', initials: 'HV' },
    vehicleIdentifier: 'T-07',
    currentStop: null,
    nextStop: null,
    etaAt: null,
    slackMinutes: 200,
    assignmentState: 'assigned',
    hos: hos(400),
    ...overrides,
  });

  it('emits on-track when HOS > 6h and slack > 120m', async () => {
    const result = await service.computeScores(1, [baseLoad()]);

    expect(result).toHaveLength(1);
    expect(result[0].band).toBe('on-track');
    expect(result[0].score).toBeLessThan(60);
  });

  it('emits at-risk when slack is 30 min and HOS is 90 min', async () => {
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(90),
        slackMinutes: 30,
      }),
    ]);

    expect(result[0].band).toBe('at-risk');
    expect(result[0].score).toBeGreaterThanOrEqual(60);
    expect(result[0].score).toBeLessThan(80);
  });

  it('emits critical when HOS is exhausted AND slack is thin', async () => {
    // Formula caps HOS contribution at 60 and slack at 40. Critical (≥80)
    // requires BOTH inputs to be thin. HOS=0min → hosThin=1; slack=24min →
    // slackThin=0.8. Score = 60 + 40*0.8 = 92.
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(0),
        slackMinutes: 24,
      }),
    ]);

    expect(result[0].band).toBe('critical');
    expect(result[0].score).toBeGreaterThanOrEqual(80);
  });

  it('emits critical when slack is negative (late)', async () => {
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(30),
        slackMinutes: -15,
      }),
    ]);

    expect(result[0].band).toBe('critical');
  });

  it('hysteresis: stays at-risk when score falls to 56 from prior at-risk', async () => {
    mockCache.get.mockResolvedValueOnce('at-risk');

    // Tune HOS+slack so score ≈ 57: hosThin ~0.4 (216min), slackThin ~0.43 (68min)
    // 60*0.4 + 40*0.43 ≈ 41.2 — too low. Use derived inputs that land at 56.
    // Pure math: score = 60*hosThin + 40*slackThin. For score=56, choose hosThin=0.6, slackThin=0.5 → 60*0.6+40*0.5 = 56.
    // hosThin=0.6 → driveMin = 360 * (1 - 0.6) = 144
    // slackThin=0.5 → slackMin = 120 * (1 - 0.5) = 60
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(144),
        slackMinutes: 60,
      }),
    ]);

    expect(result[0].score).toBe(56);
    expect(result[0].band).toBe('at-risk');
  });

  it('hysteresis: stays critical when score is 76 from prior critical', async () => {
    mockCache.get.mockResolvedValueOnce('critical');

    // For score=76: hosThin=1, slackThin=0.4 → 60+16 = 76.
    // hosThin=1 → driveMin=0; slackThin=0.4 → slackMin=72
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(0),
        slackMinutes: 72,
      }),
    ]);

    expect(result[0].score).toBe(76);
    expect(result[0].band).toBe('critical');
  });

  it('emits tower.risk.transition when band changes', async () => {
    mockCache.get.mockResolvedValueOnce('on-track');

    const spy = jest.spyOn(emitter, 'emit');

    await service.computeScores(1, [
      baseLoad({
        hos: hos(90),
        slackMinutes: 30,
      }),
    ]);

    expect(spy).toHaveBeenCalledWith(
      'tower.risk.transition',
      expect.objectContaining({
        tenantId: 1,
        loadId: 'LD-001',
        driverId: 'DRV-001',
        fromBand: 'on-track',
        toBand: 'at-risk',
      }),
    );
  });

  it('does NOT emit tower.risk.transition when band is unchanged', async () => {
    mockCache.get.mockResolvedValueOnce('at-risk');

    const spy = jest.spyOn(emitter, 'emit');

    await service.computeScores(1, [
      baseLoad({
        hos: hos(144),
        slackMinutes: 60,
      }),
    ]);

    // No transition events when band did not change
    expect(spy).not.toHaveBeenCalledWith('tower.risk.transition', expect.anything());
  });

  it('null slackMinutes resolves to 0.5 thinness', async () => {
    // Score = 60*hosThin + 40*0.5 = 60*hosThin + 20.
    // hosThin = 1 - (400/360) clamped to 0. So score = 0 + 20 = 20.
    const result = await service.computeScores(1, [baseLoad({ slackMinutes: null })]);

    expect(result[0].score).toBe(20);
    expect(result[0].band).toBe('on-track');
  });

  it('null hos resolves to 0 thinness — HOS unknown treated as healthy', async () => {
    // Match assumption from plan: if hos null, treat as worst-known? Or untouched?
    // Per plan: simplified formula uses driveMinutesRemaining; null/missing
    // means we can't score it. Document the call: treat hos:null as healthy
    // (thinness=0), since absent ELD doesn't imply the driver is exhausted.
    const result = await service.computeScores(1, [baseLoad({ hos: null, slackMinutes: 200 })]);

    expect(result[0].score).toBe(0);
    expect(result[0].band).toBe('on-track');
  });

  it('caches the new band per (tenantId, loadId)', async () => {
    await service.computeScores(7, [
      baseLoad({
        hos: hos(40),
        slackMinutes: -10,
      }),
    ]);

    expect(mockCache.set).toHaveBeenCalledWith('sally:tower:last-risk-band:7:LD-001', 'critical', expect.any(Number));
  });

  it('scopes last-band cache keys by tenantId', async () => {
    await service.computeScores(42, [baseLoad()]);
    await service.computeScores(99, [baseLoad()]);

    expect(mockCache.get).toHaveBeenCalledWith('sally:tower:last-risk-band:42:LD-001');
    expect(mockCache.get).toHaveBeenCalledWith('sally:tower:last-risk-band:99:LD-001');
  });

  it('returns an empty array when no active loads are supplied', async () => {
    const result = await service.computeScores(1, []);
    expect(result).toEqual([]);
  });

  it('clamps score to [0, 100]', async () => {
    // Pathological inputs — extremely negative slack and zero HOS
    const result = await service.computeScores(1, [
      baseLoad({
        hos: hos(0),
        slackMinutes: -1000,
      }),
    ]);

    expect(result[0].score).toBe(100);
    expect(result[0].band).toBe('critical');
  });
});
