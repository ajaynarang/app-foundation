import { LoadStatus } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * Closeout Review fan-out adapter.
 *
 * Pure Prisma query — returns the set of delivered-but-uninvoiced loads the
 * daily sweep (or manual run) should work on. The blocker checks (missing
 * POD/rate-con, no billable charges) run inside hydrate.step per-load, so
 * fan-out stays cheap: it only filters on what's a column on Load.
 *
 * `invoices: { none: {} }` excludes any load that already has ANY invoice
 * row (including VOID). That is deliberately conservative for money logic —
 * we'd rather skip a load whose only invoice was voided than risk a second
 * invoice. A voided load can be re-invoiced manually.
 */
export interface UninvoicedDeliveredLoad {
  loadNumber: string;
  customerId: number;
  customerName: string;
  deliveredAt: string | null;
  hoursSinceDelivery: number;
}

export async function findUninvoicedDeliveredLoadsForTenant(
  prisma: PrismaService,
  tenantId: number,
  opts: { limit?: number; minHoursSinceDelivery?: number } = {},
): Promise<UninvoicedDeliveredLoad[]> {
  const now = new Date();
  const minHours = opts.minHoursSinceDelivery ?? 48;
  const cutoff = new Date(now.getTime() - minHours * 60 * 60 * 1000);

  const rows = await prisma.load.findMany({
    where: {
      tenantId,
      status: LoadStatus.DELIVERED,
      deliveredAt: { lte: cutoff },
      invoices: { none: {} },
    },
    select: {
      loadNumber: true,
      deliveredAt: true,
      customer: { select: { id: true, companyName: true } },
    },
    orderBy: { deliveredAt: 'asc' },
    take: opts.limit ?? 500,
  });

  return rows.map((r) => ({
    loadNumber: r.loadNumber,
    customerId: r.customer.id,
    customerName: r.customer.companyName,
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    hoursSinceDelivery: r.deliveredAt ? hoursBetween(r.deliveredAt, now) : 0,
  }));
}

function hoursBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (60 * 60 * 1000));
}
