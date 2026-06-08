import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { LoadsModule } from '../../fleet/loads/loads.module';
import { PaymentsModule } from '../payments/payments.module';
import { InAppNotificationsModule } from '../../../domains/operations/notifications/notifications.module';
import { InvoicingController } from './controllers/invoicing.controller';
import { InvoicePublicController } from './controllers/invoice-public.controller';
import { ProfitabilityController } from './controllers/profitability.controller';
import { InvoicingService } from './services/invoicing.service';
import { ProfitabilityService } from './services/profitability.service';
import { InvoiceSettingsService } from './services/invoice-settings.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { InvoiceEmailService } from './services/invoice-email.service';
import { InvoiceShareService } from './services/invoice-share.service';
import { FactoringService } from './services/factoring.service';
import { FactoringContactsService } from './services/factoring-contacts.service';
import { NoaService } from './services/noa.service';
import { DocBundleService } from './services/doc-bundle.service';
import { NoaFactorChangeSubscriber } from './services/noa-factor-change.subscriber';

@Module({
  imports: [
    PrismaModule,
    CacheModule,
    StorageModule,
    forwardRef(() => LoadsModule),
    PaymentsModule,
    InAppNotificationsModule,
  ],
  controllers: [InvoicingController, InvoicePublicController, ProfitabilityController],
  providers: [
    InvoicingService,
    ProfitabilityService,
    InvoiceSettingsService,
    InvoicePdfService,
    InvoiceEmailService,
    InvoiceShareService,
    FactoringService,
    FactoringContactsService,
    NoaService,
    DocBundleService,
    NoaFactorChangeSubscriber,
  ],
  exports: [
    InvoicingService,
    ProfitabilityService,
    InvoiceSettingsService,
    InvoicePdfService,
    InvoiceEmailService,
    InvoiceShareService,
    FactoringService,
    FactoringContactsService,
    NoaService,
    DocBundleService,
  ],
})
export class InvoicingModule {}
