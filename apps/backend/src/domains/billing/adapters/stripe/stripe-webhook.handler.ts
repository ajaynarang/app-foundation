/**
 * Stripe Webhook Event Mapping
 *
 * Maps Stripe-specific webhook event types to our normalized BillingEventType.
 * This allows the billing domain to remain provider-agnostic.
 */
import { BillingEventType } from '../payment-provider.interface';

export const STRIPE_EVENT_MAP: Record<string, BillingEventType> = {
  'payment_intent.succeeded': BillingEventType.PAYMENT_SUCCEEDED,
  'payment_intent.payment_failed': BillingEventType.PAYMENT_FAILED,
  'customer.subscription.created': BillingEventType.SUBSCRIPTION_CREATED,
  'customer.subscription.updated': BillingEventType.SUBSCRIPTION_UPDATED,
  'customer.subscription.deleted': BillingEventType.SUBSCRIPTION_CANCELED,
  'invoice.created': BillingEventType.INVOICE_CREATED,
  'invoice.paid': BillingEventType.INVOICE_PAID,
  'invoice.payment_failed': BillingEventType.INVOICE_PAYMENT_FAILED,
  'payment_method.attached': BillingEventType.PAYMENT_METHOD_ATTACHED,
  'payment_method.detached': BillingEventType.PAYMENT_METHOD_DETACHED,
  'checkout.session.completed': BillingEventType.CHECKOUT_SESSION_COMPLETED,
};

/**
 * Convert a Stripe event type string to a normalized BillingEventType.
 * Returns undefined if the event type is not mapped (i.e. we don't care about it).
 */
export function mapStripeEventType(stripeEventType: string): BillingEventType | undefined {
  return STRIPE_EVENT_MAP[stripeEventType];
}
