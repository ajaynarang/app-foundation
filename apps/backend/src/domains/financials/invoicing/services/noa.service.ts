import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { randomUUID } from 'crypto';
import type { NoaStatus, Prisma } from '@prisma/client';

/** Escape HTML special characters (mirrors invoice-email.service helper). */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class NoaService {
  private readonly logger = new Logger(NoaService.name);
  private resendClient: any = null;
  private pdfPrinter: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  /** Lazy Resend client singleton, mirrors `InvoiceEmailService.getResendClient`. */
  private async getResendClient() {
    if (!this.resendClient) {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) return null;
      const { Resend } = await import('resend');
      this.resendClient = new Resend(resendKey);
    }
    return this.resendClient;
  }

  /**
   * Lazy pdfmake printer singleton. Mirrors the import shape used by
   * `invoice-pdf.service.ts` — pdfmake's Roboto font files ship inside the
   * package, so we resolve their on-disk path via require.resolve.
   */
  private async getPdfPrinter() {
    if (!this.pdfPrinter) {
      const { default: PdfPrinter } = await import('pdfmake/js/Printer' as any);
      const path = await import('path');
      const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'build/fonts/Roboto');
      this.pdfPrinter = new PdfPrinter({
        Roboto: {
          normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
          bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
          italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
          bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
        },
      });
    }
    return this.pdfPrinter;
  }

  async listNoaRecords(tenantId: number, customerId?: number) {
    const where: any = { tenantId };
    if (customerId) where.customerId = customerId;

    return this.prisma.noaRecord.findMany({
      where,
      include: {
        customer: { select: { id: true, companyName: true, customerId: true } },
        factoringCompany: {
          select: { id: true, companyId: true, companyName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNoaRecord(
    tenantId: number,
    data: {
      customerId: number;
      factoringCompanyId: number;
      notes?: string;
    },
  ) {
    // Validate customer exists
    const customer = await this.prisma.customer.findFirst({
      where: { id: data.customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Validate factoring company exists
    const factor = await this.prisma.factoringCompany.findFirst({
      where: { id: data.factoringCompanyId, tenantId },
    });
    if (!factor) throw new NotFoundException('Factoring company not found');

    // Check for duplicate (unique pair per tenant)
    const existing = await this.prisma.noaRecord.findFirst({
      where: {
        customerId: data.customerId,
        factoringCompanyId: data.factoringCompanyId,
        tenantId,
      },
    });
    if (existing) {
      throw new ConflictException('NOA record already exists for this customer and factoring company');
    }

    const created = await this.prisma.noaRecord.create({
      data: {
        noaId: `noa_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        customerId: data.customerId,
        factoringCompanyId: data.factoringCompanyId,
        notes: data.notes || null,
        tenantId,
      },
      include: {
        customer: { select: { id: true, companyName: true, customerId: true } },
        factoringCompany: {
          select: { id: true, companyId: true, companyName: true },
        },
      },
    });

    await this.emitNoaCreated(tenantId, created);

    return created;
  }

  async updateNoaStatus(
    tenantId: number,
    noaId: string,
    data: {
      status: NoaStatus;
      rejectionReason?: string;
    },
  ) {
    const noa = await this.prisma.noaRecord.findFirst({
      where: { noaId, tenantId },
    });
    if (!noa) throw new NotFoundException('NOA record not found');

    // Validate state transition
    const validTransitions: Record<string, string[]> = {
      NOT_SENT: ['SENT'],
      SENT: ['ACKNOWLEDGED', 'REJECTED'],
      REJECTED: ['SENT'],
      ACKNOWLEDGED: [],
    };
    const allowed = validTransitions[noa.status] ?? [];
    if (!allowed.includes(data.status)) {
      throw new BadRequestException(`Invalid NOA status transition: ${noa.status} → ${data.status}`);
    }

    const updateData: any = { status: data.status };

    switch (data.status) {
      case 'SENT':
        updateData.sentAt = new Date();
        break;
      case 'ACKNOWLEDGED':
        updateData.acknowledgedAt = new Date();
        break;
      case 'REJECTED':
        updateData.rejectedAt = new Date();
        if (data.rejectionReason) {
          updateData.rejectionReason = data.rejectionReason;
        }
        break;
    }

    const updated = await this.prisma.noaRecord.update({
      where: { id: noa.id },
      data: updateData,
      include: {
        customer: { select: { id: true, companyName: true, customerId: true } },
        factoringCompany: {
          select: { id: true, companyId: true, companyName: true },
        },
      },
    });

    // Emit status-change events for downstream subscribers (alerts, dashboards, AI nudges).
    if (data.status === 'SENT') {
      await this.events.emit(SALLY_EVENTS.NOA_SENT, tenantId, {
        entityId: noa.noaId,
        entityType: 'noa-record',
        customerId: noa.customerId,
        factoringCompanyId: noa.factoringCompanyId,
      });
    } else if (data.status === 'ACKNOWLEDGED') {
      await this.events.emit(SALLY_EVENTS.NOA_ACKNOWLEDGED, tenantId, {
        entityId: noa.noaId,
        entityType: 'noa-record',
        customerId: noa.customerId,
        factoringCompanyId: noa.factoringCompanyId,
      });
    } else if (data.status === 'REJECTED') {
      await this.events.emit(SALLY_EVENTS.NOA_REJECTED, tenantId, {
        entityId: noa.noaId,
        entityType: 'noa-record',
        customerId: noa.customerId,
        factoringCompanyId: noa.factoringCompanyId,
        rejectionReason: data.rejectionReason ?? null,
      });
    }

    return updated;
  }

  async checkNoaForInvoice(tenantId: number, customerId: number, factoringCompanyId: number) {
    return this.prisma.noaRecord.findFirst({
      where: {
        customerId,
        factoringCompanyId,
        tenantId,
      },
    });
  }

  async deleteNoaRecord(tenantId: number, noaId: string) {
    const noa = await this.prisma.noaRecord.findFirst({
      where: { noaId, tenantId },
    });
    if (!noa) throw new NotFoundException('NOA record not found');

    await this.prisma.noaRecord.delete({ where: { id: noa.id } });
    return { deleted: true };
  }

  /**
   * Idempotently creates a NOT_SENT NoaRecord for the (customer, factor, tenant)
   * tuple. Used by `InvoicingService.generateFromLoad` so dispatchers see a
   * NOA badge on the invoice the moment a FACTORED invoice is generated.
   *
   * Emits `noa.created` only on actual creation — the unique constraint
   * `@@unique([customerId, factoringCompanyId, tenantId])` makes upsert
   * race-safe across concurrent invoice generations.
   */
  async upsertForFactoredInvoice(
    tenantId: number,
    customerId: number,
    factoringCompanyId: number,
  ): Promise<{ noaRecord: Prisma.NoaRecordGetPayload<object>; created: boolean }> {
    const existing = await this.prisma.noaRecord.findFirst({
      where: { customerId, factoringCompanyId, tenantId },
    });
    if (existing) {
      return { noaRecord: existing, created: false };
    }

    // Validate FK before insert so we throw NotFoundException rather than P2003.
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const factor = await this.prisma.factoringCompany.findFirst({ where: { id: factoringCompanyId, tenantId } });
    if (!factor) throw new NotFoundException('Factoring company not found');

    try {
      const created = await this.prisma.noaRecord.create({
        data: {
          noaId: `noa_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
          customerId,
          factoringCompanyId,
          tenantId,
        },
      });
      await this.emitNoaCreated(tenantId, created);
      return { noaRecord: created, created: true };
    } catch (err) {
      // Concurrent insert won the race — fetch and return as not-created.
      if ((err as { code?: string }).code === 'P2002') {
        const winner = await this.prisma.noaRecord.findFirst({
          where: { customerId, factoringCompanyId, tenantId },
        });
        if (winner) return { noaRecord: winner, created: false };
      }
      throw err;
    }
  }

  /**
   * Send the NOA letter to the broker via Resend. Generates a PDF with
   * pdfmake (already a backend dep — used elsewhere for invoice PDFs).
   *
   * Recipient resolution: customer's primary ACTIVE contact email first,
   * fallback to `customer.billingEmail`. If neither is set, throws so the
   * dispatcher sees a clear error and can fix the customer record.
   *
   * Transitions NOT_SENT → SENT (or REJECTED → SENT for resends), per the
   * existing state machine in `updateNoaStatus`.
   */
  async sendNoaEmail(tenantId: number, noaId: string): Promise<{ sent: boolean; to: string }> {
    const noa = await this.prisma.noaRecord.findFirst({
      where: { noaId, tenantId },
      include: {
        customer: {
          include: {
            contacts: {
              where: { isPrimary: true, status: 'ACTIVE' },
              take: 1,
            },
          },
        },
        factoringCompany: true,
      },
    });
    if (!noa) throw new NotFoundException('NOA record not found');

    const customer = noa.customer;
    const factor = noa.factoringCompany;

    const primaryContact = customer.contacts?.[0];
    const recipient = primaryContact?.email || customer.billingEmail;
    if (!recipient) {
      throw new BadRequestException(
        `NOA cannot be sent: ${customer.companyName} has no primary contact email or billing email — please add one first.`,
      );
    }

    // Validate state allows sending (NOT_SENT or REJECTED → SENT, per existing rules).
    if (noa.status !== 'NOT_SENT' && noa.status !== 'REJECTED') {
      throw new BadRequestException(`NOA cannot be sent from status ${noa.status}`);
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true },
    });
    const carrierName = tenant?.companyName || 'our company';

    const pdfBuffer = await this.buildNoaPdf({
      carrierName,
      customerName: customer.companyName,
      factorName: factor.companyName,
      factorAddress: this.formatRemittanceAddress(factor),
      effectiveDate: new Date().toISOString().split('T')[0],
    });

    const subject = `Notice of Assignment — ${carrierName}`;
    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Notice of Assignment</h2>
      <p>Dear ${escapeHtml(customer.companyName)},</p>
      <p>
        Effective immediately, all invoices issued by <strong>${escapeHtml(carrierName)}</strong> are
        assigned to <strong>${escapeHtml(factor.companyName)}</strong> for collection. Please direct
        all future payments to the address below.
      </p>
      <p>The full Notice of Assignment letter is attached. Please acknowledge receipt by replying
      to this email or contacting us directly.</p>
      <p style="color: #ccc; font-size: 10px; margin-top: 20px;">Powered by SALLY</p>
    </div>`;

    const resend = await this.getResendClient();
    if (resend) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'sally-support@appshore.in',
        to: recipient,
        subject,
        html,
        attachments: [
          {
            filename: `NOA-${factor.companyName.replace(/\s+/g, '-')}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } else {
      this.logger.warn('No RESEND_API_KEY configured, NOA email not sent (still transitioning state)');
    }

    // Transition NOT_SENT/REJECTED → SENT and emit noa.sent. Reuses the
    // state-machine + event emission already in updateNoaStatus.
    await this.updateNoaStatus(tenantId, noaId, { status: 'SENT' });

    this.logger.log(
      `Sent NOA ${noaId} to ${recipient} (customer=${customer.companyName} factor=${factor.companyName})`,
    );
    return { sent: true, to: recipient };
  }

  /**
   * Used by the tenant factor-change event handler. For every customer with
   * at least one FACTORED invoice in the last 6 months, idempotently
   * upsert a NoaRecord(NOT_SENT) for the new factor.
   *
   * Returns counts so the caller can surface a "N brokers need new NOAs"
   * follow-up prompt in the UI.
   */
  async bulkCreateForFactorChange(
    tenantId: number,
    newFactoringCompanyId: number,
  ): Promise<{ created: number; skipped: number; customerIds: number[] }> {
    // Validate factor in tenant.
    const factor = await this.prisma.factoringCompany.findFirst({
      where: { id: newFactoringCompanyId, tenantId },
    });
    if (!factor) throw new NotFoundException('Factoring company not found');

    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentFactoredInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        billingPath: 'FACTORED',
        createdAt: { gte: sixMonthsAgo },
      },
      select: { customerId: true },
      distinct: ['customerId'],
    });

    const customerIds = recentFactoredInvoices.map((i) => i.customerId);
    let created = 0;
    let skipped = 0;

    for (const customerId of customerIds) {
      try {
        const result = await this.upsertForFactoredInvoice(tenantId, customerId, newFactoringCompanyId);
        if (result.created) created++;
        else skipped++;
      } catch (err) {
        // A bad customer FK shouldn't kill the batch; log and skip.
        this.logger.warn(
          `bulkCreateForFactorChange: skipped customerId=${customerId} factorId=${newFactoringCompanyId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `bulkCreateForFactorChange tenantId=${tenantId} factorId=${newFactoringCompanyId} created=${created} skipped=${skipped}`,
    );

    return { created, skipped, customerIds };
  }

  /**
   * Paginated NOA inbox view. Joins customer + factor and computes
   * `ageDays` (days since createdAt). Supports filtering by status,
   * factor, customer, and an "ageBucket" pseudo-filter for the common
   * "pending more than 14 days" view dispatchers want.
   */
  async listNoaInbox(
    tenantId: number,
    filters?: {
      status?: NoaStatus;
      factorId?: number;
      customerId?: number;
      ageBucket?: 'all' | 'pending_gt_14' | 'rejected';
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.NoaRecordWhereInput = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.factorId) where.factoringCompanyId = filters.factorId;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.ageBucket === 'pending_gt_14') {
      const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      where.status = 'SENT';
      where.sentAt = { lt: cutoff };
    } else if (filters?.ageBucket === 'rejected') {
      where.status = 'REJECTED';
    }

    const limit = Math.min(filters?.limit ?? 50, 200);
    const offset = filters?.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.prisma.noaRecord.findMany({
        where,
        include: {
          customer: { select: { id: true, companyName: true, customerId: true } },
          factoringCompany: { select: { id: true, companyId: true, companyName: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: limit,
        skip: offset,
      }),
      this.prisma.noaRecord.count({ where }),
    ]);

    const now = Date.now();
    const items = rows.map((r) => ({
      id: r.id,
      noaId: r.noaId,
      customerId: r.customerId,
      customerName: r.customer.companyName,
      factoringCompanyId: r.factoringCompanyId,
      factoringCompanyName: r.factoringCompany.companyName,
      status: r.status,
      sentAt: r.sentAt?.toISOString() ?? null,
      acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
      rejectedAt: r.rejectedAt?.toISOString() ?? null,
      rejectionReason: r.rejectionReason,
      ageDays: Math.floor((now - r.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    return { items, total };
  }

  // ─── Private helpers ────────────────────────────────────────────

  private async emitNoaCreated(
    tenantId: number,
    noa: { noaId: string; customerId: number; factoringCompanyId: number },
  ) {
    await this.events.emit(SALLY_EVENTS.NOA_CREATED, tenantId, {
      entityId: noa.noaId,
      entityType: 'noa-record',
      customerId: noa.customerId,
      factoringCompanyId: noa.factoringCompanyId,
    });
  }

  private formatRemittanceAddress(factor: {
    remittanceAddress: string | null;
    remittanceCity: string | null;
    remittanceState: string | null;
    remittanceZip: string | null;
  }): string {
    const parts = [
      factor.remittanceAddress,
      factor.remittanceCity,
      factor.remittanceState,
      factor.remittanceZip,
    ].filter((p): p is string => !!p);
    return parts.join(', ');
  }

  private async buildNoaPdf(args: {
    carrierName: string;
    customerName: string;
    factorName: string;
    factorAddress: string;
    effectiveDate: string;
  }): Promise<Buffer> {
    const printer = await this.getPdfPrinter();
    const docDefinition = {
      content: [
        { text: 'Notice of Assignment', style: 'header' },
        { text: `Effective Date: ${args.effectiveDate}`, margin: [0, 0, 0, 20] as [number, number, number, number] },
        { text: `To: ${args.customerName}`, margin: [0, 0, 0, 10] as [number, number, number, number] },
        { text: `From: ${args.carrierName}`, margin: [0, 0, 0, 20] as [number, number, number, number] },
        {
          text:
            `Effective immediately, ${args.carrierName} has assigned all present and future accounts ` +
            `receivable to ${args.factorName} for collection and management.`,
          margin: [0, 0, 0, 12] as [number, number, number, number],
        },
        {
          text:
            `Please direct all payments for invoices issued by ${args.carrierName} to the following ` + `address only:`,
          margin: [0, 0, 0, 8] as [number, number, number, number],
        },
        { text: args.factorName, bold: true },
        { text: args.factorAddress || '(remittance address on file with factor)' },
        {
          text:
            `Payment to any other party will not constitute settlement of the invoice and may result in ` +
            `you being required to pay twice. Please acknowledge receipt of this notice by replying to this email.`,
          margin: [0, 16, 0, 12] as [number, number, number, number],
        },
        {
          text: 'Sincerely,',
          margin: [0, 24, 0, 4] as [number, number, number, number],
        },
        { text: args.carrierName, bold: true },
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] as [number, number, number, number] },
      },
      defaultStyle: { font: 'Roboto' },
    };

    // pdfmake 0.3.x returns a Promise<PDFDocument> — must await before
    // streaming. Mirrors invoice-pdf.service.ts:449.
    const pdfDoc = await printer.createPdfKitDocument(docDefinition);
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', (err: Error) => reject(err));
      pdfDoc.end();
    });
  }
}
