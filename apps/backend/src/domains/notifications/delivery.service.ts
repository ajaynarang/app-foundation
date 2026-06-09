import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InAppNotificationService } from './notifications.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { DomainEvent } from '../../infrastructure/events/domain-event';
import { DOMAIN_EVENTS } from '../../infrastructure/events/domain-events.constants';
import { PushService } from '../../infrastructure/push/push.service';
import { SmsService } from '../../infrastructure/sms/sms.service';
import { EmailService } from '../../infrastructure/notification/services/email.service';
import { NotificationType } from '@prisma/client';

interface DeliveryParams {
  recipientUserId?: string;
  recipientDbId: number;
  tenantId: number;
  type: string;
  category: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
  channels: string[];
  recipientEmail?: string;
  recipientPhone?: string;
  playSound?: boolean;
  flashTab?: boolean;
  showBrowserNotification?: boolean;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly inAppService: InAppNotificationService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
  ) {}

  async deliver(params: DeliveryParams) {
    const results: Record<string, boolean> = {};

    // Always deliver in-app
    if (params.channels.includes('in_app')) {
      try {
        const notification = await this.inAppService.create({
          recipientId: params.recipientDbId,
          tenantId: params.tenantId,
          type: params.type as NotificationType,
          category: params.category,
          title: params.title,
          message: params.message,
          actionUrl: params.actionUrl,
          actionLabel: params.actionLabel,
          iconType: params.iconType,
          metadata: params.metadata,
        });

        // Emit NOTIFICATION_SENT — bridge fans out SSE delivery to the
        // recipient via emitToUser. Email and push (below) are independent
        // channels and remain direct calls.
        if (params.recipientUserId) {
          this.eventEmitter.emit(
            DOMAIN_EVENTS.NOTIFICATION_SENT,
            new DomainEvent(DOMAIN_EVENTS.NOTIFICATION_SENT, String(params.tenantId), {
              notificationId: notification.notificationId,
              type: params.type,
              category: params.category,
              title: params.title,
              message: params.message,
              actionUrl: params.actionUrl,
              actionLabel: params.actionLabel,
              playSound: params.playSound ?? true,
              flashTab: params.flashTab ?? false,
              showBrowserNotification: params.showBrowserNotification ?? true,
              recipientUserIds: [params.recipientUserId],
            }),
          );
        }

        results.in_app = true;
      } catch (error: any) {
        this.logger.error(`In-app delivery failed: ${error.message}`);
        results.in_app = false;
      }
    }

    // Email delivery
    if (params.channels.includes('email') && params.recipientEmail) {
      try {
        await this.emailService.sendEmail({
          to: params.recipientEmail,
          subject: params.title,
          html: `<h2>${params.title}</h2><p>${params.message}</p>${
            params.actionUrl ? `<p><a href="${params.actionUrl}">${params.actionLabel || 'View Details'}</a></p>` : ''
          }`,
          text: `${params.title}\n\n${params.message}`,
        });
        results.email = true;
      } catch (error: any) {
        this.logger.error(`Email delivery failed: ${error.message}`);
        results.email = false;
      }
    }

    // Push notification
    if (params.channels.includes('push')) {
      try {
        await this.pushService.sendPushToUser(params.recipientDbId, {
          title: params.title,
          body: params.message,
          url: params.actionUrl,
          tag: params.type,
        });
        results.push = true;
      } catch (error: any) {
        this.logger.error(`Push delivery failed: ${error.message}`);
        results.push = false;
      }
    }

    // SMS delivery
    if (params.channels.includes('sms') && params.recipientPhone) {
      try {
        const sent = await this.smsService.sendSms(params.recipientPhone, `${params.title}: ${params.message}`);
        results.sms = sent;
      } catch (error: any) {
        this.logger.error(`SMS delivery failed: ${error.message}`);
        results.sms = false;
      }
    }

    this.logger.log(
      `Notification delivered to user ${params.recipientUserId ?? params.recipientDbId}: ${JSON.stringify(results)}`,
    );

    return results;
  }
}
