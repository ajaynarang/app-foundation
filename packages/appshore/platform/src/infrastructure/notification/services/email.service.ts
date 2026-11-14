import { Inject, Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import { isDevelopmentEnv } from '@appshore/kernel/shared/utils/env-label';
import { maskEmail } from '@appshore/kernel/shared/utils/log-redaction';
import { toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { OUTBOUND_CHANNEL, recordOutboundFailed } from '@appshore/kernel/infrastructure/telemetry/metrics';
import {
  OUTBOUND_GATE,
  OUTBOUND_SOURCE,
  type OutboundGate,
} from '@appshore/kernel/infrastructure/outbound/outbound-gate.port';
import { observeResendResult } from './resend-delivery';

/**
 * Thrown by `sendEmail` when no provider (Resend or SMTP) is configured outside `ENV_TYPE=development`. A message
 * that cannot be sent fails loudly instead of being printed to a log a vendor may hold, where it would carry reset
 * links and invitation tokens.
 */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super('No email provider is configured: set RESEND_API_KEY or the SMTP_* keys');
    this.name = 'EmailNotConfiguredError';
  }
}

export interface SendEmailOptions {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /** Reply-To header — customer replies route here instead of `from`.
   * Used by Desk responsibilities so customer replies land in the
   * supervisor's inbox, not the generic noreply@ address. */
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | null = null;
  private nodemailerTransport: nodemailer.Transporter | null = null;
  private emailProvider: 'resend' | 'nodemailer' | 'console' = 'console';

  constructor(
    private configService: ConfigService,
    @Inject(OUTBOUND_GATE) private readonly outboundGate: OutboundGate,
  ) {
    this.initializeEmailProvider();
  }

