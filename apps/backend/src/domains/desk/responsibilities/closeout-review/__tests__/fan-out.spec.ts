import { LoadStatus } from '@prisma/client';

import { findUninvoicedDeliveredLoadsForTenant } from '../fan-out';

/**
 * Closeout Review fan-out — pins the Prisma query shape (DELIVERED + aged +
 * no invoice) and the row → DTO mapping. The query itself is exercised
 * end-to-end at the integration layer; this guards the where-clause + mapping.
 */

function makeLoadRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    loadNumber: 'LD-20260518-001',
    deliveredAt: new Date('2026-05-18T00:00:00.000Z'),
    customer: { id: 42, companyName: 'Acme Logistics' },
    ...overrides,
  };
}

describe('findUninvoicedDeliveredLoadsForTenant', () => {
  it('queries DELIVERED loads aged past the cutoff with no invoice, scoped by tenant', async () => {
    const findMany = jest.fn().mockResolvedValue([makeLoadRow()]);
    const prisma = { load: { findMany } } as never;

    const now = new Date('2026-05-21T00:00:00.000Z');
    jest.useFakeTimers().setSystemTime(now);

    const result = await findUninvoicedDeliveredLoadsForTenant(prisma, 10, { minHoursSinceDelivery: 48 });

    const args = findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe(10);
    expect(args.where.status).toBe(LoadStatus.DELIVERED);
    expect(args.where.invoices).toEqual({ none: {} });
    // cutoff = now - 48h = 2026-05-19T00:00:00Z
    expect(args.where.deliveredAt.lte).toEqual(new Date('2026-05-19T00:00:00.000Z'));
    expect(args.orderBy).toEqual({ deliveredAt: 'asc' });

    expect(result).toEqual([
      {
        loadNumber: 'LD-20260518-001',
        customerId: 42,
        customerName: 'Acme Logistics',
        deliveredAt: '2026-05-18T00:00:00.000Z',
        hoursSinceDelivery: 72,
      },
    ]);

    jest.useRealTimers();
  });

  it('defaults minHoursSinceDelivery to 48 when not provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { load: { findMany } } as never;
    jest.useFakeTimers().setSystemTime(new Date('2026-05-21T12:00:00.000Z'));

    await findUninvoicedDeliveredLoadsForTenant(prisma, 10);

    const args = findMany.mock.calls[0][0];
    expect(args.where.deliveredAt.lte).toEqual(new Date('2026-05-19T12:00:00.000Z'));
    jest.useRealTimers();
  });

  it('applies the limit when provided', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { load: { findMany } } as never;

    await findUninvoicedDeliveredLoadsForTenant(prisma, 10, { limit: 25 });

    expect(findMany.mock.calls[0][0].take).toBe(25);
  });

  it('handles a null deliveredAt without throwing (hoursSinceDelivery=0)', async () => {
    const findMany = jest.fn().mockResolvedValue([makeLoadRow({ deliveredAt: null })]);
    const prisma = { load: { findMany } } as never;

    const result = await findUninvoicedDeliveredLoadsForTenant(prisma, 10);

    expect(result[0].deliveredAt).toBeNull();
    expect(result[0].hoursSinceDelivery).toBe(0);
  });
});
