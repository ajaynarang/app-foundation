/**
 * Stripe Payment Provider Adapter
 *
 * Implements PaymentProviderAdapter using the Stripe SDK.
 * All Stripe-specific logic is encapsulated here.
 *
 * DEPENDENCY: requires `stripe` npm package (npm install stripe)
 */
import { BadRequestException, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  PaymentProviderAdapter,
  CreateCustomerParams,
  CreateSubscriptionParams,
  UpdateSubscriptionParams,
  CheckoutSessionParams,
  OneTimeChargeParams,
  PaginationOpts,
  PaymentMethodInfo,
  InvoiceInfo,
  InvoicePreview,
  SubscriptionInfo,
  NormalizedBillingEvent,
  BillingEventType,
} from '../payment-provider.interface';
import { mapStripeEventType } from './stripe-webhook.handler';

@Injectable()
export class StripeAdapter implements PaymentProviderAdapter {
  private readonly logger = new Logger(StripeAdapter.name);
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('stripe.secretKey', '');
    this.webhookSecret = this.configService.get<string>('stripe.webhookSecret', '');

    if (!secretKey) {
      this.logger.warn('Stripe not configured — STRIPE_SECRET_KEY missing. Billing operations will fail.');
      this.stripe = null;
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2025-02-24.acacia',
        typescript: true,
      });
    }
  }

  private getStripe(): Stripe {
    if (!this.stripe) {
      throw new InternalServerErrorException('Stripe is not configured — STRIPE_SECRET_KEY is missing');
    }
    return this.stripe;
  }

  // ─── Customer ────────────────────────────────────────────────────────────

  /** Create a Stripe customer and return the provider customer ID */
  async createCustomer(params: CreateCustomerParams): Promise<string> {
    const customer = await this.getStripe().customers.create({
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    });
    this.logger.log(`Stripe customer created: ${customer.id}`);
    return customer.id;
  }

  /** Update a Stripe customer's details */
  async updateCustomer(providerCustomerId: string, params: Partial<CreateCustomerParams>): Promise<void> {
    await this.getStripe().customers.update(providerCustomerId, {
      ...(params.email && { email: params.email }),
      ...(params.name && { name: params.name }),
      ...(params.metadata && { metadata: params.metadata }),
    });
  }

  /** Delete a Stripe customer (marks as deleted in Stripe) */
  async deleteCustomer(providerCustomerId: string): Promise<void> {
    await this.getStripe().customers.del(providerCustomerId);
    this.logger.log(`Stripe customer deleted: ${providerCustomerId}`);
  }

  // ─── Subscription ────────────────────────────────────────────────────────

  /** Retrieve a subscription from Stripe */
  async getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo> {
    const sub = await this.getStripe().subscriptions.retrieve(providerSubscriptionId);
    const primaryItem = sub.items.data[0];
    return {
      providerSubscriptionId: sub.id,
      providerCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      status: sub.status,
      priceId: primaryItem?.price?.id ?? null,
      quantity: primaryItem?.quantity ?? 1,
      unitPriceCents: primaryItem?.price?.unit_amount ?? 0,
      currentPeriodStart: new Date(sub.current_period_start * 1000),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      metadata: (sub.metadata as Record<string, string>) ?? {},
    };
  }

  /** Create a subscription and return the provider subscription ID */
  async createSubscription(params: CreateSubscriptionParams): Promise<string> {
    const items: Stripe.SubscriptionCreateParams.Item[] = [{ price: params.priceId, quantity: params.quantity }];

    // Add add-on subscription items if provided
    if (params.addOnPriceIds?.length) {
      for (const priceId of params.addOnPriceIds) {
        items.push({ price: priceId });
      }
    }

    const createParams: Stripe.SubscriptionCreateParams = {
      customer: params.providerCustomerId,
      items,
      metadata: params.metadata,
      payment_behavior: params.paymentBehavior ?? 'default_incomplete',
      proration_behavior: 'create_prorations',
    };

    if (params.collectionMethod === 'send_invoice') {
      createParams.collection_method = 'send_invoice';
      createParams.days_until_due = params.daysUntilDue ?? 30;
    }

    const subscription = await this.getStripe().subscriptions.create(createParams);

    this.logger.log(`Stripe subscription created: ${subscription.id}`);
    return subscription.id;
  }

  /** Update an existing subscription (plan change, quantity change, etc.) */
  async updateSubscription(providerSubscriptionId: string, params: UpdateSubscriptionParams): Promise<void> {
    const subscription = await this.getStripe().subscriptions.retrieve(providerSubscriptionId);

    const updateParams: Stripe.SubscriptionUpdateParams = {
      proration_behavior: params.prorationBehavior ?? 'create_prorations',
    };

    // Update price/quantity on the primary subscription item
    if (params.priceId || params.quantity !== undefined) {
      const primaryItem = subscription.items.data[0];
      if (primaryItem) {
        updateParams.items = [
          {
            id: primaryItem.id,
            ...(params.priceId && { price: params.priceId }),
            ...(params.quantity !== undefined && {
              quantity: params.quantity,
            }),
          },
        ];
      }
    }

    if (params.cancelAtPeriodEnd !== undefined) {
      updateParams.cancel_at_period_end = params.cancelAtPeriodEnd;
    }

    // Handle add-on price changes
    if (params.addOnPriceIds) {
      const items = updateParams.items ?? [];

      if (params.addOnPriceIds.add?.length) {
        for (const priceId of params.addOnPriceIds.add) {
          items.push({ price: priceId });
        }
      }

      if (params.addOnPriceIds.remove?.length) {
        for (const item of subscription.items.data) {
          if (typeof item.price === 'object' && params.addOnPriceIds.remove.includes(item.price.id)) {
            items.push({ id: item.id, deleted: true });
          }
        }
      }

      if (items.length > 0) {
        updateParams.items = items;
      }
    }

    await this.getStripe().subscriptions.update(providerSubscriptionId, updateParams);
    this.logger.log(`Stripe subscription updated: ${providerSubscriptionId}`);
  }

  /** Cancel a subscription (immediately or at period end) */
  async cancelSubscription(providerSubscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void> {
    if (opts.atPeriodEnd) {
      await this.getStripe().subscriptions.update(providerSubscriptionId, {
        cancel_at_period_end: true,
      });
    } else {
      await this.getStripe().subscriptions.cancel(providerSubscriptionId);
    }
    this.logger.log(`Stripe subscription canceled: ${providerSubscriptionId} (atPeriodEnd: ${opts.atPeriodEnd})`);
  }

  /** Reactivate a subscription that was set to cancel at period end */
  async reactivateSubscription(providerSubscriptionId: string): Promise<void> {
    await this.getStripe().subscriptions.update(providerSubscriptionId, {
      cancel_at_period_end: false,
    });
    this.logger.log(`Stripe subscription reactivated: ${providerSubscriptionId}`);
  }

  // ─── Subscription Items (add-ons) ───────────────────────────────────────

  /**
   * Add a subscription item (add-on) to an existing subscription.
   *
   * Idempotent: Stripe rejects `subscriptionItems.create` with a 400 if an item
   * for that price already exists on the subscription. This happens when an
   * add-on is re-activated before its previous (cancel-at-period-end) item has
   * actually been removed, or when our local `stripeSubscriptionItemId` has
   * drifted from Stripe. In that case we reuse the existing item instead of
   * creating a duplicate.
   */
  async addSubscriptionItem(providerSubscriptionId: string, priceId: string): Promise<string> {
    const subscription = await this.getStripe().subscriptions.retrieve(providerSubscriptionId);
    const existingItem = subscription.items.data.find(
      (item) => (typeof item.price === 'string' ? item.price : item.price?.id) === priceId,
    );

    if (existingItem) {
      this.logger.log(
        `Stripe subscription item already exists for price ${priceId} on ${providerSubscriptionId}; reusing ${existingItem.id}`,
      );
      return existingItem.id;
    }

    const item = await this.getStripe().subscriptionItems.create({
      subscription: providerSubscriptionId,
      price: priceId,
      proration_behavior: 'create_prorations',
    });
    this.logger.log(`Stripe subscription item added: ${item.id} to ${providerSubscriptionId}`);
    return item.id;
  }

  /** Remove a subscription item (add-on) from a subscription */
  async removeSubscriptionItem(providerSubscriptionItemId: string, cancelAtPeriodEnd = true): Promise<void> {
    if (cancelAtPeriodEnd) {
      // No proration — they paid for the full period
      await this.getStripe().subscriptionItems.del(providerSubscriptionItemId, {
        proration_behavior: 'none',
      });
    } else {
      await this.getStripe().subscriptionItems.del(providerSubscriptionItemId, {
        proration_behavior: 'create_prorations',
      });
    }
    this.logger.log(
      `Stripe subscription item removed: ${providerSubscriptionItemId} (cancelAtPeriodEnd: ${cancelAtPeriodEnd})`,
    );
  }

  // ─── Payment ─────────────────────────────────────────────────────────────

  /** Create a Checkout Session and return the session URL */
  async createCheckoutSession(params: CheckoutSessionParams): Promise<string> {
    const session = await this.getStripe().checkout.sessions.create({
      customer: params.providerCustomerId,
      mode: 'subscription',
      line_items: [{ price: params.priceId, quantity: params.quantity }],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      metadata: params.metadata,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe session created without URL');
    }
    return session.url;
  }

  /** Create a one-time charge using the customer's default payment method */
  async chargeOneTime(params: OneTimeChargeParams): Promise<string> {
    // Find the customer's default or first available payment method
    const customer = (await this.getStripe().customers.retrieve(params.providerCustomerId)) as Stripe.Customer;

    let paymentMethodId =
      typeof customer.invoice_settings?.default_payment_method === 'string'
        ? customer.invoice_settings.default_payment_method
        : (customer.invoice_settings?.default_payment_method?.id ?? null);

    // If no default, find the first card or any usable payment method
    if (!paymentMethodId) {
      const methods = await this.getStripe().customers.listPaymentMethods(params.providerCustomerId);
      const usable =
        methods.data.find((m) => m.type === 'card') ??
        methods.data.find((m) => m.type === 'us_bank_account') ??
        methods.data[0]; // fallback to any method (including link)
      paymentMethodId = usable?.id ?? null;
    }

    if (!paymentMethodId) {
      throw new BadRequestException('No payment method available. Add a payment method first.');
    }

    const paymentIntent = await this.getStripe().paymentIntents.create({
      customer: params.providerCustomerId,
      payment_method: paymentMethodId,
      amount: params.amountCents,
      currency: 'usd',
      description: params.description,
      metadata: params.metadata,
      off_session: true,
      confirm: true,
    });

    this.logger.log(`Stripe one-time charge: ${paymentIntent.id}`);
    return paymentIntent.id;
  }

  /** Refund a payment (full or partial) */
  async refund(providerPaymentId: string, amountCents?: number, reason?: string): Promise<string> {
    const refund = await this.getStripe().refunds.create({
      payment_intent: providerPaymentId,
      ...(amountCents && { amount: amountCents }),
      ...(reason && {
        reason: reason as Stripe.RefundCreateParams.Reason,
      }),
    });

    this.logger.log(`Stripe refund created: ${refund.id} for payment ${providerPaymentId}`);
    return refund.id;
  }

  // ─── Payment Methods ─────────────────────────────────────────────────────

  /** Create a Setup Session for adding a payment method and return the session URL */
  async createSetupSession(providerCustomerId: string, returnUrl: string): Promise<string> {
    const session = await this.getStripe().checkout.sessions.create({
      customer: providerCustomerId,
      mode: 'setup',
      currency: 'usd',
      success_url: returnUrl,
      cancel_url: returnUrl,
    });

    if (!session.url) {
      throw new InternalServerErrorException('Stripe session created without URL');
    }
    return session.url;
  }

  /** List all payment methods for a customer */
  async listPaymentMethods(providerCustomerId: string): Promise<PaymentMethodInfo[]> {
    // Fetch all payment method types (card, link, us_bank_account)
    const allMethods = await this.getStripe().customers.listPaymentMethods(providerCustomerId);

    const mapped = allMethods.data
      .filter((m) => ['card', 'us_bank_account'].includes(m.type))
      .map((m) => ({
        providerPaymentMethodId: m.id,
        type: m.type === 'card' ? ('card' as const) : ('us_bank_account' as const),
        last4: m.card?.last4 ?? m.us_bank_account?.last4 ?? '0000',
        brand: m.card?.brand ?? m.us_bank_account?.bank_name ?? 'unknown',
        expMonth: m.card?.exp_month ?? 0,
        expYear: m.card?.exp_year ?? 0,
      }));

    // If no card/bank methods, check for Stripe Link (show only the most recent one)
    if (mapped.length === 0) {
      const linkMethod = allMethods.data.find((m) => m.type === 'link');
      if (linkMethod) {
        mapped.push({
          providerPaymentMethodId: linkMethod.id,
          type: 'card' as const,
          last4: linkMethod.link?.email?.slice(-4) ?? '0000',
          brand: 'Stripe Link',
          expMonth: 0,
          expYear: 0,
        });
      }
    }

    return mapped;
  }

  /** Set the default payment method for a customer */
  async setDefaultPaymentMethod(providerCustomerId: string, providerMethodId: string): Promise<void> {
    await this.getStripe().customers.update(providerCustomerId, {
      invoice_settings: {
        default_payment_method: providerMethodId,
      },
    });
  }

  /** Detach a payment method from its customer */
  async deletePaymentMethod(providerMethodId: string): Promise<void> {
    await this.getStripe().paymentMethods.detach(providerMethodId);
    this.logger.log(`Stripe payment method detached: ${providerMethodId}`);
  }

  // ─── Invoices ────────────────────────────────────────────────────────────

  /** List invoices for a customer */
  async listInvoices(providerCustomerId: string, opts?: PaginationOpts): Promise<InvoiceInfo[]> {
    const invoices = await this.getStripe().invoices.list({
      customer: providerCustomerId,
      limit: opts?.limit ?? 20,
      ...(opts?.startingAfter && { starting_after: opts.startingAfter }),
    });

    return invoices.data.map((inv) => this.mapInvoice(inv));
  }

  /** Get the upcoming invoice preview for a customer */
  async getUpcomingInvoice(providerCustomerId: string): Promise<InvoicePreview> {
    const invoice = await this.getStripe().invoices.retrieveUpcoming({
      customer: providerCustomerId,
    });

    return {
      amountDueCents: invoice.amount_due,
      taxCents: invoice.tax ?? 0,
      lineItems: (invoice.lines?.data ?? []).map((li) => ({
        description: li.description ?? '',
        quantity: li.quantity ?? 1,
        unitPriceCents: li.price?.unit_amount ?? 0,
        totalCents: li.amount,
        priceId: li.price?.id,
      })),
      periodStart: new Date((invoice.period_start ?? 0) * 1000),
      periodEnd: new Date((invoice.period_end ?? 0) * 1000),
    };
  }

  // ─── Webhooks ────────────────────────────────────────────────────────────

  /** Verify a webhook signature from Stripe */
  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    try {
      this.getStripe().webhooks.constructEvent(payload, signature, this.webhookSecret);
      return true;
    } catch {
      return false;
    }
  }

  /** Parse and normalize a Stripe webhook event */
  parseWebhookEvent(payload: Buffer, signature: string): NormalizedBillingEvent {
    const event = this.getStripe().webhooks.constructEvent(payload, signature, this.webhookSecret);

    const normalizedType = mapStripeEventType(event.type);
    if (!normalizedType) {
      // Return a generic event for unmapped types
      return {
        type: event.type as unknown as BillingEventType,
        providerEventId: event.id,
        data: event.data.object as Record<string, any>,
      };
    }

    return {
      type: normalizedType,
      providerEventId: event.id,
      data: event.data.object as Record<string, any>,
    };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  private mapInvoice(inv: Stripe.Invoice): InvoiceInfo {
    return {
      providerInvoiceId: inv.id,
      status: inv.status ?? 'draft',
      amountDueCents: inv.amount_due,
      amountPaidCents: inv.amount_paid,
      taxCents: inv.tax ?? 0,
      periodStart: new Date((inv.period_start ?? 0) * 1000),
      periodEnd: new Date((inv.period_end ?? 0) * 1000),
      lineItems: (inv.lines?.data ?? []).map((li) => ({
        description: li.description ?? '',
        quantity: li.quantity ?? 1,
        unitPriceCents: li.price?.unit_amount ?? 0,
        totalCents: li.amount,
        priceId: li.price?.id,
      })),
      pdfUrl: inv.invoice_pdf ?? undefined,
      hostedInvoiceUrl: inv.hosted_invoice_url ?? undefined,
      paidAt: inv.status_transitions?.paid_at ? new Date(inv.status_transitions.paid_at * 1000) : undefined,
    };
  }
}
