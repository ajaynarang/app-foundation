import type { HydrateOutput } from '../step.types';
import type { ArFollowup as ArFollowupTypes } from '@sally/shared-types';

import { buildArFollowupApprovalPayload } from '../approval-adapter';

function makeHydrate(overrides: Partial<HydrateOutput['entity']['invoice']> = {}): HydrateOutput {
  return {
    entity: {
      invoice: {
        invoiceNumber: 'NL-INV-1015',
        amount: 968,
        daysFromDue: 47,
        customerId: '42',
        customerName: 'Granite State Lumber',
        customerEmail: 'billing@gsl.example.com',
        paidCents: 0,
        balanceCents: 96800,
        totalCents: 96800,
        issueDate: '2025-12-01',
        dueDate: '2026-01-01',
        status: 'OVERDUE',
        internalNotes: null,
        ...overrides,
      },
      customerStats: {
        dsoDays: 35,
        avgDaysLate: 4,
        openInvoiceCount: 2,
        openBalanceCents: 96800,
      },
      priorReminderCount: 0,
      priorReminders: [],
    },
    memories: [],
    preflight: { action: 'proceed' },
  };
}

describe('buildArFollowupApprovalPayload', () => {
  it('builds an email artifact from the draft when action=send_reminder', () => {
    const draft: ArFollowupTypes.ArFollowupDraft = {
      to: 'billing@gsl.example.com',
      subject: 'Quick Check-In: Invoice NL-INV-1015',
      body: 'Hope things are going well...',
      toneUsed: 'friendly',
      mentionsAmount: true,
      mentionsDueDate: true,
      confidence: 0.82,
    };
    const out = buildArFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: {
        invoiceState: 'past_due_30_60',
        daysFromDue: 47,
        lastContact: { kind: 'none', daysAgo: null },
        paymentHistorySignal: 'reliable',
        promiseToPayOnFile: { exists: false, dueDate: null, broken: false },
        summary: 'Friendly check-in. GSL usually pays on time — light nudge is the right move.',
        confidence: 0.78,
      },
      decide: {
        action: 'send_reminder',
        reasoning: 'First reminder; reliable payer',
        tone: 'friendly',
        urgency: 'low',
        confidence: 0.8,
      },
      draft,
      proposedAction: { ...draft },
    });

    expect(out.artifact).toEqual({
      kind: 'email',
      to: 'billing@gsl.example.com',
      subject: 'Quick Check-In: Invoice NL-INV-1015',
      body: 'Hope things are going well...',
    });
    expect(out.decisionHeader).toEqual({
      icon: 'Mail',
      title: 'Send reminder to Granite State Lumber',
      entityMeta: 'Invoice NL-INV-1015 · $968.00 · 47 days overdue',
    });
    expect(out.sallysRead).toMatch(/Friendly check-in/);
    expect(out.context).toHaveLength(3);
    expect(out.context?.[2]).toBe('First reminder for this invoice');
    expect(out.confidence).toBeCloseTo(0.82);
  });

  it('falls back to composite when draft is missing and infers send_reminder from proposedAction shape', () => {
    const out = buildArFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: null,
      proposedAction: {
        to: 'x@y.com',
        subject: 's',
        body: 'b',
      },
    });
    // With draft=null, the email artifact can't be built from draft → fall
    // back path renders the raw action as composite field blocks.
    expect(out.artifact?.kind).toBe('composite');
  });

  it('clamps confidence to [0, 1]', () => {
    const out = buildArFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: null,
      decide: null,
      draft: {
        to: 'a',
        subject: 'b',
        body: 'c',
        toneUsed: 'friendly',
        mentionsAmount: false,
        mentionsDueDate: false,
        confidence: 1.5, // out-of-range values from prompt drift
      },
      proposedAction: {},
    });
    expect(out.confidence).toBe(1);
  });

  it('overrides third context bullet with promise-to-pay note when present', () => {
    const out = buildArFollowupApprovalPayload({
      hydrate: makeHydrate(),
      perceive: {
        invoiceState: 'past_due_30_60',
        daysFromDue: 47,
        lastContact: { kind: 'email_sent', daysAgo: 5 },
        paymentHistorySignal: 'slow_but_pays',
        promiseToPayOnFile: { exists: true, dueDate: '2026-02-10', broken: false },
        summary: 'Customer committed to pay by 2/10.',
        confidence: 0.9,
      },
      decide: null,
      draft: null,
      proposedAction: {},
    });
    expect(out.context).toContain('Promise-to-pay on file (due 2026-02-10)');
  });
});
