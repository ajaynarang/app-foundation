import { z } from 'zod';
import { TenantPlanSchema } from './plans.schema';
import { WalletSchema } from './wallet.schema';
import {
  BillingProviderTypeSchema,
  BillingSubscriptionStatusSchema,
  BillingInvoiceStatusSchema,
  PaymentMethodTypeSchema,
} from '../generated/prisma-enums';

// ---------------------------------------------------------------------------
// Enums — sourced from the generated Prisma mirror (single source of truth).
// Local `*Enum` aliases are kept for in-file readability.
// ---------------------------------------------------------------------------
export const BillingProviderTypeEnum = BillingProviderTypeSchema;
export const BillingSubscriptionStatusEnum = BillingSubscriptionStatusSchema;
export const BillingInvoiceStatusEnum = BillingInvoiceStatusSchema;
export const PaymentMethodTypeEnum = PaymentMethodTypeSchema;

// ---------------------------------------------------------------------------
// Billing address (embedded object)
// ---------------------------------------------------------------------------
export const BillingAddressSchema = z.object({
  line1: z.string(),
  line2: z.string().nullable(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string(),
  country: z.string(),
});

// ---------------------------------------------------------------------------
// Core schemas
// ---------------------------------------------------------------------------
export const BillingCustomerSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  providerType: BillingProviderTypeEnum,
  providerCustomerId: z.string(),
  billingEmail: z.string(),
  billingName: z.string(),
  billingAddress: BillingAddressSchema.nullable(),
  taxId: z.string().nullable(),
  taxExempt: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BillingSubscriptionSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  billingCustomerId: z.string(),
  providerSubscriptionId: z.string(),
  plan: TenantPlanSchema,
  status: BillingSubscriptionStatusEnum,
  quantity: z.number(),
  unitPriceCents: z.number(),
  interval: z.string(),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const BillingInvoiceLineItemSchema = z.object({
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  totalCents: z.number(),
});

export const BillingInvoiceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  billingCustomerId: z.string(),
  providerInvoiceId: z.string(),
  status: BillingInvoiceStatusEnum,
  amountDueCents: z.number(),
  amountPaidCents: z.number(),
  taxCents: z.number(),
  periodStart: z.string(),
  periodEnd: z.string(),
  lineItems: z.array(BillingInvoiceLineItemSchema),
  pdfUrl: z.string().nullable(),
  hostedInvoiceUrl: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

export const PaymentMethodSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  billingCustomerId: z.string(),
  providerPaymentMethodId: z.string(),
  type: PaymentMethodTypeEnum,
  last4: z.string(),
  brand: z.string(),
  expMonth: z.number(),
  expYear: z.number(),
  isDefault: z.boolean(),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------
export const CreateCheckoutSessionRequestSchema = z.object({
  plan: TenantPlanSchema,
  quantity: z.number().min(1),
  successUrl: z.string(),
  cancelUrl: z.string(),
});

export const UpgradePlanRequestSchema = z.object({
  newPlan: TenantPlanSchema,
  newQuantity: z.number().min(1).optional(),
});

export const DowngradePlanRequestSchema = z.object({
  newPlan: TenantPlanSchema,
});

export const UpdateQuantityRequestSchema = z.object({
  quantity: z.number().min(1),
});

export const CancelSubscriptionRequestSchema = z.object({
  reason: z.string().optional(),
});

export const RefundRequestSchema = z.object({
  providerPaymentId: z.string(),
  amountCents: z.number().optional(),
  reason: z.string(),
});

export const AdminCreditRequestSchema = z.object({
  tenantId: z.string(),
  amountCents: z.number(),
  reason: z.string(),
});

export const AdminOverridePriceRequestSchema = z.object({
  tenantId: z.string(),
  unitPriceCents: z.number(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------
export const BillingOverviewSchema = z.object({
  subscription: BillingSubscriptionSchema.nullable(),
  wallet: WalletSchema.nullable(),
  paymentMethods: z.array(PaymentMethodSchema),
  upcomingInvoice: BillingInvoiceSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
// `BillingProviderType`, `BillingSubscriptionStatus`, `BillingInvoiceStatus`,
// and `PaymentMethodType` types come from the generated Prisma mirror — do not
// re-declare them here (avoids a barrel re-export collision).
export type BillingAddress = z.infer<typeof BillingAddressSchema>;
export type BillingCustomer = z.infer<typeof BillingCustomerSchema>;
export type BillingSubscription = z.infer<typeof BillingSubscriptionSchema>;
export type BillingInvoiceLineItem = z.infer<typeof BillingInvoiceLineItemSchema>;
export type BillingInvoice = z.infer<typeof BillingInvoiceSchema>;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequestSchema>;
export type UpgradePlanRequest = z.infer<typeof UpgradePlanRequestSchema>;
export type DowngradePlanRequest = z.infer<typeof DowngradePlanRequestSchema>;
export type UpdateQuantityRequest = z.infer<typeof UpdateQuantityRequestSchema>;
export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;
export type RefundRequest = z.infer<typeof RefundRequestSchema>;
export type AdminCreditRequest = z.infer<typeof AdminCreditRequestSchema>;
export type AdminOverridePrice = z.infer<typeof AdminOverridePriceRequestSchema>;
export type BillingOverview = z.infer<typeof BillingOverviewSchema>;
