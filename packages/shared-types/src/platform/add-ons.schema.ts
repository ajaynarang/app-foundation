import { z } from 'zod';

// ---------------------------------------------------------------------------
// Add-on catalog item
// ---------------------------------------------------------------------------
export const AddOnSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  icon: z.string().nullable(),
  category: z.string(),
  priceCents: z.number().nullable(),
  billingInterval: z.string(),
  featureKey: z.string(),
  usageLimits: z.record(z.string(), z.number()).nullable(),
  usageLimitUnit: z.string().nullable(),
  overageRateCents: z.number().nullable(),
  providerPriceId: z.string().nullable().optional(),
  isActive: z.boolean(),
  displayOrder: z.number(),
});

// ---------------------------------------------------------------------------
// Tenant's subscription to an add-on
// ---------------------------------------------------------------------------
export const TenantAddOnStatusEnum = z.enum(['ACTIVE', 'CANCELLED', 'SUSPENDED']);

export const TenantAddOnSourceEnum = z.enum(['purchased', 'gifted']);

export const TenantAddOnSchema = z.object({
  id: z.string(),
  addOnId: z.string(),
  addOn: AddOnSchema,
  status: TenantAddOnStatusEnum,
  source: TenantAddOnSourceEnum,
  priceCents: z.number(),
  usageLimit: z.number().nullable(),
  usageLimitUnit: z.string().nullable(),
  currentUsage: z.number(),
  overageUsage: z.number(),
  allowOverage: z.boolean(),
  usageResetAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Feature access check result
// ---------------------------------------------------------------------------
export const AddOnStatusSourceEnum = z.enum(['ADDON_ACTIVE', 'FEATURE_FLAG_DISABLED', 'NOT_ENABLED']);

export const AddOnStatusSchema = z.object({
  enabled: z.boolean(),
  source: AddOnStatusSourceEnum,
  usageRemaining: z.number().nullable(),
  addOn: AddOnSchema.nullable(),
  subscription: TenantAddOnSchema.nullable(),
});

// ---------------------------------------------------------------------------
// Add-on request
// ---------------------------------------------------------------------------
export const AddOnRequestStatusEnum = z.enum(['PENDING', 'APPROVED', 'DECLINED']);

export const AddOnRequestSchema = z.object({
  id: z.string(),
  tenantId: z.number(),
  addOnId: z.string(),
  status: AddOnRequestStatusEnum,
  requestedByUserId: z.number(),
  requestedAt: z.string(),
  requestNote: z.string().nullable(),
  reviewedByUserId: z.number().nullable(),
  reviewedAt: z.string().nullable(),
  declineReason: z.string().nullable(),
  giftedPriceCents: z.number().nullable(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type AddOn = z.infer<typeof AddOnSchema>;
export type TenantAddOn = z.infer<typeof TenantAddOnSchema>;
export type AddOnStatus = z.infer<typeof AddOnStatusSchema>;
export type TenantAddOnStatusValue = z.infer<typeof TenantAddOnStatusEnum>;
export type TenantAddOnSourceValue = z.infer<typeof TenantAddOnSourceEnum>;
export type AddOnStatusSource = z.infer<typeof AddOnStatusSourceEnum>;
export type AddOnRequest = z.infer<typeof AddOnRequestSchema>;
// `AddOnRequestStatus` type comes from the generated Prisma mirror — not
// re-declared here to avoid a barrel re-export collision.
