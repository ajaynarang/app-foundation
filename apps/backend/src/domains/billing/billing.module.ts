/**
 * Billing Module
 *
 * Registers all billing domain services, controllers, and adapters.
 * Exports SubscriptionService and WalletService for use by other modules.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { CacheModule } from '../../platform-glue/cache/cache.module';
import { PlansModule } from '@appshore/platform/domains/plans/plans.module';

// Config
import stripeConfig from './adapters/stripe/stripe.config';

// Adapters
import { StripeAdapter } from './adapters/stripe/stripe.adapter';
import { PaymentProviderFactory } from './adapters/payment-provider.factory';

// Services
import { SubscriptionService } from './services/subscription.service';
import { WalletService } from './services/wallet.service';
import { InvoiceService } from './services/invoice.service';
import { PaymentMethodService } from './services/payment-method.service';
import { DunningService } from './services/dunning.service';
import { BillingAdminService } from './services/billing-admin.service';

// Events
import { BillingEventsHandler } from './events/billing-events.handler';

// Controllers
import { BillingController } from './controllers/billing.controller';
import { BillingAdminController } from './controllers/billing-admin.controller';
import { WebhookController } from './controllers/webhook.controller';

@Module({
  imports: [PrismaModule, CacheModule, PlansModule, ConfigModule.forFeature(stripeConfig)],
  controllers: [BillingController, BillingAdminController, WebhookController],
  providers: [
    // Adapters
    StripeAdapter,
    PaymentProviderFactory,

    // Services
    SubscriptionService,
    WalletService,
    InvoiceService,
    PaymentMethodService,
    DunningService,
    BillingAdminService,

    // Events
    BillingEventsHandler,
  ],
  exports: [SubscriptionService, WalletService],
})
export class BillingModule {}
