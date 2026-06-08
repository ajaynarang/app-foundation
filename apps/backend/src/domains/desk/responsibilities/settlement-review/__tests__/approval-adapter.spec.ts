import type { SettlementReview as SettlementReviewTypes } from '@sally/shared-types';

import { buildSettlementReviewApprovalPayload } from '../approval-adapter';
import type { SettlementReviewHydrateOutput } from '../step.types';

function makeHydrate(
  settlementOver: Partial<SettlementReviewHydrateOutput['entity']['settlement']> = {},
  signalsOver: Partial<SettlementReviewTypes.SettlementAnomalySignals> = {},
  baselineOver: Partial<SettlementReviewHydrateOutput['entity']['baseline']> = {},
): SettlementReviewHydrateOutput {
  return {
    entity: {
      settlement: {
        settlementId: 'stl_1',
        settlementNumber: 'STL-0001',
        driverId: 'drv_1',
        driverName: 'Alex Driver',
        status: 'DRAFT',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-07',
        grossPayCents: 197000,
        deductionsCents: 15000,
        netPayCents: 182000,
        createdAt: '2026-05-19T00:00:00Z',
        ageDays: 2,
        lineItems: [
          { description: 'Chicago → Dallas', loadNumber: 'L-100', payAmountCents: 98000 },
          { description: 'Dallas → Denver', loadNumber: 'L-101', payAmountCents: 99000 },
        ],
        deductions: [{ type: 'FUEL_ADVANCE', description: 'Fuel advance', amountCents: 15000 }],
        ...settlementOver,
      },
      baseline: { avgNetPayCents: 180000, sampleSize: 6, ...baselineOver },
      signals: {
        negativeNet: false,
        deductionsExceedGross: false,
        noLineItems: false,
        offAverage: false,
        stale: false,
        ...signalsOver,
      },
    },
    memories: [],
    preflight: { action: 'proceed' },
  };
}

function makePerceive(
  over: Partial<SettlementReviewTypes.SettlementReviewPerceive> = {},
): SettlementReviewTypes.SettlementReviewPerceive {
  return { summary: 'Looks clean and within range.', trippedSignals: [], looksClean: true, confidence: 0.82, ...over };
}

describe('buildSettlementReviewApprovalPayload', () => {
  describe('clean settlement (approve)', () => {
    it('builds a composite artifact with the breakdown and an approve header', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate(),
        perceive: makePerceive(),
        decide: { action: 'approve', reasoning: 'Within range', confidence: 0.88 },
        proposedAction: { settlementId: 'stl_1' },
      });

      expect(out.artifact?.kind).toBe('composite');
      const composite = out.artifact as Extract<typeof out.artifact, { kind: 'composite' }>;
      // No critical flag block on a clean settlement.
      expect(composite.blocks.some((b) => b.type === 'flag')).toBe(false);
      expect(composite.blocks).toContainEqual({ type: 'field', label: 'Net pay', value: '$1820.00', mono: true });

      expect(out.decisionHeader).toEqual({
        icon: 'CheckCircle',
        title: 'Approve settlement for Alex Driver',
        entityMeta: 'STL-0001 · net $1820.00 · 2d old',
      });
      // Clean + a perceive summary → Sally's read is the summary's first sentence.
      expect(out.sallysRead).toBe('Looks clean and within range.');
      expect(out.confidence).toBeCloseTo(0.88);
    });

    it('falls back to "Clean — within range" when there is no perceive summary', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate(),
        perceive: null,
        decide: { action: 'approve', reasoning: 'ok', confidence: 0.9 },
        proposedAction: {},
      });
      expect(out.sallysRead).toBe('Clean — within range');
    });

    it('builds an average-comparison context bullet', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate(),
        perceive: makePerceive(),
        decide: { action: 'approve', reasoning: 'ok', confidence: 0.9 },
        proposedAction: {},
      });
      expect(out.context?.[0]).toBe('Net $1820.00 vs $1800.00 avg over last 6');
    });
  });

  describe('anomalous settlement (flag)', () => {
    it('prepends a critical flag block and renders the ⚠ read deterministically', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate({ netPayCents: -20000 }, { negativeNet: true }),
        perceive: makePerceive({ summary: 'Net is negative.', looksClean: false }),
        decide: { action: 'flag_anomaly', anomalyKind: 'negativeNet', reasoning: 'Negative net', confidence: 0.95 },
        proposedAction: {},
      });

      const composite = out.artifact as Extract<typeof out.artifact, { kind: 'composite' }>;
      expect(composite.blocks[0]).toEqual({ type: 'flag', variant: 'critical', text: 'Net pay is negative' });
      expect(out.sallysRead).toBe('⚠ Net pay is negative');
      expect(out.decisionHeader?.icon).toBe('AlertTriangle');
      expect(out.decisionHeader?.title).toBe('Review settlement for Alex Driver');
    });

    it('joins multiple anomalies in the read and counts them in context', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate({ lineItems: [] }, { noLineItems: true, stale: true }),
        perceive: makePerceive({ looksClean: false }),
        decide: { action: 'flag_anomaly', reasoning: 'multiple', confidence: 0.9 },
        proposedAction: {},
      });
      expect(out.sallysRead).toBe('⚠ No loads attached; Draft has been sitting unactioned');
      expect(out.context).toContain('2 anomaly signals tripped');
    });
  });

  describe('no baseline (new driver)', () => {
    it('does not treat offAverage=null as an anomaly and notes no history', () => {
      const out = buildSettlementReviewApprovalPayload({
        hydrate: makeHydrate({}, { offAverage: null }, { avgNetPayCents: null, sampleSize: 0 }),
        perceive: null,
        decide: { action: 'approve', reasoning: 'ok', confidence: 0.8 },
        proposedAction: {},
      });
      // No anomaly (offAverage=null is not an anomaly) + no perceive → static read.
      expect(out.sallysRead).toBe('Clean — within range');
      expect(out.context?.[0]).toBe('No settlement history yet for this driver');
    });
  });

  it('clamps confidence to [0, 1]', () => {
    const out = buildSettlementReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: { action: 'approve', reasoning: 'ok', confidence: 1.7 },
      proposedAction: {},
    });
    expect(out.confidence).toBe(1);
  });

  it('returns null artifact/header when hydrate is missing', () => {
    const out = buildSettlementReviewApprovalPayload({
      hydrate: null,
      perceive: null,
      decide: null,
      proposedAction: {},
    });
    expect(out.artifact).toBeNull();
    expect(out.decisionHeader).toBeNull();
  });
});
