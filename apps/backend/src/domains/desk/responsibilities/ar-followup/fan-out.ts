import { PrismaService } from '../../../../infrastructure/database/prisma.service';

/**
 * AR Follow-up fan-out adapter.
 *
 * Pure Prisma query — returns the set of overdue invoices the daily
 * sweep (or manual run) should work on. Preflight rules run inside
 * hydrate.step for each episode, so this function doesn't filter by
 * promise-to-pay / recent-reminder — hydrate handles that per-invoice
 * in context. Keeps fan-out cheap and simple.
 */
export interface OverdueInvoice {
  invoiceNumber: string;
  customerId: number;
  customerName: string;
  amount: number;
  daysOverdue: number;
}

export async function findOverdueInvoicesForTenant(
  prisma: PrismaService,
  tenantId: number,
  opts: { limit?: number; minDaysOverdue?: number } = {},
): Promise<OverdueInvoice[]> {
  const today = new Date();
  const minDays = opts.minDaysOverdue ?? 1;
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - minDays);

  const rows = await prisma.invoice.findMany({
    where: {
      tenantId,
      status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
      balanceCents: { gt: 0 },
      dueDate: { lte: cutoff },
    },
    select: {
      invoiceNumber: true,
      totalCents: true,
      dueDate: true,
      customer: { select: { id: true, companyName: true } },
    },
    orderBy: { dueDate: 'asc' },
    take: opts.limit ?? 500,
  });

  return rows.map((r) => ({
    invoiceNumber: r.invoiceNumber,
    customerId: r.customer.id,
    customerName: r.customer.companyName,
    amount: r.totalCents / 100,
    daysOverdue: daysBetween(r.dueDate, today),
  }));
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}
