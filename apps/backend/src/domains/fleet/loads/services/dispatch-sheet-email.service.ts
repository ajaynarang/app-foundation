import { Injectable, Logger } from '@nestjs/common';
import { DispatchSheetPdfService } from './dispatch-sheet-pdf.service';
import type { DispatchSheetData } from './dispatch-sheet-pdf.service';

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
export class DispatchSheetEmailService {
  private readonly logger = new Logger(DispatchSheetEmailService.name);
  private resendClient: any = null;

  constructor(private readonly pdfService: DispatchSheetPdfService) {}

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

  async sendDispatchSheet(
    data: DispatchSheetData,
    driverEmail: string,
    companyName: string,
    settings: {
      mcNumber?: string | null;
      dotNumber?: string | null;
      phone?: string | null;
      replyToEmail?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zip?: string | null;
    } | null,
  ): Promise<{ sent: boolean; sentTo: string }> {
    // Build company address for PDF header
    const addressParts = [
      settings?.address,
      [settings?.city, settings?.state].filter(Boolean).join(', '),
      settings?.zip,
    ].filter(Boolean);
    const companyAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

    // Generate PDF
    const pdfBuffer = await this.pdfService.generatePdf(
      data,
      companyName,
      settings?.mcNumber,
      settings?.dotNumber,
      settings?.phone,
      companyAddress,
    );

    // Build email
    const loadNum = escapeHtml(data.loadNumber);
    const subject = `Dispatch Sheet \u2014 Load #${data.loadNumber}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${escapeHtml(companyName)}</h2>
        <p>Your dispatch sheet for <strong>Load #${loadNum}</strong> is attached.</p>
        <p>Please review pickup/delivery details and contact dispatch with any questions.</p>
        ${settings?.phone ? `<p style="color: #666;">Dispatch: ${escapeHtml(settings.phone)}</p>` : ''}
        <p style="color: #ccc; font-size: 10px; margin-top: 30px;">Powered by SALLY</p>
      </div>
    `;

    // Send via Resend or log
    const resend = await this.getResendClient();
    if (!resend) {
      this.logger.warn('No RESEND_API_KEY configured, email not sent');
      this.logger.log(`Would send dispatch sheet for Load #${data.loadNumber} to ${driverEmail}`);
      return { sent: false, sentTo: driverEmail };
    }

    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'noreply@appshore.in',
      to: driverEmail,
      replyTo: settings?.replyToEmail || undefined,
      subject,
      html,
      attachments: [
        {
          filename: `dispatch-sheet-${data.loadNumber}.pdf`,
          content: pdfBuffer,
        },
      ],
    });

    this.logger.log(`Sent dispatch sheet for Load #${data.loadNumber} to ${driverEmail}`);
    return { sent: true, sentTo: driverEmail };
  }
}