  private initializeEmailProvider() {
    const resendApiKey = this.configService.get<string>('RESEND_API_KEY');
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = this.configService.get<number>('SMTP_PORT');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

    // Try Resend first (recommended)
    if (resendApiKey) {
      this.resendClient = new Resend(resendApiKey);
      this.emailProvider = 'resend';
      this.logger.log('Email service initialized with Resend');
      return;
    }

    // Fallback to Nodemailer with SMTP
    if (smtpHost && smtpPort && smtpUser && smtpPassword) {
      this.nodemailerTransport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465, // true for 465, false for other ports
        auth: {
          user: smtpUser,
          pass: smtpPassword,
        },
      });
      this.emailProvider = 'nodemailer';
      this.logger.log('Email service initialized with Nodemailer (SMTP)');
      return;
    }

    // No provider. On a developer's machine (ENV_TYPE=development) each message is printed to the log, so the
    // zero-config flows (reset, invitation) still work; anywhere else every send throws EmailNotConfiguredError.
    this.emailProvider = 'console';
    this.logger.warn(
      'Email service has no provider: with ENV_TYPE=development each message is printed to the log; in any other ' +
        'environment every send fails. Set RESEND_API_KEY or SMTP credentials to send email.',
    );
  }

  /** True when a send reaches a real provider (Resend or SMTP); false on the console path. */
  usesProvider(): boolean {
    return this.emailProvider !== 'console';
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const fromEmail =
      options.from || this.configService.get<string>('EMAIL_FROM') || process.env.EMAIL_FROM || 'noreply@example.com';

    let message: SendEmailOptions = { ...options, from: fromEmail };

    // The outbound gate sits in front of a real provider only (ADR "Outbound gate"): the development console path is
    // never gated, so a fresh clone with no keys behaves as before. A held-back email is recorded by the gate and is
    // not a failure.
    if (this.emailProvider !== 'console') {
      const gated = await this.outboundGate.gateEmail(message, { source: OUTBOUND_SOURCE.EMAIL });
      if (!gated) {
        this.logger.log(`Email to ${maskEmail(options.to)} held back by the outbound gate`);
        return;
      }
      message = gated;
    }

    try {
      switch (this.emailProvider) {
        case 'resend':
          await this.sendWithResend(message);
          break;
        case 'nodemailer':
          await this.sendWithNodemailer(message);
          break;
        case 'console':
          if (!isDevelopmentEnv()) throw new EmailNotConfiguredError();
          this.logToConsole(message);
          break;
      }

      this.logger.log(`Email sent to ${maskEmail(options.to)} via ${this.emailProvider}`);
    } catch (error) {
      recordOutboundFailed(OUTBOUND_CHANNEL.EMAIL);
      this.logger.error({ msg: `Failed to send email to ${maskEmail(options.to)}`, err: toLoggableError(error) });
      throw error;
    }
  }

  private async sendWithResend(options: SendEmailOptions): Promise<void> {
    if (!this.resendClient) {
      throw new InternalServerErrorException('Email service is not available');
    }

    // Resend reports a refused email in `error` and does not throw; observeResendResult throws it, so it is counted
    // and ledgered as a failure.
    const result = await this.resendClient.emails.send({
      from: options.from,
      to: options.to,
      ...(options.cc && options.cc.length > 0 ? { cc: options.cc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    observeResendResult(result);
  }

  private async sendWithNodemailer(options: SendEmailOptions): Promise<void> {
    if (!this.nodemailerTransport) {
      throw new InternalServerErrorException('Email service is not available');
    }

    await this.nodemailerTransport.sendMail({
      from: options.from,
      to: options.to,
      ...(options.cc && options.cc.length > 0 ? { cc: options.cc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
  }

  /** Development only (`sendEmail` checks): the message as a developer needs it, with every address masked. */
  private logToConsole(options: SendEmailOptions): void {
    const lines = [
      'EMAIL (console mode, ENV_TYPE=development)',
      `To: ${maskEmail(options.to)}`,
      ...(options.cc && options.cc.length > 0 ? [`Cc: ${options.cc.map((cc) => maskEmail(cc)).join(', ')}`] : []),
      ...(options.replyTo ? [`Reply-To: ${maskEmail(options.replyTo)}`] : []),
      `Subject: ${options.subject}`,
      '----------------------------------------',
      options.text ?? options.html,
    ];
    this.logger.log(lines.join('\n'));
  }

  /**
   * Send user invitation email
   */
  async sendUserInvitation(
    email: string,
    firstName: string,
    lastName: string,
    invitedBy: string,
    companyName: string,
    invitationToken: string,
  ): Promise<void> {
    const appUrl = this.configService.get<string>('APP_URL') || 'http://localhost:3000';
    const acceptUrl = `${appUrl}/accept-invitation?token=${invitationToken}`;

    const subject = `You're invited to join ${companyName} on the platform`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #000;
              color: #fff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName} ${lastName},</h2>
              <p>${invitedBy} has invited you to join <strong>${companyName}</strong> on the platform.</p>
              <p>This platform helps your team collaborate and get work done.</p>
              <p>Click the button below to accept the invitation and create your account:</p>
              <div style="text-align: center;">
                <a href="${acceptUrl}" class="button">Accept Invitation</a>
              </div>
              <p style="color: #666; font-size: 14px;">
                Or copy and paste this link into your browser:<br>
                <a href="${acceptUrl}">${acceptUrl}</a>
              </p>
              <p style="color: #999; font-size: 12px;">
                This invitation will expire in 7 days.
              </p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName} ${lastName},

${invitedBy} has invited you to join ${companyName} on the platform.

Accept your invitation by visiting: ${acceptUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant registration confirmation email
   */
  async sendTenantRegistrationEmail(email: string, firstName: string, companyName: string): Promise<void> {
    const subject = `Thank you for registering`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Thank you for registering <strong>${companyName}</strong>!</p>
              <p>We've received your registration and our team is currently reviewing your application. This typically takes <strong>1-2 business days</strong>.</p>
              <h3>What happens next:</h3>
              <ul>
                <li>Our team will verify your company information</li>
                <li>You'll receive an email once your account is approved</li>
                <li>You can then invite your team and get started</li>
              </ul>
              <p>If you have any questions, feel free to contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>If you didn't register, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Thank you for registering ${companyName}!

We've received your registration and our team is currently reviewing your application. This typically takes 1-2 business days.

What happens next:
• Our team will verify your company information
• You'll receive an email once your account is approved
• You can then invite your team and get started

If you have any questions, feel free to contact our support team.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant approval notification email
   */
  async sendTenantApprovalEmail(
    email: string,
    firstName: string,
    companyName: string,
    subdomain: string,
  ): Promise<void> {
    const loginUrl = this.getLoginUrl(subdomain);
    const displayUrl = this.getDisplayUrl(subdomain);
    const subdomainInstructions = this.getSubdomainInstructionText(subdomain);

    const subject = `Welcome - Your account is now active!`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #000;
              color: #fff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .info-box {
              background-color: #fff;
              border: 2px solid #000;
              padding: 15px;
              margin: 20px 0;
              border-radius: 5px;
            }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Congratulations, ${firstName}! 🎉</h2>
              <p>Your account for <strong>${companyName}</strong> has been approved and is now active.</p>
              <p>You can now access the platform and get started.</p>
              <div style="text-align: center;">
                <a href="${loginUrl}" class="button">Login</a>
              </div>
              <div class="info-box">
                <strong>Your team's URL:</strong><br>
                ${displayUrl}
                <br><br>
                <span style="color: #666; font-size: 14px;">${subdomainInstructions}</span>
              </div>
              <h3>Next steps:</h3>
              <ul>
                <li>Invite your teammates</li>
                <li>Set up your workspace</li>
                <li>Explore the dashboard and features</li>
              </ul>
              <p>Welcome aboard! If you have any questions, our support team is here to help.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>Need help? Contact us at support@example.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Congratulations! Your account for ${companyName} has been approved and is now active.

Login: ${loginUrl}

Your team's URL: ${displayUrl}

Next steps:
• Invite your teammates
• Set up your workspace
• Explore the dashboard and features

Welcome aboard! If you have any questions, our support team is here to help.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant rejection notification email
   */
  async sendTenantRejectionEmail(
    email: string,
    firstName: string,
    companyName: string,
    rejectionReason: string,
  ): Promise<void> {
    const subject = `Update on your registration`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #666;
              color: #fff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .reason-box {
              background-color: #fff;
              border-left: 4px solid #666;
              padding: 15px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Thank you for your interest.</p>
              <p>After reviewing your registration for <strong>${companyName}</strong>, we're unable to approve your account at this time.</p>
              <div class="reason-box">
                <strong>Reason:</strong><br>
                ${rejectionReason}
              </div>
              <p>If you believe this is an error or would like to discuss this further, please don't hesitate to contact our support team.</p>
              <div style="text-align: center;">
                <a href="mailto:support@example.com" class="button">Contact Support</a>
              </div>
              <p>We appreciate your understanding.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>Questions? Email us at support@example.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Thank you for your interest.

After reviewing your registration for ${companyName}, we're unable to approve your account at this time.

Reason: ${rejectionReason}

If you believe this is an error or would like to discuss this further, please don't hesitate to contact our support team at support@example.com.

We appreciate your understanding.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant suspension notification email
   */
  async sendTenantSuspensionEmail(
    email: string,
    firstName: string,
    companyName: string,
    reason: string,
  ): Promise<void> {
    const subject = `Your account has been suspended`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .button {
              display: inline-block;
              padding: 12px 30px;
              background-color: #666;
              color: #fff;
              text-decoration: none;
              border-radius: 5px;
              margin: 20px 0;
            }
            .reason-box {
              background-color: #fff;
              border-left: 4px solid #666;
              padding: 15px;
              margin: 20px 0;
            }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Your account for <strong>${companyName}</strong> has been suspended and access to the platform is temporarily disabled.</p>
              <div class="reason-box">
                <strong>Reason:</strong><br>
                ${reason}
              </div>
              <p>If you believe this is an error or would like to discuss reactivating your account, please contact our support team.</p>
              <div style="text-align: center;">
                <a href="mailto:support@example.com" class="button">Contact Support</a>
              </div>
              <p>We appreciate your understanding.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>Questions? Email us at support@example.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Your account for ${companyName} has been suspended and access to the platform is temporarily disabled.

Reason: ${reason}

If you believe this is an error or would like to discuss reactivating your account, please contact our support team at support@example.com.

We appreciate your understanding.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant reactivation notification email
   */
  async sendTenantReactivationEmail(email: string, firstName: string, companyName: string): Promise<void> {
    const subject = `Your account has been reactivated`;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #000; color: #fff; padding: 20px; text-align: center; }
            .content { padding: 30px; background-color: #f9f9f9; }
            .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>App</h1>
              <p>Your team, organized.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Good news — your account for <strong>${companyName}</strong> has been reactivated and is now active.</p>
              <p>You and your team can sign in and pick up right where you left off.</p>
              <p>If you have any questions, our support team is here to help.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 App. All rights reserved.</p>
              <p>Need help? Contact us at support@example.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Good news — your account for ${companyName} has been reactivated and is now active.

You and your team can sign in and pick up right where you left off.

If you have any questions, our support team is here to help.

---
App - Your team, organized.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Get login URL (subdomain-aware or single domain)
   */
  private getLoginUrl(subdomain: string): string {
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'app.example.com';
    const useSubdomains = this.configService.get<string>('USE_TENANT_SUBDOMAINS') !== 'false'; // Default true

    if (useSubdomains) {
      // Multi-tenant: https://acme.app.example.com/login
      return `https://${subdomain}.${baseUrl}/login`;
    } else {
      // Single domain: https://app.example.com/login
      return `https://${baseUrl}/login`;
    }
  }

  /**
   * Get display URL for emails (subdomain or base URL)
   */
  private getDisplayUrl(subdomain: string): string {
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'app.example.com';
    const useSubdomains = this.configService.get<string>('USE_TENANT_SUBDOMAINS') !== 'false';

    if (useSubdomains) {
      return `${subdomain}.${baseUrl}`;
    } else {
      return baseUrl;
    }
  }

  /**
   * Get subdomain instruction text for emails
   */
  private getSubdomainInstructionText(subdomain: string): string {
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'app.example.com';
    const useSubdomains = this.configService.get<string>('USE_TENANT_SUBDOMAINS') !== 'false';

    if (useSubdomains) {
      return `Or visit ${baseUrl} and enter your subdomain: <strong>${subdomain}</strong>`;
    } else {
      return `Visit <strong>${baseUrl}</strong> to login`;
    }
  }
}
