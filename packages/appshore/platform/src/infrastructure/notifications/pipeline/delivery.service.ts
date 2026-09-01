import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InAppChannelService } from '../channels/in-app/in-app-channel.service';
import { PrismaService } from '../../database/prisma.service';
import { DomainEvent } from '@appshore/kernel/infrastructure/events/domain-event';
import { FOUNDATION_DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import { PushService } from '../channels/push/web-push.service';
import { SmsService } from '@appshore/kernel/infrastructure/sms/sms.service';
import { EmailService } from '../../notification/services/email.service';
import { DeliveryChannel, NotificationType } from '@appshore/db';
import { escapeHtml } from '@appshore/kernel/shared/utils/escape-html';
import { isTestMarker } from '@appshore/kernel/shared/utils/test-marker.util';
import { FcmService } from '../channels/push/fcm.service';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import {
  DELIVERY_SKIP_REASONS,
  failed,
  queued,
  sent,
  skipped,
  type ChannelOutcome,
  type DeliverySkipReason,
} from './delivery-outcome';
import { WHATSAPP_PORT, type WhatsAppPort } from '../channels/whatsapp/whatsapp.port';
import {
  WhatsAppTemplateRegistry,
  type WhatsAppTemplateSendSpec,
} from '../channels/whatsapp/whatsapp-template.registry';

export interface DeliveryChannelPlan {
  /** Attempt now, in this order. */
  primary: DeliveryChannel[];
  /** Attempt only if no primary channel reached the recipient. */
  fallback: DeliveryChannel[];
  /** Not attempted; recorded as SKIPPED with the reason so the ledger explains the gap. */
  suppressed: Partial<Record<DeliveryChannel, DeliverySkipReason>>;
}

interface DeliveryParams {
  recipientUserId?: string;
  recipientDbId: number;
  tenantId: number;
  /** The tenant's public STRING id, for the push payload. Resolved once per trigger. */
  tenantSlug?: string;
  type: string;
  category: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
  /** Same-type notifications inside one window collapse into one in-app row per scope (a tournament, say). */
  groupScope?: string;
  channels: DeliveryChannelPlan;
  recipientEmail?: string;
  recipientPhone?: string;
  playSound?: boolean;
  flashTab?: boolean;
  showBrowserNotification?: boolean;
  /** The platform flag, resolved once per trigger. Absent = off. */
  whatsappEnabled?: boolean;
  /** The club's plan includes WhatsApp, resolved once per trigger. Absent = no. */
  whatsappEntitled?: boolean;
  /** Closes every WhatsApp template — all clubs share the one the platform number. */
  clubName?: string;
}

export interface PendingWhatsAppSend {
  deliveryId: string;
  userId: number;
  send: WhatsAppTemplateSendSpec;
}

export interface DeliveryReport {
  /** Per channel that was actually tried: did it reach anyone. Absent = not tried. */
  results: Partial<Record<DeliveryChannel, boolean>>;
  /** One entry per planned channel, tried or not — what the ledger records. */
  outcomes: ChannelOutcome[];
  /** WhatsApp is sent from the queue, after the ledger row exists. */
  pendingSends: PendingWhatsAppSend[];
}

/** Mutable per-delivery state each channel method writes into. */
interface DeliveryRun extends DeliveryReport {
  params: DeliveryParams;
}

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly inAppService: InAppChannelService,
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly pushService: PushService,
    private readonly fcmService: FcmService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    @Inject(WHATSAPP_PORT) private readonly whatsapp: WhatsAppPort,
    private readonly templates: WhatsAppTemplateRegistry,
  ) {}

  async deliver(params: DeliveryParams): Promise<DeliveryReport> {
    const run: DeliveryRun = { params, results: {}, outcomes: [], pendingSends: [] };
    const { primary, fallback, suppressed } = params.channels;

    // A test-marker string is dev/QA junk on an internal trigger (E57-5). Drop it across
    // EVERY channel so no demo-facing surface ever carries it. Fire-and-forget, so log rather than throw.
    if (isTestMarker(params.title) || isTestMarker(params.message)) {
      this.logger.warn(`Dropped a ${params.type} delivery with a test-marker string`);
      for (const channel of [...primary, ...fallback, ...Object.keys(suppressed)] as DeliveryChannel[]) {
        run.outcomes.push(skipped(channel, DELIVERY_SKIP_REASONS.DROPPED_TEST_MARKER));
      }
      return this.report(run);
    }

    for (const [channel, reason] of Object.entries(suppressed) as [DeliveryChannel, DeliverySkipReason][]) {
      run.outcomes.push(skipped(channel, reason));
    }

    for (const channel of primary) {
      await this.send(channel, run);
    }

    // A fallback exists to replace a push that never landed, not to duplicate one
    // that did. Queued WhatsApp counts as reached: it is the cheaper channel and
    // the one people here actually read.
    const reached = run.results[DeliveryChannel.PUSH] === true || run.results[DeliveryChannel.WHATSAPP] === true;
    for (const channel of fallback) {
      if (reached) {
        run.outcomes.push(skipped(channel, DELIVERY_SKIP_REASONS.PRIMARY_REACHED));
      } else {
        await this.send(channel, run);
      }
    }

    return this.report(run);
  }

  private report(run: DeliveryRun): DeliveryReport {
    const { params, results, outcomes, pendingSends } = run;
    this.logger.log(
      `Notification delivered to user ${params.recipientUserId ?? params.recipientDbId}: ${JSON.stringify(results)}`,
    );
    return { results, outcomes, pendingSends };
  }

  private async send(channel: DeliveryChannel, run: DeliveryRun): Promise<void> {
    switch (channel) {
      case DeliveryChannel.IN_APP:
        return this.sendInApp(run);
      case DeliveryChannel.EMAIL:
        return this.sendEmail(run);
      case DeliveryChannel.PUSH:
        return this.sendPush(run);
      case DeliveryChannel.SMS:
        return this.sendSms(run);
      case DeliveryChannel.WHATSAPP:
        return this.planWhatsApp(run);
    }
  }

  private async sendInApp(run: DeliveryRun): Promise<void> {
    const { params } = run;
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
        groupScope: params.groupScope,
      });

      // A null result means the in-app service DROPPED the notification (E57-5: a
      // test-marker string). Nothing was persisted, so there is nothing to fan out.
      if (notification && params.recipientUserId) {
        // NOTIFICATION_SENT is what the SSE bridge fans out to the recipient.
        this.eventEmitter.emit(
          FOUNDATION_DOMAIN_EVENTS.NOTIFICATION_SENT,
          new DomainEvent(FOUNDATION_DOMAIN_EVENTS.NOTIFICATION_SENT, String(params.tenantId), {
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

      run.results[DeliveryChannel.IN_APP] = notification !== null;
      run.outcomes.push(
        notification !== null
          ? sent(DeliveryChannel.IN_APP)
          : skipped(DeliveryChannel.IN_APP, DELIVERY_SKIP_REASONS.DROPPED_TEST_MARKER),
      );
    } catch (error: any) {
      this.logger.error(`In-app delivery failed: ${error.message}`);
      run.results[DeliveryChannel.IN_APP] = false;
      run.outcomes.push(failed(DeliveryChannel.IN_APP, DELIVERY_SKIP_REASONS.PROVIDER_ERROR));
    }
  }

  private async sendEmail(run: DeliveryRun): Promise<void> {
    const { params } = run;
    if (!params.recipientEmail) {
      run.outcomes.push(skipped(DeliveryChannel.EMAIL, DELIVERY_SKIP_REASONS.NO_ADDRESS));
      return;
    }
    try {
      await this.emailService.sendEmail({
        to: params.recipientEmail,
        subject: params.title,
        html: `<h2>${escapeHtml(params.title)}</h2><p>${escapeHtml(params.message)}</p>${
          params.actionUrl
            ? `<p><a href="${escapeHtml(params.actionUrl)}">${escapeHtml(params.actionLabel || 'View Details')}</a></p>`
            : ''
        }`,
        text: `${params.title}\n\n${params.message}`,
      });
      run.results[DeliveryChannel.EMAIL] = true;
      run.outcomes.push(sent(DeliveryChannel.EMAIL));
    } catch (error: any) {
      this.logger.error(`Email delivery failed: ${error.message}`);
      run.results[DeliveryChannel.EMAIL] = false;
      run.outcomes.push(failed(DeliveryChannel.EMAIL, DELIVERY_SKIP_REASONS.PROVIDER_ERROR));
    }
  }

  /** Web push (VAPID) + mobile push (FCM). Each transport no-ops when unconfigured; one failing must not block the other. */
  private async sendPush(run: DeliveryRun): Promise<void> {
    const { params } = run;
    const [webResult, fcmResult] = await Promise.allSettled([
      this.pushService.sendPushToUser(params.recipientDbId, {
        title: params.title,
        body: params.message,
        url: params.actionUrl,
        tag: params.type,
      }),
      this.fcmService.sendToUser(params.recipientDbId, {
        title: params.title,
        body: params.message,
        data: {
          type: params.type,
          ...(params.actionUrl ? { actionUrl: params.actionUrl } : {}),
          // The STRING tenant id the mobile session identifies its workspace by;
          // without it a push from a second club deep-links into a screen the
          // session cannot load. Absent → the client routes it as it always did.
          ...(params.tenantSlug ? { tenantId: params.tenantSlug } : {}),
        },
      }),
    ]);
    for (const settled of [webResult, fcmResult]) {
      if (settled.status === 'rejected') {
        this.logger.error(`Push delivery failed: ${(settled.reason as Error)?.message}`);
      }
    }
    // A user with no registered device reached nobody. Reporting that as a
    // success is what let the iOS dead-push window stay invisible.
    const reached = [webResult, fcmResult].reduce(
      (sum, settled) => sum + (settled.status === 'fulfilled' ? (settled.value ?? 0) : 0),
      0,
    );
    run.results[DeliveryChannel.PUSH] = reached > 0;
    run.outcomes.push(
      reached > 0 ? sent(DeliveryChannel.PUSH) : failed(DeliveryChannel.PUSH, DELIVERY_SKIP_REASONS.NO_DEVICE),
    );
  }

  private async sendSms(run: DeliveryRun): Promise<void> {
    const { params } = run;
    if (!params.recipientPhone) {
      run.outcomes.push(skipped(DeliveryChannel.SMS, DELIVERY_SKIP_REASONS.NO_ADDRESS));
      return;
    }
    if (!this.smsService.getIsConfigured()) {
      // sendSms() returns false here too, but "no Twilio on this box" is not a provider error.
      run.outcomes.push(skipped(DeliveryChannel.SMS, DELIVERY_SKIP_REASONS.NOT_CONFIGURED));
      return;
    }
    try {
      const wasSent = await this.smsService.sendSms(params.recipientPhone, `${params.title}: ${params.message}`);
      run.results[DeliveryChannel.SMS] = wasSent;
      run.outcomes.push(
        wasSent ? sent(DeliveryChannel.SMS) : failed(DeliveryChannel.SMS, DELIVERY_SKIP_REASONS.PROVIDER_ERROR),
      );
    } catch (error: any) {
      this.logger.error(`SMS delivery failed: ${error.message}`);
      run.results[DeliveryChannel.SMS] = false;
      run.outcomes.push(failed(DeliveryChannel.SMS, DELIVERY_SKIP_REASONS.PROVIDER_ERROR));
    }
  }

  /** Nothing is sent here: the row is born QUEUED with the id the job will carry, and the trigger enqueues once the ledger write has landed. */
  private planWhatsApp(run: DeliveryRun): void {
    const { params } = run;
    if (!params.recipientPhone) {
      run.outcomes.push(skipped(DeliveryChannel.WHATSAPP, DELIVERY_SKIP_REASONS.NO_ADDRESS));
      return;
    }
    if (!params.whatsappEnabled) {
      run.outcomes.push(skipped(DeliveryChannel.WHATSAPP, DELIVERY_SKIP_REASONS.FLAG_OFF));
      return;
    }
    if (!params.whatsappEntitled) {
      run.outcomes.push(skipped(DeliveryChannel.WHATSAPP, DELIVERY_SKIP_REASONS.NOT_ENTITLED));
      return;
    }
    if (!this.whatsapp.isConfigured) {
      run.outcomes.push(skipped(DeliveryChannel.WHATSAPP, DELIVERY_SKIP_REASONS.NOT_CONFIGURED));
      return;
    }
    const send = this.templates.resolve(params.type as NotificationType, {
      title: params.title,
      message: params.message,
      metadata: params.metadata,
      clubName: params.clubName ?? '',
    });
    if (!send) {
      run.outcomes.push(skipped(DeliveryChannel.WHATSAPP, DELIVERY_SKIP_REASONS.NO_TEMPLATE));
      return;
    }
    const deliveryId = generateUuidV7();
    run.outcomes.push(queued(DeliveryChannel.WHATSAPP, deliveryId));
    run.pendingSends.push({ deliveryId, userId: params.recipientDbId, send });
    // Queued counts as reached: the trigger's nobody-reached guard exists to
    // release reminder claims, and a queued message is not a failure.
    run.results[DeliveryChannel.WHATSAPP] = true;
  }
}
