import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { InvoicingService } from '../../../financials/invoicing/services/invoicing.service';
import { PaymentsService } from '../../../financials/payments/services/payments.service';
import { FactoringService } from '../../../financials/invoicing/services/factoring.service';
import { TenantsService } from '../../../platform/tenants/tenants.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * Invoice Action MCP Tools — write tools for invoice mutations.
 *
 * All mutations are tenant-scoped via `_tenantId`, which is injected by
 * McpToolService from the authenticated session — NEVER from AI input.
 *
 * Write operations: send-invoice, void-invoice, record-payment,
 *   generate-invoice, submit-invoice-to-factor (all require HITL confirmation)
 *
 * Write tools have description instructions telling the AI to confirm
 * with the user before calling. This is the HITL confirmation pattern.
 */
@Injectable()
export class InvoiceActionTool {
  constructor(
    private readonly invoicingService: InvoicingService,
    private readonly paymentsService: PaymentsService,
    private readonly factoringService: FactoringService,
    private readonly tenantsService: TenantsService,
    private readonly prisma: PrismaService,
  ) {}

  @RequiresScope('invoices:write')
  @Tool({
    name: 'send-invoice',
    description:
      'Mark an invoice as sent. Changes status from DRAFT to SENT. IMPORTANT: Always confirm with the user before calling this tool. Tell them which invoice you are about to send and ask for explicit confirmation.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (e.g. INV-2026-0001)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async sendInvoice({ invoiceNumber, _tenantId }: { invoiceNumber: string; _tenantId?: number; _userId?: string }) {
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
      const invoice = await this.invoicingService.markSent(_tenantId, invoiceNumber);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              invoiceNumber: (invoice as any).invoiceNumber,
              status: 'SENT',
              message: `Invoice ${(invoice as any).invoiceNumber} has been marked as sent`,
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }

  @RequiresScope('invoices:write:sensitive')
  @Tool({
    name: 'void-invoice',
    description:
      'Void an invoice. This action cannot be undone. The invoice status will be changed to VOID and any associated load will be reset to allow re-invoicing. IMPORTANT: Always confirm with the user before calling this tool. Tell them which invoice you are about to void and warn that this cannot be undone.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (e.g. INV-2026-0001)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async voidInvoice({ invoiceNumber, _tenantId }: { invoiceNumber: string; _tenantId?: number; _userId?: string }) {
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
      const invoice = await this.invoicingService.voidInvoice(_tenantId, invoiceNumber);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              invoiceNumber: (invoice as any).invoiceNumber,
              status: 'VOID',
              message: `Invoice ${(invoice as any).invoiceNumber} has been voided`,
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }

  @RequiresScope('invoices:write')
  @Tool({
    name: 'record-payment',
    description:
      'Record a payment against an invoice. Updates the invoice balance and status (PARTIAL or PAID). IMPORTANT: Always confirm with the user before calling this tool. Tell them the invoice, amount, and payment details you are about to record.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (e.g. INV-2026-0001)'),
      amountCents: z.number().min(1).describe('Payment amount in cents (e.g. 150000 for $1,500.00)'),
      paymentMethod: z.string().optional().describe('Payment method (e.g. "check", "ach", "wire", "credit_card")'),
      referenceNumber: z.string().optional().describe('Check number or transaction reference'),
      paymentDate: z
        .string()
        .optional()
        .describe('Payment date in YYYY-MM-DD format. Defaults to today if not specified.'),
      notes: z.string().optional().describe('Optional payment notes'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async recordPayment({
    invoiceNumber,
    amountCents,
    paymentMethod,
    referenceNumber,
    paymentDate,
    notes,
    _tenantId,
    _userId,
  }: {
    invoiceNumber: string;
    amountCents: number;
    paymentMethod?: string;
    referenceNumber?: string;
    paymentDate?: string;
    notes?: string;
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
      const payment = await this.paymentsService.recordPayment(
        _tenantId,
        invoiceNumber,
        {
          amountCents: amountCents,
          paymentMethod: paymentMethod,
          referenceNumber: referenceNumber,
          paymentDate: paymentDate ?? new Date().toISOString().slice(0, 10),
          notes,
        },
        _userId ? parseInt(_userId, 10) : undefined,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              paymentId: (payment as any).paymentId,
              amountDollars: (amountCents / 100).toFixed(2),
              message: `Payment of $${(amountCents / 100).toFixed(2)} recorded on invoice ${invoiceNumber}`,
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }

  @RequiresScope('invoices:write')
  @Tool({
    name: 'generate-invoice',
    description:
      'Generate an invoice from a delivered load. Creates a DRAFT invoice with line items from load charges. The load must be delivered and have a customer assigned. IMPORTANT: Always confirm with the user before calling this tool. Tell them which load you are about to generate an invoice for.',
    parameters: z.object({
      loadNumber: z.string().describe('The load number (e.g. LD-20260101-001)'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async generateInvoice({ loadNumber, _tenantId }: { loadNumber: string; _tenantId?: number; _userId?: string }) {
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
      const invoice = (await this.invoicingService.generateFromLoad(_tenantId, loadNumber)) as any;

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

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              invoiceNumber: invoice.invoiceNumber,
              status: invoice.status,
              customerName: invoice.customer?.companyName ?? 'Unknown',
              totalDollars: (invoice.totalCents / 100).toFixed(2),
              lineItemCount: invoice.lineItems?.length ?? 0,
              message: `Invoice ${invoice.invoiceNumber} generated for load ${loadNumber}`,
            }),
          },
        ],
        _card: { type: 'invoice' as const, data: invoiceData },
      };
    } catch (e: any) {
      // isError flags a failed generation so callers that branch on the
      // MCP result (Desk execute.step reads result.isError) close the
      // episode as failed instead of mistaking the {error} payload for a
      // success. Without it a race (invoice created between hydrate and
      // execute) would silently look like a successful generation.
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
        isError: true,
      };
    }
  }

  @RequiresScope('invoices:write:sensitive')
  @Tool({
    name: 'submit-invoice-to-factor',
    description:
      'Submit an invoice to a factoring company. The invoice must be in SENT or PARTIAL status with billingPath = FACTORED. The bundle (invoice + rate-con + BOL + POD) must be ready and the customer NOA must be ACKNOWLEDGED. If no factoringCompanyId is specified, the tenant default is used. IMPORTANT: Always confirm with the user before calling this tool — tell them which invoice and factoring company you are about to submit to.',
    parameters: z.object({
      invoiceNumber: z.string().describe('The invoice number (e.g. INV-2026-0001)'),
      factoringCompanyId: z
        .string()
        .optional()
        .describe('The factoring company ID (e.g. fc_abc123). If omitted, the tenant default is used.'),
      factoringReference: z.string().optional().describe('External reference number from the factoring company'),
      sendEmail: z.boolean().optional().describe('Send the bundle to the factor by email immediately (default true).'),
      _tenantId: z.number().optional().describe('Internal: injected by system'),
      _userId: z.string().optional().describe('Internal: injected by system'),
    }),
  })
  async submitInvoiceToFactor({
    invoiceNumber,
    factoringCompanyId,
    factoringReference,
    sendEmail,
    _tenantId,
  }: {
    invoiceNumber: string;
    factoringCompanyId?: string;
    factoringReference?: string;
    sendEmail?: boolean;
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
      // Resolve factoring company: use specified ID or fall back to tenant default
      let companyId = factoringCompanyId;
      if (!companyId) {
        const settings = await this.tenantsService.getMyTenantSettings(_tenantId);
        if (!settings.factoringCompany) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: 'No factoring company specified and no default factoring company configured for this tenant',
                }),
              },
            ],
          };
        }
        companyId = settings.factoringCompany.companyId;
      }

