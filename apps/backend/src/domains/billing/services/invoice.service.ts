/**
 * Invoice Service
 *
 * Manages billing invoices synced from the payment provider.
 * Invoices are primarily created and updated via webhook events.
 * Local DB is the source of truth for invoice history and display.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillingInvoiceStatus, type BillingInvoice, type Prisma } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import type { CursorList } from '@app/shared-types';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';
import { NormalizedBillingEvent } from '../adapters/payment-provider.interface';

/** Newest first; the invoice id is a string id (never an Int key), so it is a safe tiebreak. */
const INVOICE_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;

/** `GET /billing/invoices`. */
export interface InvoiceListQuery {
  limit?: number;
  cursor?: string;
}

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  /**
   * Sync an invoice from a webhook event.
   * Creates or updates the local BillingInvoice record.
   */
  async syncInvoice(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;
    const providerInvoiceId = data.id as string;
    const providerCustomerId = data.customer as string;

    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
    });
    if (!billingCustomer) {
      this.logger.warn(`BillingCustomer not found for invoice sync: ${providerCustomerId}`);
      return;
    }

    const statusMap: Record<string, BillingInvoiceStatus> = {
      draft: BillingInvoiceStatus.DRAFT,
      open: BillingInvoiceStatus.OPEN,
      paid: BillingInvoiceStatus.PAID,
      void: BillingInvoiceStatus.VOID,
      uncollectible: BillingInvoiceStatus.UNCOLLECTIBLE,
    };

    const lineItems = (data.lines?.data ?? []).map((li: any) => ({
      description: li.description ?? '',
      quantity: li.quantity ?? 1,
      unitPriceCents: li.price?.unit_amount ?? 0,
      totalCents: li.amount ?? 0,
    }));

    await this.prisma.billingInvoice.upsert({
      where: { providerInvoiceId },
      update: {
        status: statusMap[data.status] ?? BillingInvoiceStatus.OPEN,
        amountDueCents: data.amount_due ?? 0,
        amountPaidCents: data.amount_paid ?? 0,
        taxCents: data.tax ?? 0,
        lineItems,
        pdfUrl: data.invoice_pdf ?? null,
        hostedInvoiceUrl: data.hosted_invoice_url ?? null,
        paidAt: data.status_transitions?.paid_at ? new Date(data.status_transitions.paid_at * 1000) : null,
      },
      create: {
        tenantId: billingCustomer.tenantId,
        billingCustomerId: billingCustomer.id,
        providerInvoiceId,
        status: statusMap[data.status] ?? BillingInvoiceStatus.OPEN,
        amountDueCents: data.amount_due ?? 0,
        amountPaidCents: data.amount_paid ?? 0,
        taxCents: data.tax ?? 0,
        periodStart: new Date((data.period_start ?? 0) * 1000),
        periodEnd: new Date((data.period_end ?? 0) * 1000),
        lineItems,
        pdfUrl: data.invoice_pdf ?? null,
        hostedInvoiceUrl: data.hosted_invoice_url ?? null,
        paidAt: data.status_transitions?.paid_at ? new Date(data.status_transitions.paid_at * 1000) : null,
      },
    });

    this.logger.log(`Invoice synced: ${providerInvoiceId}`);
  }

  /**
   * List invoices for a tenant from the local database.
   * Supports cursor-based pagination.
   */
  async listInvoices(tenantDbId: number, query: InvoiceListQuery = {}): Promise<CursorList<BillingInvoice>> {
    const take = clampCursorLimit(query.limit);
    const scope: Prisma.BillingInvoiceWhereInput = { tenantId: tenantDbId };
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const where: Prisma.BillingInvoiceWhereInput = query.cursor
      ? { AND: [scope, keysetWhere({ ...INVOICE_KEYSET, cursor: query.cursor })] }
      : scope;

    const [rows, total] = await Promise.all([
      this.prisma.billingInvoice.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      }),
      this.prisma.billingInvoice.count({ where: scope }),
    ]);
    return { ...buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id)), total };
  }

  /**
   * Get the upcoming invoice preview from the payment provider.
   * This is a live preview of the next billing cycle.
   */
  async getUpcomingInvoice(tenantDbId: number) {
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });
    if (!billingCustomer) {
      throw new NotFoundException('No billing customer found for this tenant');
    }

    const adapter = this.providerFactory.getAdapter();
    return adapter.getUpcomingInvoice(billingCustomer.providerCustomerId);
  }

  /**
   * Get the PDF download URL for an invoice.
   */
  async downloadInvoice(tenantDbId: number, invoiceId: string) {
    const invoice = await this.prisma.billingInvoice.findFirst({
      where: { id: invoiceId, tenantId: tenantDbId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!invoice.pdfUrl) {
      throw new NotFoundException('Invoice PDF not available');
    }

    return { pdfUrl: invoice.pdfUrl, hostedUrl: invoice.hostedInvoiceUrl };
  }
}
