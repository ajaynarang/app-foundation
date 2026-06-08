import { computeAnomalySignals, type ComputeAnomalyInput } from '../anomaly-signals';

/**
 * Deterministic anomaly-signal math. Every signal + the new-driver no-baseline
 * case. These tests are the contract the "anomaly forces flag, never approve"
 * guard depends on — keep them exhaustive.
 */
function makeInput(overrides: Partial<ComputeAnomalyInput> = {}): ComputeAnomalyInput {
  return {
    // A clean settlement: $1,820 net, $1,970 gross, $150 deductions, 4 loads,
    // 2 days old, average $1,800.
    netPayCents: 182000,
    grossPayCents: 197000,
    deductionsCents: 15000,
    lineItemCount: 4,
    ageDays: 2,
    avgNetPayCents: 180000,
    ...overrides,
  };
}

describe('computeAnomalySignals', () => {
  it('reports all-clean for a normal settlement within range', () => {
    expect(computeAnomalySignals(makeInput())).toEqual({
      negativeNet: false,
      deductionsExceedGross: false,
      noLineItems: false,
      offAverage: false,
      stale: false,
    });
  });

  describe('negativeNet', () => {
    it('trips when net pay is below zero', () => {
      expect(computeAnomalySignals(makeInput({ netPayCents: -20000 })).negativeNet).toBe(true);
    });
    it('does NOT trip at exactly zero net pay', () => {
      expect(computeAnomalySignals(makeInput({ netPayCents: 0, avgNetPayCents: null })).negativeNet).toBe(false);
    });
  });

  describe('deductionsExceedGross', () => {
    it('trips when deductions exceed gross', () => {
      const s = computeAnomalySignals(makeInput({ grossPayCents: 190000, deductionsCents: 210000 }));
      expect(s.deductionsExceedGross).toBe(true);
    });
    it('does NOT trip when deductions equal gross', () => {
      const s = computeAnomalySignals(makeInput({ grossPayCents: 190000, deductionsCents: 190000 }));
      expect(s.deductionsExceedGross).toBe(false);
    });
  });

  describe('noLineItems', () => {
    it('trips when there are zero line items', () => {
      expect(computeAnomalySignals(makeInput({ lineItemCount: 0 })).noLineItems).toBe(true);
    });
    it('does NOT trip with at least one line item', () => {
      expect(computeAnomalySignals(makeInput({ lineItemCount: 1 })).noLineItems).toBe(false);
    });
  });

  describe('stale', () => {
    it('trips when older than the default staleDays (7)', () => {
      expect(computeAnomalySignals(makeInput({ ageDays: 9 })).stale).toBe(true);
    });
    it('does NOT trip exactly at the staleDays boundary', () => {
      expect(computeAnomalySignals(makeInput({ ageDays: 7 })).stale).toBe(false);
    });
    it('honors a custom staleDays threshold', () => {
      expect(computeAnomalySignals(makeInput({ ageDays: 4, staleDays: 3 })).stale).toBe(true);
    });
  });

  describe('offAverage', () => {
    it('trips when net is way above average (3× baseline)', () => {
      // $4,900 vs $1,800 average — deviation ≈ 1.72 > 0.6
      expect(computeAnomalySignals(makeInput({ netPayCents: 490000, avgNetPayCents: 180000 })).offAverage).toBe(true);
    });
    it('trips when net is way below average', () => {
      // $400 vs $1,800 average — deviation ≈ 0.78 > 0.6
      expect(computeAnomalySignals(makeInput({ netPayCents: 40000, avgNetPayCents: 180000 })).offAverage).toBe(true);
    });
    it('does NOT trip when net is within range of average', () => {
      // $1,820 vs $1,800 — deviation ≈ 0.011
      expect(computeAnomalySignals(makeInput({ netPayCents: 182000, avgNetPayCents: 180000 })).offAverage).toBe(false);
    });
    it('does NOT trip exactly at the threshold boundary (uses strict >)', () => {
      // net exactly 1.6× average → deviation == 0.6, not > 0.6
      expect(computeAnomalySignals(makeInput({ netPayCents: 288000, avgNetPayCents: 180000 })).offAverage).toBe(false);
    });
    it('honors a custom offAverageThresholdPct', () => {
      // deviation 0.2 > custom 0.1 → trips
      expect(
        computeAnomalySignals(makeInput({ netPayCents: 216000, avgNetPayCents: 180000, offAverageThresholdPct: 0.1 }))
          .offAverage,
      ).toBe(true);
    });

    describe('no baseline (new driver) → null, not a false flag', () => {
      it('returns null when avgNetPayCents is null', () => {
        expect(computeAnomalySignals(makeInput({ avgNetPayCents: null })).offAverage).toBeNull();
      });
      it('returns null when the average is zero (ratio would be meaningless)', () => {
        expect(computeAnomalySignals(makeInput({ avgNetPayCents: 0 })).offAverage).toBeNull();
      });
      it('returns null when the average is negative', () => {
        expect(computeAnomalySignals(makeInput({ avgNetPayCents: -100 })).offAverage).toBeNull();
      });
    });
  });

  it('can trip multiple signals at once (e.g. negative net + no line items + stale)', () => {
    // avgNetPayCents=null isolates this from offAverage so we assert the other
    // four signals deterministically.
    const s = computeAnomalySignals(
      makeInput({
        netPayCents: -5000,
        grossPayCents: 0,
        deductionsCents: 5000,
        lineItemCount: 0,
        ageDays: 30,
        avgNetPayCents: null,
      }),
    );
    expect(s).toEqual({
      negativeNet: true,
      deductionsExceedGross: true,
      noLineItems: true,
      offAverage: null,
      stale: true,
    });
  });
});
