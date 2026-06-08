import { backfillFactoringMoney } from '../backfill-factoring-money';

function makeInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    invoiceId: 'inv_test_001',
    invoiceNumber: 'INV-001',
    tenantId: 1,
    factoringCompanyId: 5,
    totalCents: 200000,
    status: 'FACTORED',
    submittedToFactorAt: new Date('2026-04-21T10:00:00Z'),
    advanceAmountCents: null,
    factoringCompanyRel: {
      id: 5,
      companyId: 'fc_abc',
      advanceRatePct: '95.00',
      feeRatePct: '3.00',
    },
    tenant: { tenantId: 'sally-demo' },
    ...overrides,
  };
}

function mockPrisma(invoices: any[], existingAdvances: Record<number, any> = {}) {
  const transactions: any[] = [];
  return {
    invoice: {
      findMany: jest.fn().mockResolvedValue(invoices),
      update: jest.fn().mockResolvedValue({}),
    },
    factoringTransaction: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
        return existingAdvances[where.invoiceId] ?? null;
      }),
      create: jest.fn().mockImplementation(async ({ data }: any) => {
        transactions.push(data);
        return data;
      }),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      // Run callback with the same prisma instance.
      return cb(this);
    }),
    $disconnect: jest.fn(),
  } as any;
}

describe('backfillFactoringMoney', () => {
  const log = jest.fn();
  beforeEach(() => log.mockClear());

  it('backfills a FACTORED invoice with rate-card → ADVANCE + FEE rows + denormalize', async () => {
    const inv = makeInvoice({ totalCents: 200000 });
    const prisma = mockPrisma([inv]);
    prisma.$transaction = jest.fn().mockImplementation(async (cb) => cb(prisma));

    const stats = await backfillFactoringMoney(prisma, { dryRun: false, days: 90 }, log);

    expect(stats.backfilled).toBe(1);
    expect(stats.skippedExisting).toBe(0);
    expect(stats.skippedNoRateCard).toBe(0);
    // ADVANCE = 95% of 200000 = 190000; FEE = 3% = 6000.
    expect(prisma.factoringTransaction.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ type: 'ADVANCE', amountCents: 190000 }),
      }),
    );
    expect(prisma.factoringTransaction.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ type: 'FEE', amountCents: 6000 }),
      }),
    );
    // Invoice denormalize uses computed values.
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          advanceAmountCents: 190000,
          factoringFeeCents: 6000,
          reserveAmountCents: 4000, // 200000 - 190000 - 6000
        }),
      }),
    );
    expect(stats.perTenant['sally-demo']).toBe(1);
  });

  it('is idempotent — invoice with existing ADVANCE row is skipped', async () => {
    const inv = makeInvoice();
    const prisma = mockPrisma([inv], { 1: { id: 99, type: 'ADVANCE' } });
    const stats = await backfillFactoringMoney(prisma, { dryRun: false, days: 90 }, log);
    expect(stats.skippedExisting).toBe(1);
    expect(stats.backfilled).toBe(0);
    expect(prisma.factoringTransaction.create).not.toHaveBeenCalled();
  });

  it('skips invoices whose factoringCompany lacks rate-card', async () => {
    const inv = makeInvoice({ factoringCompanyRel: { id: 5, advanceRatePct: null, feeRatePct: null } });
    const prisma = mockPrisma([inv]);
    const stats = await backfillFactoringMoney(prisma, { dryRun: false, days: 90 }, log);
    expect(stats.skippedNoRateCard).toBe(1);
    expect(stats.backfilled).toBe(0);
  });

  it('respects --dry-run flag (no writes, still counts in stats)', async () => {
    const inv = makeInvoice();
    const prisma = mockPrisma([inv]);
    const stats = await backfillFactoringMoney(prisma, { dryRun: true, days: 90 }, log);
    expect(prisma.factoringTransaction.create).not.toHaveBeenCalled();
    expect(prisma.invoice.update).not.toHaveBeenCalled();
    expect(stats.backfilled).toBe(1);
  });

  it('marks every backfilled row with metadata.estimated=true and pleaseVerify=true (4C banner data feed)', async () => {
    const inv = makeInvoice();
    const prisma = mockPrisma([inv]);
    prisma.$transaction = jest.fn().mockImplementation(async (cb) => cb(prisma));
    await backfillFactoringMoney(prisma, { dryRun: false, days: 90 }, log);
    const advanceCall = (prisma.factoringTransaction.create as jest.Mock).mock.calls[0][0];
    expect(advanceCall.data.metadata).toEqual(
      expect.objectContaining({ estimated: true, pleaseVerify: true, source: 'backfill-2026-04-29' }),
    );
  });

  it('per-tenant scoping — only matches the requested tenant slug', async () => {
    const inv = makeInvoice({ tenant: { tenantId: 'wrong-tenant' } });
    const prisma = mockPrisma([]); // simulating: findMany filtered by tenantSlug returns no rows
    await backfillFactoringMoney(prisma, { dryRun: true, days: 90, tenantSlug: 'sally-demo' }, log);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenant: { tenantId: 'sally-demo' },
        }),
      }),
    );
    void inv;
  });

  it('reports per-tenant counts for ops auditing', async () => {
    const invs = [
      makeInvoice({ id: 1, invoiceId: 'inv_a', tenant: { tenantId: 'fleet-a' } }),
      makeInvoice({ id: 2, invoiceId: 'inv_b', tenant: { tenantId: 'fleet-a' } }),
      makeInvoice({ id: 3, invoiceId: 'inv_c', tenant: { tenantId: 'fleet-b' } }),
    ];
    const prisma = mockPrisma(invs);
    prisma.$transaction = jest.fn().mockImplementation(async (cb) => cb(prisma));
    const stats = await backfillFactoringMoney(prisma, { dryRun: false, days: 90 }, log);
    expect(stats.backfilled).toBe(3);
    expect(stats.perTenant['fleet-a']).toBe(2);
    expect(stats.perTenant['fleet-b']).toBe(1);
  });
});
