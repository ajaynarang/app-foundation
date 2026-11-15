/**
 * Billing response schemas for the published contract (ADR "API contract", section 4).
 *
 * The billing reads answer Prisma rows (the overview, the wallet, the transaction and invoice lists, the payment
 * methods, the admin tenant view), so these schemas describe those rows as JSON puts them on the wire: numeric
 * `tenantId`, dates as ISO strings. The shared `BillingOverviewSchema` in `@app/shared-types` does not match that
 * wire shape, so it is not reused here. Serializing them is a known follow-up (the ADR lists it).
 */
import { z } from 'zod';
import {
  BillingInvoiceStatusSchema,
  BillingSubscriptionStatusSchema,
  PaymentMethodTypeSchema,
  TenantPlanSchema,
  WalletTransactionTypeSchema,
} from '@app/shared-types';
import { defineResponseSchema } from '@appshore/platform/shared/openapi/api-result';
import { defineCursorListSchema } from '@appshore/platform/shared/openapi/common-responses';

const iso = () => z.string().describe('ISO-8601 timestamp');

/** A `BillingSubscription` row as sent. */
const SubscriptionRowSchema = z.object({
  id: z.string(),
  tenantId: z.number().int(),
  billingCustomerId: z.string(),
  providerSubscriptionId: z.string(),
  plan: TenantPlanSchema,
  status: BillingSubscriptionStatusSchema,
  quantity: z.number().int(),
  unitPriceCents: z.number().int(),
  interval: z.string(),
  currentPeriodStart: iso(),
  currentPeriodEnd: iso(),
  cancelAtPeriodEnd: z.boolean(),
  pendingDowngradePlan: TenantPlanSchema.nullable(),
  createdAt: iso(),
  updatedAt: iso(),
});

/** A `Wallet` row as sent. */
const WalletRowSchema = z.object({
  id: z.string(),
  tenantId: z.number().int(),
  balanceCents: z.number().int(),
  autoReloadEnabled: z.boolean(),
  autoReloadThresholdCents: z.number().int().nullable(),
  autoReloadAmountCents: z.number().int().nullable(),
  lifetimeLoadedCents: z.number().int(),
  lifetimeConsumedCents: z.number().int(),
  createdAt: iso(),
  updatedAt: iso(),
});

/** A `WalletTransaction` row as sent. */
const WalletTransactionRowSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  tenantId: z.number().int(),
  type: WalletTransactionTypeSchema,
  amountCents: z.number().int(),
  balanceAfterCents: z.number().int(),
  description: z.string(),
  relatedAddOnId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: iso(),
});

/** A `PaymentMethod` row as sent (the overview and admin view still send the full row). */
const PaymentMethodRowSchema = z.object({
  id: z.string(),
  tenantId: z.number().int(),
  billingCustomerId: z.string(),
  providerPaymentMethodId: z.string(),
  type: PaymentMethodTypeSchema,
  last4: z.string(),
  brand: z.string(),
  expMonth: z.number().int(),
  expYear: z.number().int(),
  isDefault: z.boolean(),
  createdAt: iso(),
  updatedAt: iso(),
});

const InvoiceLineSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  totalCents: z.number(),
});

/** A `BillingInvoice` row as sent (admin view). `lineItems` is the stored JSON array. */
const InvoiceRowSchema = z.object({
  id: z.string(),
  tenantId: z.number().int(),
  billingCustomerId: z.string(),
  providerInvoiceId: z.string(),
  status: BillingInvoiceStatusSchema,
  amountDueCents: z.number().int(),
  amountPaidCents: z.number().int(),
  taxCents: z.number().int(),
  periodStart: iso(),
  periodEnd: iso(),
  lineItems: z.array(InvoiceLineSchema),
  pdfUrl: z.string().nullable(),
  hostedInvoiceUrl: z.string().nullable(),
  paidAt: iso().nullable(),
  createdAt: iso(),
  updatedAt: iso(),
});

/** The provider's live preview of the next invoice (`PaymentProviderAdapter.getUpcomingInvoice`). */
const InvoicePreviewSchema = z.object({
  amountDueCents: z.number().int(),
  taxCents: z.number().int(),
  lineItems: z.array(InvoiceLineSchema.extend({ priceId: z.string().optional() })),
  periodStart: iso(),
  periodEnd: iso(),
});

