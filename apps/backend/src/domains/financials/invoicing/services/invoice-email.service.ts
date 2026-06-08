import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { FileStorageService } from '../../../../infrastructure/storage/file-storage.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { DocBundleService } from './doc-bundle.service';

/**
 * Resend's hard cap is 25 MB; we leave headroom for HTML body + envelope and
 * fall back to a signed S3 link above this threshold.
 */
const BUNDLE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
const BUNDLE_LINK_TTL_SECONDS = 7 * 24 * 3600; // 7 days; factor must download within a week

/** Escape HTML special characters to prevent XSS in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

@Injectable()
export class InvoiceEmailService {
  private readonly logger = new Logger(InvoiceEmailService.name);
  private resendClient: any = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicePdfService: InvoicePdfService,
    private readonly docBundleService: DocBundleService,
    private readonly fileStorage: FileStorageService,
  ) {}

  /** Lazy-initialised Resend client singleton (avoids per-request instantiation). */
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
   * Format a @db.Date field for display without timezone shift.
   * Parses the ISO date string to avoid locale-dependent Date constructor shifting.
   */
  private formatDateOnly(date: Date | string): string {
    const iso = date instanceof Date ? date.toISOString().split('T')[0] : String(date);
    const [y, m, d] = iso.split('-');
    return `${parseInt(m, 10)}/${parseInt(d, 10)}/${y}`;
  }

  async sendInvoice(tenantId: number, invoiceNumber: string) {
    const emailContent = await this.buildEmailContent(tenantId, invoiceNumber);

    if (!emailContent.to) {
      throw new NotFoundException('Customer has no email address configured');
    }

    // Generate PDF
    const pdfBuffer = await this.invoicePdfService.generatePdf(tenantId, invoiceNumber);

    // Use Resend SDK (lazy singleton) if available
    const resend = await this.getResendClient();
    if (resend) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@appshore.in',
        to: emailContent.to,
        replyTo: emailContent.replyTo,
        subject: emailContent.subject,
        html: emailContent.bodyHtml,
        attachments: [
          {
            filename: `${emailContent.invoiceNumber}.pdf`,
            content: pdfBuffer,
          },
        ],
      });
    } else {
      this.logger.warn('No RESEND_API_KEY configured, email not sent');
      this.logger.log(`Would send invoice ${emailContent.invoiceNumber} to ${emailContent.to}`);
    }

    this.logger.log(`Sent invoice ${emailContent.invoiceNumber} to ${emailContent.to}`);
    return {
      sent: true,
      to: emailContent.to,
      invoiceNumber: emailContent.invoiceNumber,
    };
  }

  /**
   * Send the merged factoring bundle (invoice + rate-con + BOL + POD) to a
   * factoring company email address. Falls back to a signed S3 link when the
   * bundle exceeds Resend's safe attachment threshold.
   *
   * `options.bundle` lets the caller hand in a pre-generated bundle so we
   * don't merge twice in the submit-to-factor flow (one merge in the
   * orchestrator, a second here). When omitted, we generate one ourselves.
   */
  async sendToFactor(
    tenantId: number,
    invoiceNumber: string,
    factorEmail: string,
    options?: { bundle?: Awaited<ReturnType<DocBundleService['generateBundle']>> },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: { customer: true, load: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
    });
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true },
    });

    const companyName = settings?.companyLegalName || tenant?.companyName || 'Company';
    const customerName = invoice.customer?.companyName ?? '';

    // Reuse the caller's pre-generated bundle when provided, otherwise merge
    // on demand (e.g. when this is called directly from a "Resend" UI action).
    const bundle = options?.bundle ?? (await this.docBundleService.generateBundle(tenantId, invoiceNumber));
    const useLink = bundle.bundleSizeBytes > BUNDLE_ATTACHMENT_MAX_BYTES && !!bundle.bundleS3Key;

    let attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    let bundleLinkHtml = '';
    if (useLink) {
      const signedUrl = await this.fileStorage.generatePresignedDownloadUrl(
        bundle.bundleS3Key,
        BUNDLE_LINK_TTL_SECONDS,
      );
      // Defense-in-depth: signed S3 URLs are URL-encoded by the SDK so they
      // shouldn't contain attribute-context delimiters today, but escape
      // every interpolation uniformly so a future SDK change or custom
      // CNAME with literal quotes can't break the template.
      bundleLinkHtml = `<p style="margin: 16px 0; padding: 12px; background: #f9f9f9; border-radius: 4px;">
        Bundle is too large to attach. <a href="${escapeHtml(signedUrl)}" style="color: #0066cc; font-weight: bold;">Download ${escapeHtml(bundle.fileName)}</a>
        <span style="color: #666; font-size: 12px;">(link valid for 7 days)</span>
      </p>`;
    } else {
      // contentType comes straight off the bundle (set by DocBundleService
      // per tenant.bundleFormat) so the factor's email client renders or
      // downloads correctly.
      attachments = [{ filename: bundle.fileName, content: bundle.buffer, contentType: bundle.contentType }];
    }

    const subject = `Invoice ${invoice.invoiceNumber} - ${customerName} - ${companyName}`;
    const totalFormatted = `$${(invoice.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${escapeHtml(companyName)}</h2>
      <p>Please find ${useLink ? 'the link to' : 'attached'} the document bundle for invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong>.</p>
      ${bundleLinkHtml}
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Invoice #</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(invoice.invoiceNumber)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Customer</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(customerName)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Amount</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${escapeHtml(totalFormatted)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Load #</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(invoice.load?.loadNumber ?? '')}</td></tr>
      </table>
      <p style="color: #ccc; font-size: 10px; margin-top: 20px;">Powered by SALLY</p>
    </div>`;

    const resend = await this.getResendClient();
    if (resend) {
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@appshore.in',
        to: factorEmail,
        subject,
        html,
        attachments,
      });
    } else {
      this.logger.warn('No RESEND_API_KEY configured, factor email not sent');
      this.logger.log(`Would send invoice ${invoice.invoiceNumber} to factor at ${factorEmail}`);
    }

    this.logger.log(
      `Sent invoice ${invoice.invoiceNumber} bundle to factor at ${factorEmail} (${useLink ? 'link' : 'attachment'}, ${bundle.bundleSizeBytes} bytes)`,
    );
    return {
      sent: true,
      to: factorEmail,
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  /**
   * Build the composed email content (subject, body HTML, recipient) without sending.
   * Reusable by both sendInvoice() and the preview endpoint.
   */
  async buildEmailContent(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: {
        customer: {
          include: {
            contacts: {
              where: { isPrimary: true, status: 'ACTIVE' },
              take: 1,
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const settings = await this.prisma.invoiceSettings.findUnique({
      where: { tenantId },
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { companyName: true, contactEmail: true },
    });

    const primaryContact = invoice.customer.contacts?.[0];
    const toEmail = invoice.customer.billingEmail || primaryContact?.email;
    const replyTo = settings?.replyToEmail || tenant?.contactEmail || undefined;

    const companyName = settings?.companyLegalName || tenant?.companyName || 'Company';

    const totalFormatted = `$${(invoice.totalCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const balanceFormatted = `$${(invoice.balanceCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
    const dueFormatted = this.formatDateOnly(invoice.dueDate);
    const customerName = invoice.customer.companyName ?? '';
    const paymentTerms = invoice.paymentTermsDays ? `Net ${invoice.paymentTermsDays}` : '';

    /** Replace merge fields supporting both {{field}} and {field} syntax. */
    const applyMergeFields = (template: string): string => {
      const fields: Record<string, string> = {
        invoiceNumber: escapeHtml(invoice.invoiceNumber),
        companyName: escapeHtml(companyName),
        total: escapeHtml(totalFormatted),
        amountDue: escapeHtml(totalFormatted),
        dueDate: escapeHtml(dueFormatted),
        customerName: escapeHtml(customerName),
        paymentTerms: escapeHtml(paymentTerms),
      };

      // Support legacy snake_case merge field tokens in saved templates
      const legacyAliases: Record<string, string> = {
        customer_name: fields.customerName,
        invoice_number: fields.invoiceNumber,
        company_name: fields.companyName,
        amount_due: fields.amountDue,
        due_date: fields.dueDate,
        payment_terms: fields.paymentTerms,
      };
      const allFields = { ...fields, ...legacyAliases };

      let result = template;
      for (const [key, value] of Object.entries(allFields)) {
        result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
      }
      for (const [key, value] of Object.entries(allFields)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      return result;
    };

    let subject = settings?.emailSubjectTemplate || 'Invoice {invoiceNumber} from {companyName}';
    subject = applyMergeFields(subject);

    const bodyTemplate = settings?.emailBodyTemplate || '';
    const customBody = applyMergeFields(bodyTemplate);

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">${escapeHtml(companyName)}</h2>
      <p>You have a new invoice.</p>
      ${customBody ? `<p>${customBody}</p>` : ''}
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Invoice #</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(invoice.invoiceNumber)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Date</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(this.formatDateOnly(invoice.issueDate))}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Due Date</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(dueFormatted)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Total</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${escapeHtml(totalFormatted)}</td></tr>
        <tr><td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Balance Due</td><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${escapeHtml(balanceFormatted)}</td></tr>
      </table>
      ${settings?.remittanceInstructions ? `<div style="margin-top: 20px; padding: 12px; background: #f9f9f9; border-radius: 4px;"><strong>Payment Instructions:</strong><br/>${escapeHtml(settings.remittanceInstructions)}</div>` : ''}
      <p style="margin-top: 20px; color: #666; font-size: 12px;">
        ${tenant?.contactEmail ? `Contact: ${escapeHtml(tenant.contactEmail)}` : ''}
      </p>
      <p style="color: #ccc; font-size: 10px; margin-top: 20px;">Powered by SALLY</p>
    </div>
  `;

    return {
      to: toEmail || null,
      replyTo: replyTo || null,
      subject,
      bodyHtml: html,
      hasPdfAttachment: true,
      invoiceNumber: invoice.invoiceNumber,
    };
  }
}
