import {
  anomalyKinds,
  hasAnomaly,
  SettlementReviewConditionsSchema,
  SettlementReviewDecideSchema,
  type SettlementAnomalySignals,
} from '../responsibilities/settlement-review';

function makeSignals(overrides: Partial<SettlementAnomalySignals> = {}): SettlementAnomalySignals {
  return {
    negativeNet: false,
    deductionsExceedGross: false,
    noLineItems: false,
    offAverage: false,
    stale: false,
    ...overrides,
  };
}

describe('settlement-review shared-types', () => {
  describe('hasAnomaly', () => {
    it('returns false when all signals are clean', () => {
      expect(hasAnomaly(makeSignals())).toBe(false);
    });

    it.each([
      ['negativeNet', { negativeNet: true }],
      ['deductionsExceedGross', { deductionsExceedGross: true }],
      ['noLineItems', { noLineItems: true }],
      ['offAverage', { offAverage: true }],
      ['stale', { stale: true }],
    ] as const)('returns true when %s trips', (_label, override) => {
      expect(hasAnomaly(makeSignals(override))).toBe(true);
    });

    it('treats offAverage=null (no baseline) as NOT an anomaly', () => {
      expect(hasAnomaly(makeSignals({ offAverage: null }))).toBe(false);
    });

    it('returns true when any one of several signals trips alongside null offAverage', () => {
      expect(hasAnomaly(makeSignals({ offAverage: null, stale: true }))).toBe(true);
    });
  });

  describe('anomalyKinds', () => {
    it('returns an empty list when clean', () => {
      expect(anomalyKinds(makeSignals())).toEqual([]);
    });

    it('lists tripped kinds in deterministic order', () => {
      expect(anomalyKinds(makeSignals({ negativeNet: true, noLineItems: true, stale: true }))).toEqual([
        'negativeNet',
        'noLineItems',
        'stale',
      ]);
    });

    it('excludes offAverage when null (no baseline)', () => {
      expect(anomalyKinds(makeSignals({ offAverage: null, negativeNet: true }))).toEqual(['negativeNet']);
    });
  });

  describe('SettlementReviewConditionsSchema', () => {
    it('accepts an empty object (all optional)', () => {
      expect(SettlementReviewConditionsSchema.parse({})).toEqual({});
    });

    it('parses staleDays / offAverageThresholdPct / excludeDriverIds', () => {
      const parsed = SettlementReviewConditionsSchema.parse({
        staleDays: 10,
        offAverageThresholdPct: 0.5,
        excludeDriverIds: ['drv_1', 'drv_2'],
      });
      expect(parsed).toEqual({ staleDays: 10, offAverageThresholdPct: 0.5, excludeDriverIds: ['drv_1', 'drv_2'] });
    });

    it('rejects a non-positive staleDays', () => {
      expect(() => SettlementReviewConditionsSchema.parse({ staleDays: 0 })).toThrow();
    });
  });

  describe('SettlementReviewDecideSchema', () => {
    it('accepts the three actions', () => {
      for (const action of ['approve', 'flag_anomaly', 'no_action'] as const) {
        expect(SettlementReviewDecideSchema.parse({ action, reasoning: 'x', confidence: 0.9 }).action).toBe(action);
      }
    });

    it('rejects an unknown action', () => {
      expect(() => SettlementReviewDecideSchema.parse({ action: 'pay', reasoning: 'x', confidence: 0.9 })).toThrow();
    });
  });
});
