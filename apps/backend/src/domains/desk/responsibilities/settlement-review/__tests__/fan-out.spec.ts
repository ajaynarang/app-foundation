import { SettlementStatus } from '@prisma/client';

import type { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { findDraftSettlementsForTenant } from '../fan-out';

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    settlementId: 'stl_1',
    settlementNumber: 'STL-0001',
    grossPayCents: 197000,
    deductionsCents: 15000,
    netPayCents: 182000,
    createdAt: new Date('2026-05-15T00:00:00Z'),
    driver: { driverId: 'drv_1', name: 'Alex Driver' },
    ...overrides,
  };
}

describe('findDraftSettlementsForTenant', () => {
  it('queries DRAFT settlements scoped to the tenant and maps display fields', async () => {
    const findMany = jest.fn().mockResolvedValue([makeRow()]);
    const prisma = { settlement: { findMany } } as unknown as PrismaService;

    const result = await findDraftSettlementsForTenant(prisma, 10);

    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: 10, status: SettlementStatus.DRAFT });
    expect(args.orderBy).toEqual({ createdAt: 'asc' });
    expect(args.take).toBe(500);

    expect(result).toEqual([
      {
        settlementId: 'stl_1',
        settlementNumber: 'STL-0001',
        driverId: 'drv_1',
        driverName: 'Alex Driver',
        netPayCents: 182000,
        grossPayCents: 197000,
        deductionsCents: 15000,
        createdAt: new Date('2026-05-15T00:00:00Z'),
      },
    ]);
  });

  it('honors a custom limit', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { settlement: { findMany } } as unknown as PrismaService;

    await findDraftSettlementsForTenant(prisma, 10, { limit: 25 });

    expect(findMany.mock.calls[0][0].take).toBe(25);
  });

  it('returns an empty array when there are no draft settlements', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { settlement: { findMany } } as unknown as PrismaService;

    expect(await findDraftSettlementsForTenant(prisma, 10)).toEqual([]);
  });
});
