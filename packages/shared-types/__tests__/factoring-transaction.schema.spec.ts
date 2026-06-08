import {
  FactoringTxnTypeSchema,
  RecordFactoringTransactionSchema,
  RecordAdvanceSchema,
  FactoringTransactionSchema,
  FactoringSummarySchema,
  DriverPayTimingSchema,
  SetDriverPayTimingSchema,
  InvoiceStatusSchema,
} from '../src';

describe('FactoringTxnTypeSchema', () => {
  const allValues = ['ADVANCE', 'RESERVE_RELEASE', 'FEE', 'CHARGEBACK', 'CHARGEBACK_REVERSAL'] as const;

  it.each(allValues)('accepts %s', (v) => {
    expect(() => FactoringTxnTypeSchema.parse(v)).not.toThrow();
  });

  it('rejects lowercase value', () => {
    expect(() => FactoringTxnTypeSchema.parse('advance')).toThrow();
  });

  it('rejects unknown value', () => {
    expect(() => FactoringTxnTypeSchema.parse('REFUND')).toThrow();
  });
});

describe('RecordFactoringTransactionSchema (discriminated union)', () => {
  it('accepts an ADVANCE with autoRecordFee omitted (service applies default true)', () => {
    const parsed = RecordFactoringTransactionSchema.parse({
      type: 'ADVANCE',
      amountCents: 190000,
      transactionDate: '2026-04-21',
    });
    expect(parsed.type).toBe('ADVANCE');
    if (parsed.type === 'ADVANCE') {
      // The service applies the default (autoRecordFee ?? true). The schema
      // accepts undefined and leaves it for the service to default — keeps the
      // wire shape forgiving for clients that don't send the flag.
      expect(parsed.autoRecordFee).toBeUndefined();
    }
  });

  it('respects autoRecordFee=false on ADVANCE', () => {
    const parsed = RecordAdvanceSchema.parse({
      type: 'ADVANCE',
      amountCents: 190000,
      transactionDate: '2026-04-21',
      autoRecordFee: false,
    });
    expect(parsed.autoRecordFee).toBe(false);
  });

  it('accepts a RESERVE_RELEASE', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'RESERVE_RELEASE',
        amountCents: 4000,
        transactionDate: '2026-05-21',
      }),
    ).not.toThrow();
  });

  it('accepts a CHARGEBACK with reference + notes', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'CHARGEBACK',
        amountCents: 190000,
        transactionDate: '2026-06-05',
        referenceNumber: 'CB-12345',
        notes: 'Broker disputed invoice',
      }),
    ).not.toThrow();
  });

  it('accepts a CHARGEBACK_REVERSAL', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'CHARGEBACK_REVERSAL',
        amountCents: 190000,
        transactionDate: '2026-06-15',
      }),
    ).not.toThrow();
  });

  it('rejects bad transactionDate format (US date)', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'FEE',
        amountCents: 6000,
        transactionDate: '04/21/2026',
      }),
    ).toThrow(/YYYY-MM-DD/);
  });

  it('rejects amountCents = 0', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'CHARGEBACK',
        amountCents: 0,
        transactionDate: '2026-04-21',
      }),
    ).toThrow();
  });

  it('rejects negative amountCents', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'ADVANCE',
        amountCents: -100,
        transactionDate: '2026-04-21',
      }),
    ).toThrow();
  });

  it('rejects unknown type via discriminator', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'BONUS',
        amountCents: 1000,
        transactionDate: '2026-04-21',
      }),
    ).toThrow();
  });

  it('rejects notes longer than 2000 chars', () => {
    expect(() =>
      RecordFactoringTransactionSchema.parse({
        type: 'FEE',
        amountCents: 6000,
        transactionDate: '2026-04-21',
        notes: 'x'.repeat(2001),
      }),
    ).toThrow();
  });
});

describe('FactoringTransactionSchema (response shape)', () => {
  it('parses a fully-populated ledger row', () => {
    const row = {
      id: 1,
      transactionId: 'FT-20260421-001',
      invoiceId: 42,
      invoiceNumber: 'INV-2026-0042',
      factoringCompanyId: 7,
      factoringCompanyName: 'OTR Solutions',
      type: 'ADVANCE' as const,
      amountCents: 190000,
      transactionDate: '2026-04-21',
      referenceNumber: 'WIRE-123',
      notes: null,
      advanceRatePctSnapshot: '95.00',
      feeRatePctSnapshot: '3.00',
      metadata: { wireId: 'wire_123' },
      createdAt: '2026-04-21T10:00:00.000Z',
      createdBy: 5,
      deletedAt: null,
      tenantId: 1,
    };
    expect(() => FactoringTransactionSchema.parse(row)).not.toThrow();
  });

  it('rejects bad transactionDate', () => {
    expect(() =>
      FactoringTransactionSchema.parse({
        id: 1,
        transactionId: 'FT-x',
        invoiceId: 1,
        factoringCompanyId: 1,
        type: 'ADVANCE',
        amountCents: 1,
        transactionDate: 'not-a-date',
        createdAt: '2026-04-21T10:00:00.000Z',
        tenantId: 1,
      }),
    ).toThrow();
  });
});

describe('FactoringSummarySchema', () => {
  it('parses a zeroed dashboard summary (4A stub shape)', () => {
    const stub = {
      totalSubmittedCents: 0,
      totalSubmittedCount: 0,
      totalFundedCents: 0,
      totalFundedCount: 0,
      totalFeeCents: 0,
      reservesOutstandingCents: 0,
      averageDaysToFund: null,
      recourseRatePct: 0,
    };
    expect(() => FactoringSummarySchema.parse(stub)).not.toThrow();
  });
});

describe('DriverPayTimingSchema', () => {
  it('accepts ON_DELIVERY', () => {
    expect(() => DriverPayTimingSchema.parse('ON_DELIVERY')).not.toThrow();
  });
  it('accepts ON_FACTOR_FUND', () => {
    expect(() => DriverPayTimingSchema.parse('ON_FACTOR_FUND')).not.toThrow();
  });
  it('rejects lowercase', () => {
    expect(() => DriverPayTimingSchema.parse('on_delivery')).toThrow();
  });

  it('SetDriverPayTimingSchema validates request body', () => {
    expect(() => SetDriverPayTimingSchema.parse({ timing: 'ON_FACTOR_FUND' })).not.toThrow();
    expect(() => SetDriverPayTimingSchema.parse({ timing: 'INVALID' })).toThrow();
  });
});

describe('InvoiceStatusSchema (Phase 4 — RECOURSED added)', () => {
  it('accepts RECOURSED', () => {
    expect(() => InvoiceStatusSchema.parse('RECOURSED')).not.toThrow();
  });
});
