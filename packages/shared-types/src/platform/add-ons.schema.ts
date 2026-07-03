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
