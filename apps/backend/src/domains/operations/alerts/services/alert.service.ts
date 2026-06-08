import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';

export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface Alert {
  title: string;
  message: string;
  severity: AlertSeverity;
  context: Record<string, any>;
}

@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private readonly cache: SallyCacheService,
  ) {}

  async sendAlert(alert: Alert, tenantId: number, recipients?: string[]): Promise<void> {
    if (!recipients || recipients.length === 0) {
      recipients = await this.getAdminEmails(tenantId);
    }

    if (recipients.length === 0) {
      this.logger.warn('No recipients for alert, skipping email');
      return;
    }

    const subject = `[${alert.severity}] ${alert.title}`;
    const html = this.formatAlertEmail(alert);

    try {
      // Send to each recipient individually (Resend best practice)
      for (const recipient of recipients) {
        await this.emailService.sendEmail({
          to: recipient,
          subject,
          html,
          // from is optional - EmailService uses EMAIL_FROM from config
        });
      }

      this.logger.log(`Alert sent to ${recipients.length} recipients: ${alert.title}`);
    } catch (error) {
      this.logger.error(`Failed to send alert: ${error.message}`);
    }
  }

  private async getAdminEmails(tenantId: number): Promise<string[]> {
    return this.cache.getOrSet(
      buildKey('sally:alerts', 'admin-emails', tenantId),
      async () => {
        const admins = await this.prisma.user.findMany({
          where: {
            tenantId,
            role: { in: ['ADMIN', 'SUPER_ADMIN'] },
            isActive: true,
          },
          select: { email: true },
        });

        return admins.map((admin) => admin.email);
      },
      CACHE_TTL_WARM_5M,
    );
  }

  private formatAlertEmail(alert: Alert): string {
    const color = {
      INFO: '#3b82f6',
      WARNING: '#f59e0b',
      ERROR: '#ef4444',
      CRITICAL: '#dc2626',
    }[alert.severity];

    return `
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; margin: 0; padding: 20px; background: #f9fafb;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden;">
          <div style="background: ${color}; color: white; padding: 24px;">
            <h2 style="margin: 0;">${alert.title}</h2>
            <p style="margin: 8px 0 0 0;">Severity: ${alert.severity}</p>
          </div>
          <div style="padding: 24px;">
            <p style="margin: 0 0 20px 0;">${alert.message}</p>
            <div style="background: #f9fafb; padding: 16px; border-radius: 6px;">
              <h3 style="margin: 0 0 12px 0;">Context</h3>
              <pre style="margin: 0; overflow: auto;">${JSON.stringify(alert.context, null, 2)}</pre>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}
