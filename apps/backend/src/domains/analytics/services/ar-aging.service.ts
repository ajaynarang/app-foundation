import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

interface AgingBucket {
  label: string;
  count: number;
  totalCents: number;
}

interface CustomerAging {
  customerId: number;
  companyName: string;
  currentCents: number;
  aging1to30Cents: number;
  aging31to60Cents: number;
  aging61to90Cents: number;
  aging90PlusCents: number;
  totalOutstandingCents: number;
}

export interface ArAgingReport {
  buckets: AgingBucket[];
  totalOutstandingCents: number;
  totalOverdueCents: number;
  byCustomer: CustomerAging[];
}

const DAY_MS = 86_400_000;

/**
 * Bucket index by days past due. Industry standard (QuickBooks,
 * Mercury, US trucking back-office workflows) — answers "how late is
 * the payment", not "how old is the invoice", because that's the
 * mental model controllers use to chase collections. The five buckets
 * also match what `InvoicingService.getSummary` returns to the billing
 * KPI strip and AR Health UI, so the export and the on-screen totals
 * agree.
 *
 * - Current  : not yet due (daysPastDue < 1, including invoices with no dueDate)
 * - 1-30     : 1 – 30 days past due
 * - 31-60    : 31 – 60 days past due
 * - 61-90    : 61 – 90 days past due
 * - 90+      : more than 90 days past due
 */
function classifyBucket(daysPastDue: number): number {
  if (daysPastDue < 1) return 0; // Current / not yet due
  if (daysPastDue <= 30) return 1;
  if (daysPastDue <= 60) return 2;
  if (daysPastDue <= 90) return 3;
  return 4;
}

@Injectable()
export class ArAgingService {
  private readonly logger = new Logger(ArAgingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getArAging(tenantId: number): Promise<ArAgingReport> {
    const now = new Date();
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { notIn: ['PAID', 'VOID'] },
      },
      select: {
        id: true,
        customerId: true,
        balanceCents: true,
        issueDate: true,
        dueDate: true,
        customer: { select: { id: true, companyName: true } },
      },
    });

    const buckets: AgingBucket[] = [
      { label: 'Current', count: 0, totalCents: 0 },
      { label: '1-30 days', count: 0, totalCents: 0 },
      { label: '31-60 days', count: 0, totalCents: 0 },
      { label: '61-90 days', count: 0, totalCents: 0 },
      { label: '90+ days', count: 0, totalCents: 0 },
    ];

    let totalOutstandingCents = 0;
    let totalOverdueCents = 0;

    const customerMap = new Map<number, CustomerAging>();

    for (const inv of invoices) {
      const balance = inv.balanceCents ?? 0;
      // Days past due — negative or null dueDate counts as not-yet-due (Current).
      const daysPastDue = inv.dueDate ? Math.floor((now.getTime() - inv.dueDate.getTime()) / DAY_MS) : 0;

      totalOutstandingCents += balance;

      if (daysPastDue >= 1) {
        totalOverdueCents += balance;
      }

      const bucketIdx = classifyBucket(daysPastDue);
      buckets[bucketIdx].count += 1;
      buckets[bucketIdx].totalCents += balance;

      if (inv.customer) {
        const existing = customerMap.get(inv.customer.id) ?? {
          customerId: inv.customer.id,
          companyName: inv.customer.companyName,
          currentCents: 0,
          aging1to30Cents: 0,
          aging31to60Cents: 0,
          aging61to90Cents: 0,
          aging90PlusCents: 0,
          totalOutstandingCents: 0,
        };

        if (bucketIdx === 0) existing.currentCents += balance;
        else if (bucketIdx === 1) existing.aging1to30Cents += balance;
        else if (bucketIdx === 2) existing.aging31to60Cents += balance;
        else if (bucketIdx === 3) existing.aging61to90Cents += balance;
        else existing.aging90PlusCents += balance;
        existing.totalOutstandingCents += balance;

        customerMap.set(inv.customer.id, existing);
      }
    }

    return {
      buckets,
      totalOutstandingCents,
      totalOverdueCents,
      byCustomer: Array.from(customerMap.values()).sort((a, b) => b.totalOutstandingCents - a.totalOutstandingCents),
    };
  }
}
