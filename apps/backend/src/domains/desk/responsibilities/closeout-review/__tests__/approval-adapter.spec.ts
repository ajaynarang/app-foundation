import type { CloseoutReview as CloseoutReviewTypes } from '@sally/shared-types';

import type { CloseoutHydrateOutput } from '../step.types';
import { buildCloseoutReviewApprovalPayload } from '../approval-adapter';

function makeHydrate(overrides: Partial<CloseoutHydrateOutput['entity']> = {}): CloseoutHydrateOutput {
  return {
    entity: {
      load: {
        loadNumber: 'LD-20260518-001',
        customerId: '42',
        customerName: 'Acme Logistics',
        deliveredAt: '2026-05-18T00:00:00.000Z',
        hoursSinceDelivery: 72,
        billingStatus: 'APPROVED',
        status: 'DELIVERED',
      },
      readiness: { score: 100, hasBlockers: false, readyToApprove: true, blockers: [] },
      charges: {
        hasBillableCharges: true,
        billableTotalDollars: 2450,
        items: [
          { chargeType: 'linehaul', description: 'Line haul', quantity: 1, unitPriceDollars: 2200, totalDollars: 2200 },
          {
            chargeType: 'fuel_surcharge',
            description: 'Fuel surcharge',
            quantity: 1,
            unitPriceDollars: 250,
            totalDollars: 250,
          },
        ],
      },
      ...overrides,
    },
    memories: [],
    preflight: { action: 'proceed' },
  };
}

function makeDraft(): CloseoutReviewTypes.CloseoutReviewDraft {
  return {
    customerName: 'Acme Logistics',
    totalDollars: 2450,
    lineItems: [
      { description: 'Line haul', quantity: 1, unitPriceDollars: 2200, totalDollars: 2200 },
      { description: 'Fuel surcharge', quantity: 1, unitPriceDollars: 250, totalDollars: 250 },
    ],
    summary: 'Ready to invoice — $2,450, Acme Logistics, 2 line items.',
    confidence: 0.88,
  };
}

describe('buildCloseoutReviewApprovalPayload', () => {
  it('builds a composite invoice-preview artifact from the draft', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: {
        billingState: 'billable',
        hoursSinceDelivery: 72,
        hasBillableCharges: true,
        blockers: [],
        summary: 'Delivered 3 days ago, POD + rate-con on file — ready to invoice.',
        confidence: 0.85,
      },
      decide: { action: 'draft_invoice', reasoning: 'ready', confidence: 0.87 },
      draft: makeDraft(),
      proposedAction: { loadNumber: 'LD-20260518-001' },
    });

    expect(out.artifact?.kind).toBe('composite');
    const blocks = (out.artifact as { blocks: Array<Record<string, unknown>> }).blocks;
    expect(blocks).toEqual(
      expect.arrayContaining([
        { type: 'field', label: 'Customer', value: 'Acme Logistics' },
        { type: 'field', label: 'Total', value: '$2450.00', mono: true },
        expect.objectContaining({
          type: 'list',
          label: 'Line items',
          items: expect.arrayContaining([expect.stringContaining('Line haul')]),
        }),
      ]),
    );
  });

  it('builds the decision header with customer, total, and age', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: makeDraft(),
      proposedAction: {},
    });
    expect(out.decisionHeader).toEqual({
      icon: 'FileText',
      title: 'Invoice Acme Logistics',
      entityMeta: 'Load LD-20260518-001 · $2450.00 · delivered 72h ago',
    });
  });

  it('context bullets report age, charge count/total, and ready state', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: makeDraft(),
      proposedAction: {},
    });
    expect(out.context).toEqual([
      'Delivered 72h ago, never invoiced',
      '2 billable charges · $2450.00',
      'Documents on file — ready to bill',
    ]);
  });

  it('surfaces blockers in the context when readiness has blockers', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate({
        readiness: { score: 50, hasBlockers: true, readyToApprove: false, blockers: ['POD: missing'] },
      }),
      perceive: null,
      decide: null,
      draft: null,
      proposedAction: {},
    });
    expect(out.context).toContain('Billing blockers: POD: missing');
  });

  it('clamps confidence to [0, 1] and prefers draft confidence', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: { ...makeDraft(), confidence: 1.5 },
      proposedAction: {},
    });
    expect(out.confidence).toBe(1);
  });

  it('falls back to a composite of the raw action when no draft is present', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: null,
      proposedAction: { loadNumber: 'LD-20260518-001' },
    });
    expect(out.artifact?.kind).toBe('composite');
    const blocks = (out.artifact as { blocks: Array<Record<string, unknown>> }).blocks;
    expect(blocks).toContainEqual({ type: 'field', label: 'loadNumber', value: 'LD-20260518-001' });
  });

  it('returns null header when hydrate is missing', () => {
    const out = buildCloseoutReviewApprovalPayload({
      hydrate: null,
      perceive: null,
      decide: null,
      draft: null,
      proposedAction: {},
    });
    expect(out.decisionHeader).toBeNull();
  });
});
