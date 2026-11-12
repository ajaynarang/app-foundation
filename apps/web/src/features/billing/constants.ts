import { BillingInvoiceStatus, BillingSubscriptionStatus, TenantPlan, WalletTransactionType } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

/**
 * Billing status maps: one label and one tone per enum value. Render with
 * `<StatusBadge tone={v.tone}>{v.label}</StatusBadge>`; never a per-screen colour (ui-grammar-guard.test.ts).
 */
export const INVOICE_STATUS_VARIANTS: Record<BillingInvoiceStatus, StatusVariant> = {
  [BillingInvoiceStatus.DRAFT]: { label: 'Draft', tone: 'neutral' },
  // Stripe's "open": issued and waiting on payment.
  [BillingInvoiceStatus.OPEN]: { label: 'Unpaid', tone: 'warning' },
  [BillingInvoiceStatus.PAID]: { label: 'Paid', tone: 'success' },
  [BillingInvoiceStatus.VOID]: { label: 'Void', tone: 'muted' },
  [BillingInvoiceStatus.UNCOLLECTIBLE]: { label: 'Uncollectible', tone: 'danger' },
};

/** Wallet movements: money in reads as done (success); a deduction is a plain fact, a refund is moving money. */
export const TRANSACTION_TYPE_VARIANTS: Record<WalletTransactionType, StatusVariant> = {
  [WalletTransactionType.TOP_UP]: { label: 'Top-up', tone: 'success' },
  [WalletTransactionType.AUTO_RELOAD]: { label: 'Auto-reload', tone: 'success' },
  [WalletTransactionType.ADMIN_CREDIT]: { label: 'Credit', tone: 'success' },
  [WalletTransactionType.OVERAGE_DEDUCTION]: { label: 'Overage', tone: 'neutral' },
  [WalletTransactionType.REFUND]: { label: 'Refund', tone: 'info' },
};

/** Subscription lifecycle: running reads as Active (info, like a tenant); behind on payment is a warning. */
export const SUBSCRIPTION_STATUS_VARIANTS: Record<BillingSubscriptionStatus, StatusVariant> = {
  [BillingSubscriptionStatus.TRIALING]: { label: 'Trialing', tone: 'info' },
  [BillingSubscriptionStatus.ACTIVE]: { label: 'Active', tone: 'info' },
  [BillingSubscriptionStatus.PAST_DUE]: { label: 'Past due', tone: 'warning' },
  [BillingSubscriptionStatus.SUSPENDED]: { label: 'Suspended', tone: 'danger' },
  [BillingSubscriptionStatus.CANCELED]: { label: 'Cancelled', tone: 'danger' },
};

/** A tenant's plan: a paid plan is a plain fact; a trial is running out; an expired or suspended plan is stopped. */
export const TENANT_PLAN_VARIANTS: Record<TenantPlan, StatusVariant> = {
  [TenantPlan.TRIAL]: { label: 'Trial', tone: 'info' },
  [TenantPlan.TRIAL_EXPIRED]: { label: 'Trial expired', tone: 'danger' },
  [TenantPlan.STARTER]: { label: 'Starter', tone: 'neutral' },
  [TenantPlan.PROFESSIONAL]: { label: 'Professional', tone: 'neutral' },
  [TenantPlan.ENTERPRISE]: { label: 'Enterprise', tone: 'neutral' },
  [TenantPlan.SUSPENDED]: { label: 'Suspended', tone: 'danger' },
};
