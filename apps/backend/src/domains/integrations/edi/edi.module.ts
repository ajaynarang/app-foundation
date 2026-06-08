import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PlansModule } from '../../platform/plans/plans.module';
import { AddOnsModule } from '../../platform/add-ons/add-ons.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';

import { SPSCommerceAdapter } from './adapters/sps-commerce.adapter';
import { EDI_ADAPTER } from './adapters/edi-adapter.interface';
import { EDIPartnerService } from './services/edi-partner.service';
import { EDIMessageService } from './services/edi-message.service';
import { TenderService } from './tender/tender.service';
import { TenderRulesService } from './tender/tender-rules.service';
import { TenderExpiryJobHandler } from './tender/tender-expiry.processor';
import { EDITrackingSubscriber } from './outbound/edi-tracking.subscriber';
import { EDIInvoicingSubscriber } from './outbound/edi-invoicing.subscriber';
import { EDIWebhookController } from './controllers/edi-webhook.controller';
import { EDITenderController } from './controllers/edi-tender.controller';
import { EDISettingsController } from './controllers/edi-settings.controller';

@Module({
  imports: [PrismaModule, PlansModule, AddOnsModule, QueueModule],
  controllers: [EDIWebhookController, EDITenderController, EDISettingsController],
  providers: [
    SPSCommerceAdapter,
    { provide: EDI_ADAPTER, useClass: SPSCommerceAdapter },
    EDIPartnerService,
    EDIMessageService,
    TenderService,
    TenderRulesService,
    TenderExpiryJobHandler,
    EDITrackingSubscriber,
    EDIInvoicingSubscriber,
  ],
  exports: [EDIPartnerService, EDIMessageService, TenderService, TenderRulesService, TenderExpiryJobHandler],
})
export class EDIModule {}
