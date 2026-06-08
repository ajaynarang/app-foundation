import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';

export interface SendEmailOptions {
  to: string;
  cc?: string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  /** Reply-To header — customer replies route here instead of `from`.
   * Used by Desk v3 AR Follow-up so customer replies land in the
   * supervisor's inbox, not the generic noreply@ address. */
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resendClient: Resend | null = null;
  private nodemailerTransport: nodemailer.Transporter | null = null;
  private emailProvider: 'resend' | 'nodemailer' | 'console' = 'console';

  constructor(private configService: ConfigService) {
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

    // Development mode - just log to console
    this.emailProvider = 'console';
    this.logger.warn(
      'Email service running in CONSOLE mode - emails will be logged but not sent. ' +
        'Set RESEND_API_KEY or SMTP credentials to enable actual email sending.',
    );
  }

  async sendEmail(options: SendEmailOptions): Promise<void> {
    const fromEmail = options.from || this.configService.get<string>('EMAIL_FROM') || 'noreply@appshore.in';

    try {
      switch (this.emailProvider) {
        case 'resend':
          await this.sendWithResend({ ...options, from: fromEmail });
          break;
        case 'nodemailer':
          await this.sendWithNodemailer({ ...options, from: fromEmail });
          break;
        case 'console':
          this.logToConsole({ ...options, from: fromEmail });
          break;
      }

      this.logger.log(`Email sent successfully to ${options.to} via ${this.emailProvider}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  private async sendWithResend(options: SendEmailOptions): Promise<void> {
    if (!this.resendClient) {
      throw new InternalServerErrorException('Email service is not available');
    }

    await this.resendClient.emails.send({
      from: options.from,
      to: options.to,
      ...(options.cc && options.cc.length > 0 ? { cc: options.cc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
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

  private logToConsole(options: SendEmailOptions): void {
    this.logger.log('========================================');
    this.logger.log('EMAIL (Console Mode)');
    this.logger.log('========================================');
    this.logger.log(`From: ${options.from}`);
    this.logger.log(`To: ${options.to}`);
    if (options.cc && options.cc.length > 0) {
      this.logger.log(`Cc: ${options.cc.join(', ')}`);
    }
    if (options.replyTo) {
      this.logger.log(`Reply-To: ${options.replyTo}`);
    }
    this.logger.log(`Subject: ${options.subject}`);
    this.logger.log('----------------------------------------');
    this.logger.log('HTML Content:');
    this.logger.log(options.html);
    this.logger.log('========================================');
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

    const subject = `You're invited to join ${companyName} on SALLY`;

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
              <h1>SALLY</h1>
              <p>Smart Routes. Confident Dispatchers. Happy Drivers.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName} ${lastName},</h2>
              <p>${invitedBy} has invited you to join <strong>${companyName}</strong> on SALLY.</p>
              <p>SALLY is a comprehensive dispatch and driver coordination platform that helps manage routes, track drivers, and ensure HOS compliance.</p>
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
              <p>&copy; 2026 SALLY. All rights reserved.</p>
              <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName} ${lastName},

${invitedBy} has invited you to join ${companyName} on SALLY.

Accept your invitation by visiting: ${acceptUrl}

This invitation will expire in 7 days.

If you didn't expect this invitation, you can safely ignore this email.

---
SALLY - Smart Routes. Confident Dispatchers. Happy Drivers.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Send tenant registration confirmation email
   */
  async sendTenantRegistrationEmail(email: string, firstName: string, companyName: string): Promise<void> {
    const subject = `Thank you for registering with SALLY`;

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
              <h1>SALLY</h1>
              <p>Smart Routes. Confident Dispatchers. Happy Drivers.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Thank you for registering <strong>${companyName}</strong> with SALLY!</p>
              <p>We've received your registration and our team is currently reviewing your application. This typically takes <strong>1-2 business days</strong>.</p>
              <h3>What happens next:</h3>
              <ul>
                <li>Our team will verify your company information</li>
                <li>You'll receive an email once your account is approved</li>
                <li>You can then invite your team and start using SALLY</li>
              </ul>
              <p>If you have any questions, feel free to contact our support team.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 SALLY. All rights reserved.</p>
              <p>If you didn't register for SALLY, you can safely ignore this email.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Thank you for registering ${companyName} with SALLY!

We've received your registration and our team is currently reviewing your application. This typically takes 1-2 business days.

What happens next:
• Our team will verify your company information
• You'll receive an email once your account is approved
• You can then invite your team and start using SALLY

If you have any questions, feel free to contact our support team.

---
SALLY - Smart Routes. Confident Dispatchers. Happy Drivers.
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

    const subject = `Welcome to SALLY - Your account is now active!`;

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
              <h1>SALLY</h1>
              <p>Smart Routes. Confident Dispatchers. Happy Drivers.</p>
            </div>
            <div class="content">
              <h2>Congratulations, ${firstName}! 🎉</h2>
              <p>Your account for <strong>${companyName}</strong> has been approved and is now active.</p>
              <p>You can now access SALLY and start managing your fleet operations.</p>
              <div style="text-align: center;">
                <a href="${loginUrl}" class="button">Login to SALLY</a>
              </div>
              <div class="info-box">
                <strong>Your team's URL:</strong><br>
                ${displayUrl}
                <br><br>
                <span style="color: #666; font-size: 14px;">${subdomainInstructions}</span>
              </div>
              <h3>Next steps:</h3>
              <ul>
                <li>Invite your dispatchers and drivers</li>
                <li>Set up your first route</li>
                <li>Explore the dashboard and features</li>
              </ul>
              <p>Welcome aboard! If you have any questions, our support team is here to help.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 SALLY. All rights reserved.</p>
              <p>Need help? Contact us at sally-support@appshore.in</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Congratulations! Your account for ${companyName} has been approved and is now active.

Login to SALLY: ${loginUrl}

Your team's URL: ${displayUrl}

Next steps:
• Invite your dispatchers and drivers
• Set up your first route
• Explore the dashboard and features

Welcome aboard! If you have any questions, our support team is here to help.

---
SALLY - Smart Routes. Confident Dispatchers. Happy Drivers.
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
    const subject = `Update on your SALLY registration`;

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
              <h1>SALLY</h1>
              <p>Smart Routes. Confident Dispatchers. Happy Drivers.</p>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>Thank you for your interest in SALLY.</p>
              <p>After reviewing your registration for <strong>${companyName}</strong>, we're unable to approve your account at this time.</p>
              <div class="reason-box">
                <strong>Reason:</strong><br>
                ${rejectionReason}
              </div>
              <p>If you believe this is an error or would like to discuss this further, please don't hesitate to contact our support team.</p>
              <div style="text-align: center;">
                <a href="mailto:sally-support@appshore.in" class="button">Contact Support</a>
              </div>
              <p>We appreciate your understanding.</p>
            </div>
            <div class="footer">
              <p>&copy; 2026 SALLY. All rights reserved.</p>
              <p>Questions? Email us at sally-support@appshore.in</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = `
Hi ${firstName},

Thank you for your interest in SALLY.

After reviewing your registration for ${companyName}, we're unable to approve your account at this time.

Reason: ${rejectionReason}

If you believe this is an error or would like to discuss this further, please don't hesitate to contact our support team at sally-support@appshore.in.

We appreciate your understanding.

---
SALLY - Smart Routes. Confident Dispatchers. Happy Drivers.
    `.trim();

    await this.sendEmail({ to: email, subject, html, text });
  }

  /**
   * Get login URL (subdomain-aware or single domain)
   */
  private getLoginUrl(subdomain: string): string {
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'sally.appshore.in';
    const useSubdomains = this.configService.get<boolean>('USE_TENANT_SUBDOMAINS') !== false; // Default true

    if (useSubdomains) {
      // Multi-tenant: https://acme.sally.appshore.in/login
      return `https://${subdomain}.${baseUrl}/login`;
    } else {
      // Single domain: https://sally.appshore.in/login
      return `https://${baseUrl}/login`;
    }
  }

  /**
   * Get display URL for emails (subdomain or base URL)
   */
  private getDisplayUrl(subdomain: string): string {
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'sally.appshore.in';
    const useSubdomains = this.configService.get<boolean>('USE_TENANT_SUBDOMAINS') !== false;

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
    const baseUrl = this.configService.get<string>('TENANT_BASE_URL') || 'sally.appshore.in';
    const useSubdomains = this.configService.get<boolean>('USE_TENANT_SUBDOMAINS') !== false;

    if (useSubdomains) {
      return `Or visit ${baseUrl} and enter your subdomain: <strong>${subdomain}</strong>`;
    } else {
      return `Visit <strong>${baseUrl}</strong> to login`;
    }
  }
}