// ─── Tenant-facing ───────────────────────────────────────────────────────────

export const BillingOverviewResponse = defineResponseSchema(
  'BillingOverview',
  z.object({
    subscription: SubscriptionRowSchema.nullable().describe('The latest subscription, or null when none exists'),
    wallet: WalletRowSchema.nullable(),
    paymentMethods: z.array(PaymentMethodRowSchema),
    upcomingInvoice: InvoicePreviewSchema.nullable().describe(
      'Only for an ACTIVE subscription the provider can preview',
    ),
  }),
);

export const BillingCheckoutSessionResponse = defineResponseSchema(
  'BillingCheckoutSession',
  z.object({ checkoutUrl: z.string().describe('Provider-hosted checkout page to redirect the browser to') }),
);

export const BillingWalletBalanceResponse = defineResponseSchema(
  'BillingWalletBalance',
  z.object({
    wallet: WalletRowSchema,
    recentTransactions: z.array(WalletTransactionRowSchema).describe('The 10 newest transactions'),
  }),
);

export const BillingWalletTransactionListResponse = defineCursorListSchema(
  'BillingWalletTransactionList',
  WalletTransactionRowSchema,
);

export const BillingInvoiceListResponse = defineCursorListSchema('BillingInvoiceList', InvoiceRowSchema);

export const BillingInvoicePreviewResponse = defineResponseSchema('BillingInvoicePreview', InvoicePreviewSchema);

export const BillingInvoiceDownloadResponse = defineResponseSchema(
  'BillingInvoiceDownload',
  z.object({ pdfUrl: z.string(), hostedUrl: z.string().nullable() }),
);

export const BillingPaymentMethodSetupResponse = defineResponseSchema(
  'BillingPaymentMethodSetup',
  z.object({ setupUrl: z.string().describe('Provider-hosted page that collects the new payment method') }),
);

export const BillingPaymentMethodResponse = defineResponseSchema('BillingPaymentMethod', PaymentMethodRowSchema);

// ─── Super-admin ─────────────────────────────────────────────────────────────

export const BillingAdminTenantBillingResponse = defineResponseSchema(
  'BillingAdminTenantBilling',
  z.object({
    tenant: z.object({
      tenantId: z.string(),
      companyName: z.string(),
      plan: TenantPlanSchema,
      trialStartedAt: iso().nullable(),
      trialEndsAt: iso().nullable(),
      planAssignedAt: iso().nullable(),
    }),
    subscription: SubscriptionRowSchema.nullable(),
    wallet: WalletRowSchema.extend({
      transactions: z.array(WalletTransactionRowSchema).describe('The 10 newest transactions'),
    }).nullable(),
    paymentMethods: z.array(PaymentMethodRowSchema),
    recentInvoices: z.array(InvoiceRowSchema).describe('The 10 newest invoices'),
  }),
);

export const BillingAdminSubscriptionCreatedResponse = defineResponseSchema(
  'BillingAdminSubscriptionCreated',
  z.object({ providerSubscriptionId: z.string() }),
);

export const BillingAdminRefundResponse = defineResponseSchema(
  'BillingAdminRefund',
  z.object({ refundId: z.string().describe("The provider's refund id") }),
);

export const BillingAdminPlanChangeResponse = defineResponseSchema(
  'BillingAdminPlanChange',
  z.object({ action: z.enum(['upgraded', 'downgraded', 'created']) }),
);

export const BillingRevenueStatsResponse = defineResponseSchema(
  'BillingRevenueStats',
  z.object({
    mrrCents: z.number().int(),
    arrCents: z.number().int(),
    arpuCents: z.number().int(),
    activeSubscriptions: z.number().int(),
    canceledThisMonth: z.number().int(),
    churnRate: z.number().describe('Percent, two decimals'),
    totalTenants: z.number().int(),
    activeAddOns: z.number().int(),
    addOnAdoptionRate: z.number().describe('Percent, two decimals'),
  }),
);
