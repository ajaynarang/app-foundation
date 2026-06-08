/**
 * Payment Provider Adapter Interface
 *
 * Defines a normalized interface for interacting with payment providers (Stripe, etc.).
 * All provider-specific logic is encapsulated in adapter implementations.
 * The billing domain services use this interface exclusively.
 */

/** Normalized event types that all providers map to */
export enum BillingEventType {
  PAYMENT_SUCCEEDED = 'payment.succeeded',
  PAYMENT_FAILED = 'payment.failed',
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  SUBSCRIPTION_CANCELED = 'subscription.canceled',
  INVOICE_CREATED = 'invoice.created',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
  PAYMENT_METHOD_ATTACHED = 'payment_method.attached',
  PAYMENT_METHOD_DETACHED = 'payment_method.detached',
  CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed',
}

export interface NormalizedBillingEvent {
  type: BillingEventType;
  providerEventId: string;
  data: Record<string, any>;
}

// ─── Param types ─────────────────────────────────────────────────────────────

export interface CreateCustomerParams {
  email: string;
  name: string;
  metadata?: Record<string, string>;
}

export interface CreateSubscriptionParams {
  providerCustomerId: string;
  priceId: string;
  quantity: number;
  metadata?: Record<string, string>;
  addOnPriceIds?: string[];
  /** Override Stripe payment_behavior. */
  paymentBehavior?: 'default_incomplete' | 'allow_incomplete';
  /** Use 'send_invoice' for admin-provisioned subs where no payment method exists. */
  collectionMethod?: 'charge_automatically' | 'send_invoice';
  /** Days until the invoice is due (only for send_invoice). Defaults to 30. */
  daysUntilDue?: number;
}

export interface UpdateSubscriptionParams {
  priceId?: string;
  quantity?: number;
  addOnPriceIds?: { add?: string[]; remove?: string[] };
  cancelAtPeriodEnd?: boolean;
  prorationBehavior?: 'create_prorations' | 'none' | 'always_invoice';
}

export interface CheckoutSessionParams {
  providerCustomerId: string;
  priceId: string;
  quantity: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface OneTimeChargeParams {
  providerCustomerId: string;
  amountCents: number;
  description: string;
  metadata?: Record<string, string>;
}

export interface PaginationOpts {
  limit?: number;
  startingAfter?: string;
}

// ─── Return types ────────────────────────────────────────────────────────────

export interface PaymentMethodInfo {
  providerPaymentMethodId: string;
  type: 'card' | 'us_bank_account';
  last4: string;
  brand: string;
  expMonth: number;
  expYear: number;
}

export interface InvoiceInfo {
  providerInvoiceId: string;
  status: string;
  amountDueCents: number;
  amountPaidCents: number;
  taxCents: number;
  periodStart: Date;
  periodEnd: Date;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    priceId?: string;
  }>;
  pdfUrl?: string;
  hostedInvoiceUrl?: string;
  paidAt?: Date;
}

export interface SubscriptionInfo {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: string;
  priceId: string | null;
  quantity: number;
  unitPriceCents: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}

export interface InvoicePreview {
  amountDueCents: number;
  taxCents: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
    priceId?: string;
  }>;
  periodStart: Date;
  periodEnd: Date;
}

// ─── The adapter interface ───────────────────────────────────────────────────

export interface PaymentProviderAdapter {
  // Customer
  createCustomer(params: CreateCustomerParams): Promise<string>;
  updateCustomer(providerCustomerId: string, params: Partial<CreateCustomerParams>): Promise<void>;
  deleteCustomer(providerCustomerId: string): Promise<void>;

  // Subscription
  getSubscription(providerSubscriptionId: string): Promise<SubscriptionInfo>;
  createSubscription(params: CreateSubscriptionParams): Promise<string>;
  updateSubscription(providerSubscriptionId: string, params: UpdateSubscriptionParams): Promise<void>;
  cancelSubscription(providerSubscriptionId: string, opts: { atPeriodEnd: boolean }): Promise<void>;
  reactivateSubscription(providerSubscriptionId: string): Promise<void>;

  // Payment
  createCheckoutSession(params: CheckoutSessionParams): Promise<string>;
  chargeOneTime(params: OneTimeChargeParams): Promise<string>;
  refund(providerPaymentId: string, amountCents?: number, reason?: string): Promise<string>;

  // Payment Methods
  createSetupSession(providerCustomerId: string, returnUrl: string): Promise<string>;
  listPaymentMethods(providerCustomerId: string): Promise<PaymentMethodInfo[]>;
  setDefaultPaymentMethod(providerCustomerId: string, providerMethodId: string): Promise<void>;
  deletePaymentMethod(providerMethodId: string): Promise<void>;

  // Invoices
  listInvoices(providerCustomerId: string, opts?: PaginationOpts): Promise<InvoiceInfo[]>;
  getUpcomingInvoice(providerCustomerId: string): Promise<InvoicePreview>;

  // Subscription Items (add-ons)
  addSubscriptionItem(providerSubscriptionId: string, priceId: string): Promise<string>; // returns providerSubscriptionItemId
  removeSubscriptionItem(providerSubscriptionItemId: string, cancelAtPeriodEnd?: boolean): Promise<void>;

  // Webhooks
  verifyWebhookSignature(payload: Buffer, signature: string): boolean;
  parseWebhookEvent(payload: Buffer, signature: string): NormalizedBillingEvent;
}

export const PAYMENT_PROVIDER_ADAPTER = Symbol('PAYMENT_PROVIDER_ADAPTER');
