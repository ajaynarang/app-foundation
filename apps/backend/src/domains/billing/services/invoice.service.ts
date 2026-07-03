/**
 * Invoice Service
 *
 * Manages billing invoices synced from the payment provider.
 * Invoices are primarily created and updated via webhook events.
 * Local DB is the source of truth for invoice history and display.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BillingInvoiceStatus } from '@appshore/db';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';
import { NormalizedBillingEvent } from '../adapters/payment-provider.interface';

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
  async listInvoices(tenantDbId: number, opts?: { limit?: number; cursor?: string }) {
    const take = opts?.limit ?? 20;

    const invoices = await this.prisma.billingInvoice.findMany({
      where: { tenantId: tenantDbId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(opts?.cursor && {
        cursor: { id: opts.cursor },
        skip: 1,
      }),
    });

    const hasMore = invoices.length > take;
    const items = hasMore ? invoices.slice(0, take) : invoices;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { items, nextCursor, hasMore };
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
