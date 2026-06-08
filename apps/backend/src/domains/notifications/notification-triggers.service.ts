import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { NotificationType } from '@prisma/client';
import { ChannelResolutionService } from './channel-resolution.service';
import { NotificationDeliveryService } from './delivery.service';

interface TriggerParams {
  tenantId: number;
  type: NotificationType;
  category: 'SYSTEM' | 'TEAM' | 'BILLING';
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
  recipientRoles?: string[];
  recipientUserIds?: number[];
}

interface RecipientInfo {
  id: number;
  userId: string;
  firebaseUid: string | null;
  email: string | null;
  phone: string | null;
}

@Injectable()
export class NotificationTriggersService {
  private readonly logger = new Logger(NotificationTriggersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly channelResolution: ChannelResolutionService,
    private readonly deliveryService: NotificationDeliveryService,
  ) {}

  async trigger(params: TriggerParams): Promise<void> {
    try {
      const recipients = await this.resolveRecipients(params);

      for (const recipient of recipients) {
        try {
          const prefs = await this.channelResolution.resolveForNotification({
            userId: recipient.id,
            category: params.category,
          });

          // Build channel list from resolved preferences (single DB query)
          const channels: string[] = [];
          if (!prefs.skipInApp) channels.push('in_app');
          if (!prefs.skipEmail) channels.push('email');
          if (!prefs.skipSms) channels.push('sms');
          // Push follows the same category preference as email for now;
          // push-specific skipPush flag can be added to ResolvedNotificationPrefs
          // when per-channel push preferences are implemented.
          if (!prefs.skipEmail) channels.push('push');

          // If no channels enabled, skip this recipient entirely
          if (channels.length === 0) continue;

          // Use User.userId for SSE routing — matches what SseService.addClient
          // stores in the registry and what JWT carries. (Was previously reading
          // firebaseUid here, which silently dropped every SSE notification
          // because the registry is keyed by userId, not firebaseUid.)
          if (!recipient.userId) {
            this.logger.warn(`User ${recipient.id} has no userId — skipping SSE for this notification`);
          }

          // Use DeliveryService for multi-channel delivery
          await this.deliveryService.deliver({
            recipientUserId: recipient.userId || undefined,
            recipientDbId: recipient.id,
            tenantId: params.tenantId,
            type: params.type,
            category: params.category,
            title: params.title,
            message: params.message,
            actionUrl: params.actionUrl,
            actionLabel: params.actionLabel,
            iconType: params.iconType,
            metadata: params.metadata,
            channels,
            recipientEmail: !prefs.skipEmail ? (recipient.email ?? undefined) : undefined,
            recipientPhone: !prefs.skipSms ? (recipient.phone ?? undefined) : undefined,
          });
        } catch (err: any) {
          this.logger.warn(`Failed to notify user ${recipient.id}: ${err.message}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to trigger notification ${params.type}: ${err.message}`);
    }
  }

  private async resolveRecipients(params: TriggerParams): Promise<RecipientInfo[]> {
    if (params.recipientUserIds?.length) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: params.recipientUserIds }, isActive: true },
        select: { id: true, userId: true, firebaseUid: true, email: true, phone: true },
      });
      return users;
    }

    if (!params.recipientRoles?.length) {
      return [];
    }

    return this.prisma.user.findMany({
      where: {
        tenantId: params.tenantId,
        role: { in: params.recipientRoles as any },
        isActive: true,
      },
      select: { id: true, userId: true, firebaseUid: true, email: true, phone: true },
    });
  }

  // --- Convenience methods for each trigger type ---

  async invoiceGenerated(tenantId: number, invoiceNumber: string, loadNumber: string, amount: string) {
    return this.trigger({
      tenantId,
      type: 'INVOICE_GENERATED' as NotificationType,
      category: 'BILLING',
      title: `Invoice ${invoiceNumber} Generated`,
      message: `Invoice for Load ${loadNumber} — ${amount}`,
      actionUrl: '/dispatcher/billing',
      actionLabel: 'View Billing',
      iconType: 'billing',
      recipientRoles: ['OWNER', 'ADMIN', 'DISPATCHER'],
    });
  }

  async invoiceSent(tenantId: number, invoiceNumber: string, customerName: string) {
    return this.trigger({
      tenantId,
      type: 'INVOICE_SENT' as NotificationType,
      category: 'BILLING',
      title: `Invoice ${invoiceNumber} Sent`,
      message: `Sent to ${customerName}`,
      actionUrl: '/dispatcher/billing',
      actionLabel: 'View Billing',
      iconType: 'billing',
      recipientRoles: ['OWNER', 'ADMIN', 'DISPATCHER'],
    });
  }

  async customerInvoiceSent(tenantId: number, customerId: number, invoiceNumber: string, amount: string) {
    const customerUsers = await this.prisma.user.findMany({
      where: { tenantId, role: 'CUSTOMER', customerId, isActive: true },
      select: { id: true },
    });
    if (!customerUsers.length) return;

    return this.trigger({
      tenantId,
      type: 'CUSTOMER_INVOICE_SENT' as NotificationType,
      category: 'BILLING',
      title: `Invoice ${invoiceNumber}`,
      message: `New invoice for ${amount}`,
      actionUrl: '/customer/dashboard',
      actionLabel: 'View Invoice',
      iconType: 'billing',
      recipientUserIds: customerUsers.map((u) => u.id),
    });
  }

  async paymentReceived(tenantId: number, invoiceNumber: string, amount: string, customerName: string) {
    return this.trigger({
      tenantId,
      type: 'PAYMENT_RECEIVED' as NotificationType,
      category: 'BILLING',
      title: `Payment Received — ${invoiceNumber}`,
      message: `${amount} from ${customerName}`,
      actionUrl: '/dispatcher/billing',
      actionLabel: 'View Billing',
      iconType: 'billing',
      recipientRoles: ['OWNER', 'ADMIN', 'DISPATCHER'],
    });
  }

  async customerPaymentConfirmed(tenantId: number, customerId: number, invoiceNumber: string, amount: string) {
    const customerUsers = await this.prisma.user.findMany({
      where: { tenantId, role: 'CUSTOMER', customerId, isActive: true },
      select: { id: true },
    });
    if (!customerUsers.length) return;

    return this.trigger({
      tenantId,
      type: 'CUSTOMER_PAYMENT_CONFIRMED' as NotificationType,
      category: 'BILLING',
      title: 'Payment Confirmed',
      message: `Your payment of ${amount} for invoice ${invoiceNumber} has been recorded`,
      actionUrl: '/customer/dashboard',
      actionLabel: 'View Dashboard',
      iconType: 'billing',
      recipientUserIds: customerUsers.map((u) => u.id),
    });
  }

  async settlementReady(tenantId: number, settlementNumber: string, driverName: string, amount: string) {
    return this.trigger({
      tenantId,
      type: 'SETTLEMENT_READY' as NotificationType,
      category: 'BILLING',
      title: `Settlement ${settlementNumber} Ready`,
      message: `${driverName} — ${amount}`,
      actionUrl: '/dispatcher/pay',
      actionLabel: 'View Settlements',
      iconType: 'billing',
      recipientRoles: ['OWNER', 'ADMIN'],
    });
  }

  async driverPaymentProcessed(tenantId: number, driverUserId: number, settlementNumber: string, amount: string) {
    return this.trigger({
      tenantId,
      type: 'DRIVER_PAYMENT_PROCESSED' as NotificationType,
      category: 'BILLING',
      title: 'Payment Processed',
      message: `Settlement ${settlementNumber} — ${amount} has been paid`,
      actionUrl: '/driver/settlements',
      actionLabel: 'View Settlement',
      iconType: 'billing',
      recipientUserIds: [driverUserId],
    });
  }

  async userJoined(tenantId: number, userName: string, role: string) {
    return this.trigger({
      tenantId,
      type: 'USER_JOINED' as NotificationType,
      category: 'TEAM',
      title: `${userName} Joined`,
      message: `New ${role.toLowerCase()} added to the team`,
      iconType: 'user',
      recipientRoles: ['OWNER', 'ADMIN'],
    });
  }

  async userRoleChanged(tenantId: number, userId: number, userName: string, oldRole: string, newRole: string) {
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['OWNER', 'ADMIN'] as any },
        isActive: true,
      },
      select: { id: true },
    });
    const recipientIds = [...new Set([userId, ...admins.map((a) => a.id)])];

    return this.trigger({
      tenantId,
      type: 'ROLE_CHANGED' as NotificationType,
      category: 'TEAM',
      title: `Role Changed — ${userName}`,
      message: `Changed from ${oldRole} to ${newRole}`,
      iconType: 'user',
      recipientUserIds: recipientIds,
    });
  }

  async driverActivated(tenantId: number, driverName: string) {
    return this.trigger({
      tenantId,
      type: 'DRIVER_ACTIVATED' as NotificationType,
      category: 'TEAM',
      title: 'Driver Activated',
      message: `${driverName} is now active`,
      iconType: 'user',
      recipientRoles: ['OWNER', 'ADMIN'],
    });
  }

  async driverDeactivated(tenantId: number, driverName: string, reason?: string) {
    return this.trigger({
      tenantId,
      type: 'DRIVER_DEACTIVATED' as NotificationType,
      category: 'TEAM',
      title: 'Driver Deactivated',
      message: `${driverName} has been deactivated${reason ? `: ${reason}` : ''}`,
      iconType: 'user',
      recipientRoles: ['OWNER', 'ADMIN'],
    });
  }

  async integrationSyncCompleted(tenantId: number, integrationName: string, summary: string) {
    return this.trigger({
      tenantId,
      type: 'INTEGRATION_SYNC_COMPLETED' as NotificationType,
      category: 'SYSTEM',
      title: `${integrationName} Sync Complete`,
      message: summary,
      actionUrl: 'console:/integrations/connections',
      actionLabel: 'View Integrations',
      iconType: 'integration',
      recipientRoles: ['OWNER', 'ADMIN'],
    });
  }

  async integrationSyncFailed(tenantId: number, integrationName: string, error: string) {
    return this.trigger({
      tenantId,
      type: 'INTEGRATION_SYNC_FAILED' as NotificationType,
      category: 'SYSTEM',
      title: `${integrationName} Sync Failed`,
      message: error,
      actionUrl: 'console:/integrations/connections',
      actionLabel: 'View Integrations',
      iconType: 'integration',
      recipientRoles: ['OWNER', 'ADMIN', 'DISPATCHER'],
    });
  }
}
