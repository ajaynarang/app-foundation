import { Inject, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { jobHandlersToken, type QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { PrismaModule } from '../database/prisma.module';
import { SmsModule } from '../sms/sms.module';
import { FeatureFlagsModule } from '../../domains/feature-flags/feature-flags.module';
import { PlansModule } from '../../domains/plans/plans.module';
import { NotificationPolicyRegistry } from './notification-policy.registry';
import { ChannelResolutionService } from './pipeline/channel-resolution.service';
import { NotificationDeliveryService } from './pipeline/delivery.service';
import { DeliveryLedgerService } from './pipeline/delivery-ledger.service';
import { RecipientResolutionService } from './pipeline/recipient-resolution.service';
import { NotificationDispatcherService } from './pipeline/notification-dispatcher.service';
import { InAppChannelService } from './channels/in-app/in-app-channel.service';
import { FcmService } from './channels/push/fcm.service';
import { NotificationDevicesController } from './channels/push/devices.controller';
import { PushService } from './channels/push/web-push.service';
import { PushSubscriptionController } from './channels/push/push-subscription.controller';
import { WhatsAppTemplateRegistry } from './channels/whatsapp/whatsapp-template.registry';
import { WHATSAPP_PORT, type WhatsAppPort } from './channels/whatsapp/whatsapp.port';
import { createWhatsAppPort } from './channels/whatsapp/whatsapp-port.factory';
import { WhatsAppDispatchService } from './channels/whatsapp/whatsapp-dispatch.service';
import { WhatsAppSendHandler } from './channels/whatsapp/whatsapp-send.handler';
import { WhatsAppStaleSweepHandler } from './channels/whatsapp/whatsapp-stale-sweep.handler';
import { WhatsAppConsentService } from './channels/whatsapp/whatsapp-consent.service';
import { WhatsAppConsentController } from './channels/whatsapp/whatsapp-consent.controller';
import { WhatsAppWebhookController } from './channels/whatsapp/whatsapp-webhook.controller';
import { WhatsAppQueueProcessor } from './channels/whatsapp/whatsapp-queue.processor';
import { NotificationPreferenceOptionsService } from './preferences/notification-preference-options.service';
import { NotificationPreferenceOptionsController } from './preferences/notification-preference-options.controller';
import {
  WHATSAPP_STALE_SWEEP_INTERVAL_MS,
  WHATSAPP_STALE_SWEEP_JOB_NAME,
} from './channels/whatsapp/whatsapp.constants';

/**
 * The channel-agnostic notification pipeline plus every channel the foundation
 * owns: in-app, email, web push, FCM, SMS, WhatsApp. An app binds its policies
 * to NOTIFICATION_POLICIES and its Meta-approved templates to WHATSAPP_TEMPLATES,
 * then calls NotificationDeliveryService from its own triggers.
 *
 * The WhatsApp queue is registered here so the worker travels with the channel;
 * BullMQ's root connection is still the app's to configure.
 */
@Module({
  imports: [
    PrismaModule,
    SmsModule,
    FeatureFlagsModule,
    PlansModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.WHATSAPP }),
  ],
  controllers: [
    NotificationDevicesController,
    NotificationPreferenceOptionsController,
    PushSubscriptionController,
    WhatsAppWebhookController,
    WhatsAppConsentController,
  ],
  providers: [
    NotificationPolicyRegistry,
    NotificationPreferenceOptionsService,
    WhatsAppTemplateRegistry,
    ChannelResolutionService,
    NotificationDeliveryService,
    DeliveryLedgerService,
    RecipientResolutionService,
    NotificationDispatcherService,
    InAppChannelService,
    PushService,
    FcmService,
    { provide: WHATSAPP_PORT, inject: [ConfigService], useFactory: createWhatsAppPort },
    WhatsAppDispatchService,
    WhatsAppSendHandler,
    WhatsAppStaleSweepHandler,
    WhatsAppConsentService,
    WhatsAppQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.WHATSAPP),
      useFactory: (send: WhatsAppSendHandler, sweep: WhatsAppStaleSweepHandler): QueueJobHandler[] => [send, sweep],
      inject: [WhatsAppSendHandler, WhatsAppStaleSweepHandler],
    },
  ],
  exports: [
    NotificationPolicyRegistry,
    NotificationPreferenceOptionsService,
    WhatsAppTemplateRegistry,
    ChannelResolutionService,
    NotificationDeliveryService,
    DeliveryLedgerService,
    RecipientResolutionService,
    NotificationDispatcherService,
    InAppChannelService,
    PushService,
    FcmService,
    WhatsAppDispatchService,
    WhatsAppSendHandler,
    WhatsAppStaleSweepHandler,
    WhatsAppConsentService,
  ],
})
export class PlatformNotificationsModule implements OnModuleInit {
  private readonly logger = new Logger(PlatformNotificationsModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.WHATSAPP) private readonly whatsappQueue: Queue,
    @Inject(WHATSAPP_PORT) private readonly whatsapp: WhatsAppPort,
  ) {}

  async onModuleInit() {
    if (!this.whatsapp.isConfigured) this.logger.warn('WhatsApp channel: not configured');
    const existing = new Set((await this.whatsappQueue.getRepeatableJobs()).map((job) => job.name));
    if (existing.has(WHATSAPP_STALE_SWEEP_JOB_NAME)) return;

    await this.whatsappQueue.add(
      WHATSAPP_STALE_SWEEP_JOB_NAME,
      buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }),
      {
        repeat: { every: WHATSAPP_STALE_SWEEP_INTERVAL_MS },
        jobId: `notifications-${WHATSAPP_STALE_SWEEP_JOB_NAME}`,
        attempts: 1,
        removeOnFail: { age: 86400 },
      },
    );
    this.logger.log(
      `WhatsApp stale-QUEUED sweep scheduled (every ${Math.round(WHATSAPP_STALE_SWEEP_INTERVAL_MS / 60_000)} minutes)`,
    );
  }
}
