import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { EmailService } from './services/email.service';
import { NotificationType, NotificationChannel, NotificationStatus, Notification } from '@prisma/client';
import { NotificationFiltersDto } from './dto/notification-filters.dto';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private configService: ConfigService,
  ) {}

  /**
   * Send tenant registration confirmation email
   */
  async sendTenantRegistrationConfirmation(
    tenantId: string,
    ownerEmail: string,
    ownerFirstName: string,
    companyName: string,
  ): Promise<Notification> {
    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Prepare metadata
    const metadata = {
      tenantId: tenant.id,
      companyName,
    };

    // Create notification and send email
    return this.createAndSendNotification(
      NotificationType.TENANT_REGISTRATION_CONFIRMATION,
      ownerEmail,
      metadata,
      async () => {
        await this.emailService.sendTenantRegistrationEmail(ownerEmail, ownerFirstName, companyName);
      },
    );
  }

  /**
   * Send tenant approval notification email
   */
  async sendTenantApprovalNotification(
    tenantId: string,
    ownerEmail: string,
    ownerFirstName: string,
    companyName: string,
    subdomain: string,
  ): Promise<Notification> {
    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Prepare metadata
    const metadata = {
      tenantId: tenant.id,
      companyName,
      subdomain,
    };

    // Create notification and send email
    return this.createAndSendNotification(NotificationType.TENANT_APPROVED, ownerEmail, metadata, async () => {
      await this.emailService.sendTenantApprovalEmail(ownerEmail, ownerFirstName, companyName, subdomain);
    });
  }

  /**
   * Send tenant rejection notification email
   */
  async sendTenantRejectionNotification(
    tenantId: string,
    ownerEmail: string,
    ownerFirstName: string,
    companyName: string,
    rejectionReason: string,
  ): Promise<Notification> {
    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    // Prepare metadata
    const metadata = {
      tenantId: tenant.id,
      companyName,
      rejectionReason,
    };

    // Create notification and send email
    return this.createAndSendNotification(NotificationType.TENANT_REJECTED, ownerEmail, metadata, async () => {
      await this.emailService.sendTenantRejectionEmail(ownerEmail, ownerFirstName, companyName, rejectionReason);
    });
  }

  /**
   * Send tenant suspension notification
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future email provider
  async sendTenantSuspensionNotification(
    tenantId: string,
    email: string,
    firstName: string,
    companyName: string,
    reason: string,
  ): Promise<void> {
    this.logger.log(`Sending tenant suspension notification to ${email}`);
    this.logger.log(`Tenant: ${companyName} (${tenantId})`);
    this.logger.log(`Reason: ${reason}`);
    // TODO: Implement actual email sending via SendGrid/AWS SES
    // For now, just log the notification
  }

  /**
   * Send tenant reactivation notification
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future email provider
  async sendTenantReactivationNotification(
    tenantId: string,
    email: string,
    firstName: string,
    companyName: string,
  ): Promise<void> {
    this.logger.log(`Sending tenant reactivation notification to ${email}`);
    this.logger.log(`Tenant: ${companyName} (${tenantId})`);
    this.logger.log(`Your account has been reactivated and is now active.`);
    // TODO: Implement actual email sending via SendGrid/AWS SES
    // For now, just log the notification
  }

  /**
   * Get notification history for a tenant
   */
  async getNotificationHistory(tenantId: string, filters?: NotificationFiltersDto): Promise<Notification[]> {
    // Get tenant database ID from tenantId string
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId },
    });

    if (!tenant) {
      return [];
    }

    return this.prisma.notification.findMany({
      where: {
        tenantId: tenant.id,
        ...(filters?.type && { type: filters.type }),
        ...(filters?.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Private helper: Create and send notification
   */
  private async createAndSendNotification(
    type: NotificationType,
    recipient: string,
    metadata: any,
    emailSender: () => Promise<void>,
  ): Promise<Notification> {
    // Extract tenant ID from metadata
    const tenantId = metadata.tenantId || null;
    const userId = metadata.userId || null;
    const invitationId = metadata.invitationId || null;

    // Create notification record with PENDING status
    const notification = await this.prisma.notification.create({
      data: {
        type,
        channel: NotificationChannel.EMAIL,
        recipient,
        status: NotificationStatus.PENDING,
        category: 'SYSTEM',
        tenantId,
        userId,
        invitationId,
        metadata,
      },
    });

    try {
      // Attempt to send email
      await emailSender();

      // Update notification status to SENT
      const updatedNotification = await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
        },
      });

      this.logger.log(`Notification sent successfully: ${type} to ${recipient}`);

      return updatedNotification;
    } catch (error) {
      // Update notification status to FAILED with error message
      const failedNotification = await this.prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.FAILED,
          errorMessage: error.message,
        },
      });

      this.logger.error(`Failed to send notification: ${type} to ${recipient}`, error.message);

      // Don't throw - allow business logic to continue
      return failedNotification;
    }
  }
}
