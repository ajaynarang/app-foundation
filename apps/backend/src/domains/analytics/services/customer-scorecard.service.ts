import { Injectable, Logger } from '@nestjs/common';
import { QUERY_SAFETY_LIMIT } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

export interface CustomerScorecardRow {
  customerId: number;
  companyName: string;
  loadCount: number;
  revenueCents: number;
  avgPayDays: number;
  outstandingCents: number;
  onTimeDeliveryPercent: number;
}

@Injectable()
export class CustomerScorecardService {
  private readonly logger = new Logger(CustomerScorecardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCustomerScorecard(
    tenantId: number,
    dateFrom: Date,
    dateTo: Date,
    limit?: number,
  ): Promise<CustomerScorecardRow[]> {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId },
      select: { id: true, companyName: true },
    });

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: { gte: dateFrom, lte: dateTo },
        customerId: { gt: 0 },
      },
      take: QUERY_SAFETY_LIMIT, // Safety valve — prevents OOM on large tenants
      select: {
        customerId: true,
        rateCents: true,
        deliveredAt: true,
        deliveryDate: true,
        invoices: {
          where: { status: { not: 'VOID' } },
          select: { totalCents: true },
          take: 1,
        },
      },
    });

    // Get payment stats — scoped to last 12 months to avoid unbounded queries
    const twelveMonthsAgo = new Date(dateFrom.getTime() - 365 * 24 * 60 * 60 * 1000);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        customerId: { gt: 0 },
        createdAt: { gte: twelveMonthsAgo },
      },
      select: {
        customerId: true,
        status: true,
        totalCents: true,
        balanceCents: true,
        issueDate: true,
        paidDate: true,
      },
    });

    const customerMap = new Map<
      number,
      {
        companyName: string;
        loadCount: number;
        revenueCents: number;
        onTimeCount: number;
        payDaysSum: number;
        paidInvoiceCount: number;
        outstandingCents: number;
      }
    >();

    for (const c of customers) {
      customerMap.set(c.id, {
        companyName: c.companyName,
        loadCount: 0,
        revenueCents: 0,
        onTimeCount: 0,
        payDaysSum: 0,
        paidInvoiceCount: 0,
        outstandingCents: 0,
      });
    }

    for (const load of loads) {
      if (!load.customerId) continue;
      const entry = customerMap.get(load.customerId);
      if (!entry) continue;

      const revenueCents = load.invoices[0]?.totalCents ?? load.rateCents ?? 0;
      entry.loadCount += 1;
      entry.revenueCents += revenueCents;

      if (load.deliveryDate && load.deliveredAt) {
        const deadline = new Date(load.deliveryDate);
        deadline.setHours(23, 59, 59, 999);
        if (load.deliveredAt <= deadline) entry.onTimeCount += 1;
      } else {
        entry.onTimeCount += 1;
      }
    }

    for (const inv of invoices) {
      if (!inv.customerId) continue;
      const entry = customerMap.get(inv.customerId);
      if (!entry) continue;

      if (inv.status === 'PAID' && inv.issueDate && inv.paidDate) {
        const daysDiff = Math.round((inv.paidDate.getTime() - inv.issueDate.getTime()) / (1000 * 60 * 60 * 24));
        entry.payDaysSum += daysDiff;
        entry.paidInvoiceCount += 1;
      }

      if (inv.status !== 'PAID' && inv.status !== 'VOID') {
        entry.outstandingCents += inv.balanceCents ?? 0;
      }
    }

    return Array.from(customerMap.entries())
      .map(([customerId, data]) => ({
        customerId,
        companyName: data.companyName,
        loadCount: data.loadCount,
        revenueCents: data.revenueCents,
        avgPayDays: data.paidInvoiceCount > 0 ? Math.round(data.payDaysSum / data.paidInvoiceCount) : 0,
        outstandingCents: data.outstandingCents,
        onTimeDeliveryPercent: data.loadCount > 0 ? Math.round((data.onTimeCount / data.loadCount) * 1000) / 10 : 100,
      }))
      .filter((c) => c.loadCount > 0)
      .sort((a, b) => b.revenueCents - a.revenueCents)
      .slice(0, limit ?? 100);
  }
}