      const result = await this.factoringService.submitToFactor(_tenantId, invoiceNumber, {
        factoringCompanyId: companyId,
        factoringReference,
        sendEmail: sendEmail ?? true,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              invoiceNumber,
              status: result.invoice.status, // FACTORED after Phase 4
              factoringCompanyId: companyId,
              noaWarning: result.noaWarning,
              emailWarning: result.emailWarning,
              message: `Invoice ${invoiceNumber} submitted to factor`,
            }),
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: e.message }),
          },
        ],
      };
    }
  }

  @RequiresScope('invoices:write')
  @Tool({
    name: 'record-promise-to-pay',
    description:
      'Record a customer promise-to-pay on an invoice. Used by Desk AR Follow-up after the customer replies with a commitment. Appends [PROMISE YYYY-MM-DD] to Invoice.internalNotes so future AR runs skip the invoice until the promised date passes.',
    parameters: z.object({
      invoiceNumber: z.string().min(1).max(50),
      promiseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD'),
      note: z.string().min(1).max(500),
      _tenantId: z.number().int().positive(),
    }),
  })
  async recordPromiseToPay(args: { invoiceNumber: string; promiseDate: string; note: string; _tenantId: number }) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId: args._tenantId, invoiceNumber: args.invoiceNumber },
      select: { id: true, internalNotes: true },
    });
    if (!invoice) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: `Invoice ${args.invoiceNumber} not found in this tenant`,
            }),
          },
        ],
        isError: true,
      };
    }

    const line = `[PROMISE ${args.promiseDate}] ${args.note}`;
    const newNotes = invoice.internalNotes ? `${invoice.internalNotes}\n${line}` : line;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { internalNotes: newNotes },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            invoiceNumber: args.invoiceNumber,
            promiseDate: args.promiseDate,
            recordedAt: new Date().toISOString(),
          }),
        },
      ],
    };
  }

  @RequiresScope('desk:write')
  @Tool({
    name: 'escalate-invoice',
    description:
      "Escalate an invoice for human attention on Sally's Desk. Appends a structured [ESCALATED YYYY-MM-DD <severity>] <reason> line to the invoice internal notes. Used by AR Follow-up when the decide step picks the 'escalate' branch (60+ days overdue, broken promise, disputed, customer unresponsive).",
    parameters: z.object({
      invoiceNumber: z.string().min(1).max(50),
      reason: z.string().min(1).max(500),
      severity: z.enum(['normal', 'high', 'urgent']).default('high'),
      _tenantId: z.number().int().positive(),
    }),
  })
  async escalateInvoice(args: {
    invoiceNumber: string;
    reason: string;
    severity: 'normal' | 'high' | 'urgent';
    _tenantId: number;
  }) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { tenantId: args._tenantId, invoiceNumber: args.invoiceNumber },
      select: { id: true, internalNotes: true },
    });
    if (!invoice) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              ok: false,
              error: `Invoice ${args.invoiceNumber} not found in this tenant`,
            }),
          },
        ],
        isError: true,
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const line = `[ESCALATED ${today} ${args.severity.toUpperCase()}] ${args.reason}`;
    const newNotes = invoice.internalNotes ? `${invoice.internalNotes}\n${line}` : line;

    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { internalNotes: newNotes },
    });

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            ok: true,
            invoiceNumber: args.invoiceNumber,
            severity: args.severity,
            escalatedAt: new Date().toISOString(),
          }),
        },
      ],
    };
  }
}
