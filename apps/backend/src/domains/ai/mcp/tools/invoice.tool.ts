import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { InvoiceStatus } from '@prisma/client';
import { formatLoadLabel } from '@app/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { InvoicingService } from '../../../financials/invoicing/services/invoicing.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Invoice MCP Tools — read-only tools for dispatcher invoice and AR queries.
 *
 * All queries are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 * The AI cannot see or override the _tenantId parameter.
 */
@Injectable()
export class InvoiceTool {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('invoices:read')
  @Tool({
    name: 'query-invoices',
    description:
      "Search invoices for the current tenant. Filter by status (DRAFT, SENT, PAID, PARTIAL, OVERDUE, VOID, FACTORED), customer ID, date range, overdue flag, or free-text search. Returns up to 20 invoices with customer, amount, and status. Do NOT use for a single invoice's line items — use get-invoice-detail.",
    parameters: z.object({
      // Bound to Prisma's InvoiceStatus enum so the LLM must pass an exact
      // value and Prisma never sees a malformed status.
      status: z
        .nativeEnum(InvoiceStatus)
        .optional()
        .describe(
          `Filter by invoice status. Valid values (uppercase, exact): ${Object.values(InvoiceStatus).join(', ')}.`,
        ),
      customerId: z.number().optional().describe('Filter by customer ID'),
      overdueOnly: z.boolean().optional().describe('If true, only return overdue invoices'),
      search: z.string().optional().describe('Free-text search across invoice number, customer name, or load number'),
      dateFrom: z.string().optional().describe('Filter invoices issued on or after this date (YYYY-MM-DD)'),
      dateTo: z.string().optional().describe('Filter invoices issued on or before this date (YYYY-MM-DD)'),
      limit: z.number().min(1).max(50).default(20).describe('Max results to return'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async queryInvoices({
    status,
    customerId,
    overdueOnly,
    search,
    dateFrom,
    dateTo,
    limit,
    _tenantId,
  }: {
    status?: InvoiceStatus;
    customerId?: number;
    overdueOnly?: boolean;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit: number;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    const invoices = await this.invoicingService.findAll(
      _tenantId,
      { status, customerId, overdueOnly, search, dateFrom, dateTo },
      { limit, offset: 0 },
    );

    const mapped = (invoices as any[]).map((inv) => ({
      id: inv.invoiceNumber,
      number: inv.invoiceNumber,
      status: inv.status,
      customerName: inv.customer?.companyName ?? 'Unknown',
      totalCents: inv.totalCents,
      paidCents: inv.paidCents,
      balanceCents: inv.balanceCents,
      dueDate: inv.dueDate ?? null,
      issueDate: inv.issueDate ?? null,
      lineItemCount: inv.lineItems?.length ?? 0,
    }));

    const cardData = {
      invoices: mapped,
      totalCount: mapped.length,
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            count: mapped.length,
            invoices: mapped.map((inv) => ({
              ...inv,
              totalDollars: inv.totalCents != null ? (inv.totalCents / 100).toFixed(2) : null,
              balanceDollars: inv.balanceCents != null ? (inv.balanceCents / 100).toFixed(2) : null,
            })),
          }),
        },
      ],
      _card: { type: 'invoice_list' as const, data: cardData },
    };
  }

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-invoice-detail',
    description:
      'Get full details for a single invoice by its invoice number (e.g. INV-2026-0001). Returns line items, customer, load, and payment history.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (e.g. INV-2026-0001)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getInvoiceDetail({
    invoiceNumber,
    _tenantId,
  }: {
    invoiceNumber: string;
    _tenantId?: number;
    _userId?: string;
  }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    try {
      const invoice = (await this.invoicingService.findOne(_tenantId, invoiceNumber)) as any;

      const invoiceData = {
        id: invoice.invoiceNumber,
        number: invoice.invoiceNumber,
        status: invoice.status,
        customerName: invoice.customer?.companyName ?? 'Unknown',
        totalCents: invoice.totalCents,
        paidCents: invoice.paidCents,
        balanceCents: invoice.balanceCents,
        dueDate: invoice.dueDate ?? null,
        issueDate: invoice.issueDate ?? null,
        lineItemCount: invoice.lineItems?.length ?? 0,
      };

      const fullDetail = {
        ...invoiceData,
        totalDollars: (invoice.totalCents / 100).toFixed(2),
        balanceDollars: (invoice.balanceCents / 100).toFixed(2),
        paidDollars: (invoice.paidCents / 100).toFixed(2),
        paymentTermsDays: invoice.paymentTermsDays,
        notes: invoice.notes,
        loadNumber: invoice.load?.loadNumber ?? null,
        loadLabel: invoice.load ? formatLoadLabel(invoice.load.loadNumber, invoice.load.referenceNumber) : null,
        lineItems: invoice.lineItems?.map((li: any) => ({
          type: li.type,
          description: li.description,
          quantity: li.quantity,
          unitPriceDollars: (li.unitPriceCents / 100).toFixed(2),
          totalDollars: (li.totalCents / 100).toFixed(2),
        })),
        payments: invoice.payments?.map((p: any) => ({
          paymentId: p.paymentId,
          amountDollars: (p.amountCents / 100).toFixed(2),
          method: p.paymentMethod,
          date: p.paymentDate ?? null,
        })),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(fullDetail),
          },
        ],
        _card: { type: 'invoice' as const, data: invoiceData },
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: error?.message ?? `Invoice ${invoiceNumber} not found`,
            }),
          },
        ],
      };
    }
  }

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-invoice-summary',
    description:
      'Get an accounts receivable summary for the current tenant: total outstanding, overdue amounts, aging buckets (current, 1-30, 31-60, 61-90, 90+ days), draft count, ready-to-invoice count, and factored totals.',
    parameters: z.object({
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async getInvoiceSummary({ _tenantId }: { _tenantId?: number; _userId?: string }) {
    if (!_tenantId) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: 'No tenant context' }),
          },
        ],
      };
    }

    const summary = await this.invoicingService.getSummary(_tenantId);

    // Map service aging buckets to card format
    const cardData = {
      totalOutstandingCents: summary.outstandingCents,
      overdueCount:
        summary.aging.days1_30.count +
        summary.aging.days31_60.count +
        summary.aging.days61_90.count +
        summary.aging.daysOver90.count,
      agingBuckets: {
        currentCents: summary.aging.current.amountCents,
        thirtyDayCents: summary.aging.days1_30.amountCents,
        sixtyDayCents: summary.aging.days31_60.amountCents,
        ninetyPlusCents: summary.aging.days61_90.amountCents + summary.aging.daysOver90.amountCents,
      },
      countByStatus: {
        draft: summary.draftCount,
        ready_to_invoice: summary.readyToInvoiceCount,
        factored: summary.factoredCount,
      },
    };

    // Full detail for AI text response (includes dollar amounts for natural language)
    const textData = {
      outstandingDollars: (summary.outstandingCents / 100).toFixed(2),
      overdueDollars: (summary.overdueCents / 100).toFixed(2),
      paidThisMonthDollars: (summary.paidThisMonthCents / 100).toFixed(2),
      draftCount: summary.draftCount,
      readyToInvoiceCount: summary.readyToInvoiceCount,
      factoredDollars: (summary.factoredCents / 100).toFixed(2),
      factoredCount: summary.factoredCount,
      aging: {
        current: {
          dollars: (summary.aging.current.amountCents / 100).toFixed(2),
          count: summary.aging.current.count,
        },
        days_1_30: {
          dollars: (summary.aging.days1_30.amountCents / 100).toFixed(2),
          count: summary.aging.days1_30.count,
        },
        days_31_60: {
          dollars: (summary.aging.days31_60.amountCents / 100).toFixed(2),
          count: summary.aging.days31_60.count,
        },
        days_61_90: {
          dollars: (summary.aging.days61_90.amountCents / 100).toFixed(2),
          count: summary.aging.days61_90.count,
        },
        days_over_90: {
          dollars: (summary.aging.daysOver90.amountCents / 100).toFixed(2),
          count: summary.aging.daysOver90.count,
        },
      },
    };

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(textData),
        },
      ],
      _card: { type: 'invoice_summary' as const, data: cardData },
    };
  }

  @RequiresScope('invoices:read')
  @Tool({
    name: 'get-communication-history',
    description:
      'Return recent send-email history to a customer address for the current tenant. Used by Desk AR Follow-up to check whether we already contacted the customer about an invoice within the dedupe window. Sourced from AgentInvocationLog — covers every Sally-sent email regardless of origin (chat, API key, Desk).',
    parameters: z.object({
      customerEmail: z.string().email().describe('Customer email address whose history to return'),
      invoiceNumber: z
        .string()
        .min(1)
        .optional()
        .describe('Optional — filter to emails whose subject mentions this invoice number.'),
      withinDays: z.number().int().min(1).max(90).default(30).describe('Days of history to return, ending now.'),
      _tenantId: z.number().int().positive().describe('Internal: injected by system — tenant context'),
    }),
  })
  async getCommunicationHistory(args: {
    customerEmail: string;
    invoiceNumber?: string;
    withinDays: number;
    _tenantId: number;
  }) {
    const since = new Date(Date.now() - args.withinDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.agentInvocationLog.findMany({
      where: {
        tenantId: args._tenantId,
        toolName: 'send-email',
        success: true,
        createdAt: { gte: since },
      },
      select: {
        createdAt: true,
        argsRedacted: true,
        principalLabel: true,
        success: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const matches = rows
      .map((row) => {
        const a = row.argsRedacted as Record<string, unknown>;
        const to = typeof a?.to === 'string' ? a.to : null;
        if (to !== args.customerEmail) return null;
        return {
          sentAt: row.createdAt.toISOString(),
          subject: typeof a?.subject === 'string' ? a.subject : null,
          replyTo: typeof a?.replyTo === 'string' ? a.replyTo : null,
          principalLabel: row.principalLabel,
          success: row.success,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const invoiceMatches = args.invoiceNumber
      ? matches.filter((m) => m.subject?.toLowerCase().includes(args.invoiceNumber.toLowerCase()))
      : matches;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            customerEmail: args.customerEmail,
            withinDays: args.withinDays,
            totalSends: matches.length,
            invoiceScopedSends: invoiceMatches.length,
            lastSentAt: matches[0]?.sentAt ?? null,
            recent: invoiceMatches.slice(0, 10),
          }),
        },
      ],
    };
  }
}
