import { Test, TestingModule } from '@nestjs/testing';
import { ArAgingService } from '../ar-aging.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const mockPrisma = {
  invoice: { findMany: jest.fn() },
};

describe('ArAgingService', () => {
  let service: ArAgingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [ArAgingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<ArAgingService>(ArAgingService);
  });

  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  it('buckets by days past due (industry standard), not days since invoice', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      // Not yet due — issued 10 days ago, due 20 days in the FUTURE.
      // The old (broken) code would bucket this as 'Current' because
      // daysSinceInvoice <= 30. The new code agrees (daysPastDue < 1).
      {
        id: 1,
        customerId: 1,
        balanceCents: 10000,
        issueDate: daysAgo(10),
        dueDate: daysAgo(-20),
        customer: { id: 1, companyName: 'Acme' },
      },
      // Late — issued 45 days ago, due 15 days ago = 15 days past due → bucket 1-30.
      // The old code would put this in 31-60 (based on issue age). New: 1-30.
      {
        id: 2,
        customerId: 1,
        balanceCents: 20000,
        issueDate: daysAgo(45),
        dueDate: daysAgo(15),
        customer: { id: 1, companyName: 'Acme' },
      },
      // Late — 100 days ago, due 70 days ago = 70 days past due → 61-90.
      // The old code would put this in 90+ (based on issue age). New: 61-90.
      {
        id: 3,
        customerId: 2,
        balanceCents: 50000,
        issueDate: daysAgo(100),
        dueDate: daysAgo(70),
        customer: { id: 2, companyName: 'Big Corp' },
      },
    ]);

    const result = await service.getArAging(1);

    expect(result.totalOutstandingCents).toBe(80000);
    expect(result.totalOverdueCents).toBe(70000);
    expect(result.buckets).toHaveLength(5);
    expect(result.buckets[0]).toEqual({ label: 'Current', count: 1, totalCents: 10000 });
    expect(result.buckets[1]).toEqual({ label: '1-30 days', count: 1, totalCents: 20000 });
    expect(result.buckets[2]).toEqual({ label: '31-60 days', count: 0, totalCents: 0 });
    expect(result.buckets[3]).toEqual({ label: '61-90 days', count: 1, totalCents: 50000 });
    expect(result.buckets[4]).toEqual({ label: '90+ days', count: 0, totalCents: 0 });
  });

  it('reports a customer breakdown with the same 5 bucket columns as the tenant totals', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 1,
        balanceCents: 10000,
        issueDate: daysAgo(10),
        dueDate: daysAgo(-5),
        customer: { id: 1, companyName: 'Acme' },
      },
      {
        id: 2,
        customerId: 1,
        balanceCents: 20000,
        issueDate: daysAgo(45),
        dueDate: daysAgo(15),
        customer: { id: 1, companyName: 'Acme' },
      },
      {
        id: 3,
        customerId: 2,
        balanceCents: 50000,
        issueDate: daysAgo(100),
        dueDate: daysAgo(70),
        customer: { id: 2, companyName: 'Big Corp' },
      },
    ]);

    const result = await service.getArAging(1);

    expect(result.byCustomer).toHaveLength(2);
    // Sorted by totalOutstandingCents descending — Big Corp first.
    expect(result.byCustomer[0]).toEqual({
      customerId: 2,
      companyName: 'Big Corp',
      currentCents: 0,
      aging1to30Cents: 0,
      aging31to60Cents: 0,
      aging61to90Cents: 50000,
      aging90PlusCents: 0,
      totalOutstandingCents: 50000,
    });
    expect(result.byCustomer[1]).toEqual({
      customerId: 1,
      companyName: 'Acme',
      currentCents: 10000,
      aging1to30Cents: 20000,
      aging31to60Cents: 0,
      aging61to90Cents: 0,
      aging90PlusCents: 0,
      totalOutstandingCents: 30000,
    });
  });

  it('treats an invoice with no dueDate as Current (cannot be overdue)', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      {
        id: 1,
        customerId: 1,
        balanceCents: 10000,
        issueDate: daysAgo(60),
        dueDate: null,
        customer: { id: 1, companyName: 'Acme' },
      },
    ]);

    const result = await service.getArAging(1);

    expect(result.buckets[0]).toEqual({ label: 'Current', count: 1, totalCents: 10000 });
    expect(result.totalOverdueCents).toBe(0);
  });

  it('returns empty result with five buckets when there are no invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    const result = await service.getArAging(1);
    expect(result.totalOutstandingCents).toBe(0);
    expect(result.byCustomer).toHaveLength(0);
    expect(result.buckets).toHaveLength(5);
    expect(result.buckets.every((b) => b.count === 0 && b.totalCents === 0)).toBe(true);
  });
});
