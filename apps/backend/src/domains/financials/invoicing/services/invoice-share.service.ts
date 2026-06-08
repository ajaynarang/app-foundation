import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { randomBytes } from 'crypto';

@Injectable()
export class InvoiceShareService {
  private readonly logger = new Logger(InvoiceShareService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createShareLink(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'VOID') throw new BadRequestException('Cannot share a voided invoice');

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    await this.prisma.invoiceShareLink.create({
      data: {
        token,
        invoiceId: invoice.id,
        tenantId,
        expiresAt,
      },
    });

    const apiUrl = process.env.API_BASE_URL || process.env.APP_URL || 'https://sally.appshore.in';
    const url = `${apiUrl}/api/v1/invoices/public/${token}/pdf`;

    this.logger.log(`Created share link for invoice ${invoiceNumber}`);
    return { url, token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Return the raw share link record with invoice metadata.
   * Used internally (e.g. by the public PDF controller) when tenantId/invoiceNumber are needed.
   * Validates token expiry and invoice status.
   */
  async getShareLinkByToken(token: string) {
    const link = await this.prisma.invoiceShareLink.findUnique({
      where: { token },
      include: {
        invoice: {
          select: {
            tenantId: true,
            invoiceNumber: true,
            status: true,
          },
        },
      },
    });

    if (!link) throw new NotFoundException('Invalid share link');
    if (new Date() > link.expiresAt) throw new BadRequestException('Share link has expired');
    if (link.invoice.status === 'VOID') throw new BadRequestException('This invoice has been voided');

    return link;
  }

  async getInvoiceByToken(token: string) {
    const link = await this.prisma.invoiceShareLink.findUnique({
      where: { token },
      include: {
        invoice: {
          include: {
            customer: { select: { companyName: true } },
            lineItems: { orderBy: { sequenceOrder: 'asc' } },
            payments: { orderBy: { paymentDate: 'desc' } },
          },
        },
      },
    });

    if (!link) throw new NotFoundException('Invalid share link');
    if (new Date() > link.expiresAt) throw new BadRequestException('Share link has expired');
    if (link.invoice.status === 'VOID') throw new BadRequestException('This invoice has been voided');

    return {
      invoiceNumber: link.invoice.invoiceNumber,
      status: link.invoice.status,
      customerName: link.invoice.customer.companyName,
      issueDate: link.invoice.issueDate,
      dueDate: link.invoice.dueDate,
      subtotalCents: link.invoice.subtotalCents,
      adjustmentCents: link.invoice.adjustmentCents,
      totalCents: link.invoice.totalCents,
      paidCents: link.invoice.paidCents,
      balanceCents: link.invoice.balanceCents,
      paymentTermsDays: link.invoice.paymentTermsDays,
      lineItems: link.invoice.lineItems.map((li) => ({
        type: li.type,
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalCents: li.totalCents,
      })),
    };
  }
}
