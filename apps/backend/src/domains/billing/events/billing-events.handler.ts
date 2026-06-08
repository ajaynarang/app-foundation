/**
 * Billing Events Handler
 *
 * Central event router that receives NormalizedBillingEvent from webhooks
 * and dispatches to the appropriate service handler.
 *
 * This decouples webhook processing from business logic, making it easy
 * to add new event handlers without modifying the webhook controller.
 */
import { Injectable, Logger } from '@nestjs/common';
import { NormalizedBillingEvent, BillingEventType } from '../adapters/payment-provider.interface';
import { SubscriptionService } from '../services/subscription.service';
import { InvoiceService } from '../services/invoice.service';
import { DunningService } from '../services/dunning.service';
import { PaymentMethodService } from '../services/payment-method.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

@Injectable()
export class BillingEventsHandler {
  private readonly logger = new Logger(BillingEventsHandler.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly invoiceService: InvoiceService,
    private readonly dunningService: DunningService,
    private readonly paymentMethodService: PaymentMethodService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Route a normalized billing event to the appropriate service handler.
   * Each event type may trigger multiple handlers (e.g. payment success
   * triggers both dunning recovery and invoice sync).
   */
  async handleEvent(event: NormalizedBillingEvent): Promise<void> {
    // Idempotency check — skip if this event has already been processed
    try {
      await this.prisma.processedBillingEvent.create({
        data: {
          providerEventId: event.providerEventId,
          eventType: event.type,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        // Unique constraint violation — duplicate event
        this.logger.log(`Duplicate webhook event ${event.providerEventId}, skipping`);
        return;
      }
      throw error;
    }

    this.logger.log(`Processing billing event: ${event.type} (${event.providerEventId})`);

    try {
      switch (event.type) {
        case BillingEventType.PAYMENT_SUCCEEDED:
          await Promise.all([
            this.dunningService.handlePaymentSucceeded(event),
            this.invoiceService.syncInvoice(event),
          ]);
          break;

        case BillingEventType.PAYMENT_FAILED:
          await this.dunningService.handlePaymentFailed(event);
          break;

        case BillingEventType.SUBSCRIPTION_CREATED:
          await this.subscriptionService.handleSubscriptionCreated(event);
          break;

        case BillingEventType.SUBSCRIPTION_UPDATED:
          await this.subscriptionService.handleSubscriptionUpdated(event);
          break;

        case BillingEventType.SUBSCRIPTION_CANCELED:
          await this.subscriptionService.handleSubscriptionCanceled(event);
          break;

        case BillingEventType.INVOICE_CREATED:
        case BillingEventType.INVOICE_PAID:
          await this.invoiceService.syncInvoice(event);
          break;

        case BillingEventType.INVOICE_PAYMENT_FAILED:
          await this.dunningService.handlePaymentFailed(event);
          break;

        case BillingEventType.CHECKOUT_SESSION_COMPLETED: {
          const session = event.data;
          const subscription = session.subscription as string;
          const customer = session.customer as string;
          if (subscription && customer) {
            // Fetch subscription details from Stripe to get plan, quantity, period
            await this.subscriptionService.handleCheckoutSessionCompleted(customer, subscription);
          }
          break;
        }

        case BillingEventType.PAYMENT_METHOD_ATTACHED:
        case BillingEventType.PAYMENT_METHOD_DETACHED: {
          // The event data contains the customer ID for syncing
          const customerId = event.data.customer as string;
          if (customerId) {
            await this.paymentMethodService.syncPaymentMethodsByCustomerId(customerId);
          }
          break;
        }

        default:
          this.logger.debug(`Unhandled billing event type: ${String(event.type)}`);
      }

      this.logger.log(`Billing event processed: ${event.type} (${event.providerEventId})`);
    } catch (error) {
      this.logger.error(`Failed to process billing event ${event.type}: ${error}`, (error as Error).stack);
      // Re-throw to let the webhook controller return an error to the provider
      // so it can retry the webhook
      throw error;
    }
  }
}
