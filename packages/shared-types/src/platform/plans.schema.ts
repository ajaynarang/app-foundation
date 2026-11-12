import { z } from 'zod';
import { TenantPlan, TenantPlanSchema } from '../generated/prisma-enums';

// `TenantPlan` is re-exported from the codegen mirror — the Prisma enum is
// the single source of truth.
export { TenantPlan, TenantPlanSchema };

export const PlanEntitlementSchema = z.object({
  feature: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
});

export const PlanConfigSchema = z.object({
  id: z.number().int(),
  plan: TenantPlanSchema,
  displayName: z.string(),
  tagline: z.string(),
  pricePerUnitCents: z.number().nullable(),
  unitLabel: z.string(),
  seatLimit: z.number().nullable(),
  userLimit: z.number().nullable(),
  isPopular: z.boolean(),
  ctaLabel: z.string(),
  ctaUrl: z.string().nullable(),
  displayOrder: z.number(),
  providerPriceId: z.string().nullable().optional(),
  entitlements: z.array(PlanEntitlementSchema),
});

export const PlanEventSchema = z.object({
  id: z.string(),
  fromPlan: TenantPlanSchema.nullable(),
  toPlan: TenantPlanSchema,
  changedBy: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});

export const TenantPlanDetailsSchema = z.object({
  plan: TenantPlanSchema,
  planConfig: PlanConfigSchema.nullable(),
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  planAssignedAt: z.string().nullable(),
  planAssignedBy: z.string().nullable(),
  seatCount: z.number(),
  seatLimit: z.number().nullable(),
  daysLeftInTrial: z.number().nullable(),
  seatLimitWarning: z.boolean(),
  planEvents: z.array(PlanEventSchema),
});

export const AssignPlanRequestSchema = z.object({
  tenantId: z.string(),
  plan: TenantPlanSchema,
  reason: z.string().optional(),
});

// Inferred types
// `TenantPlan` type comes from the generated mirror via the re-export above.
export type PlanEntitlement = z.infer<typeof PlanEntitlementSchema>;
export type PlanConfig = z.infer<typeof PlanConfigSchema>;
export type PlanEvent = z.infer<typeof PlanEventSchema>;
export type TenantPlanDetails = z.infer<typeof TenantPlanDetailsSchema>;
export type AssignPlanRequest = z.infer<typeof AssignPlanRequestSchema>;

// ─── Wire shapes of the plan routes (the published contract) ─────────

/** A `PlanConfig` row as the plan routes answer it, dates as ISO strings. */
export const PlanConfigRecordSchema = z.object({
  id: z.number().int(),
  plan: TenantPlanSchema,
  displayName: z.string(),
  tagline: z.string(),
  pricePerUnitCents: z.number().int().nullable(),
  unitLabel: z.string(),
  seatLimit: z.number().int().nullable(),
  userLimit: z.number().int().nullable(),
  isPopular: z.boolean(),
  ctaLabel: z.string(),
  ctaUrl: z.string().nullable(),
  displayOrder: z.number().int(),
  providerPriceId: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanConfigRecord = z.infer<typeof PlanConfigRecordSchema>;

/** A plan config with its entitlements, enabled ones first (`GET /plans`, and inside a tenant's plan). */
export const PlanConfigWithEntitlementsSchema = PlanConfigRecordSchema.extend({
  entitlements: z.array(PlanEntitlementSchema),
});
export type PlanConfigWithEntitlements = z.infer<typeof PlanConfigWithEntitlementsSchema>;

/** A `PlanEntitlement` row: what `PATCH /plans/:plan/entitlements/:feature` answers. */
export const PlanEntitlementRecordSchema = z.object({
  id: z.number().int(),
  plan: TenantPlanSchema,
  feature: z.string(),
  displayName: z.string(),
  enabled: z.boolean(),
  type: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlanEntitlementRecord = z.infer<typeof PlanEntitlementRecordSchema>;

/** A tenant's plan-change event row (`tenantId` is the numeric tenant id). */
export const TenantPlanEventRecordSchema = z.object({
  id: z.string(),
  tenantId: z.number().int(),
  fromPlan: TenantPlanSchema.nullable(),
  toPlan: TenantPlanSchema,
  changedBy: z.string(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type TenantPlanEventRecord = z.infer<typeof TenantPlanEventRecordSchema>;

/**
 * `GET /plans/my-plan`, `GET /plans/tenant/:tenant_id`: the tenant's plan, its config, active users against the
 * limit, trial days left and the last 10 plan events (newest first).
 */
export const TenantPlanSnapshotSchema = z.object({
  plan: TenantPlanSchema,
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  planAssignedAt: z.string().nullable(),
  planAssignedBy: z.string().nullable(),
  planConfig: PlanConfigWithEntitlementsSchema.nullable(),
  userCount: z.number().int(),
  seatLimit: z.number().int().nullable(),
  daysLeftInTrial: z.number().int().nullable(),
  planEvents: z.array(TenantPlanEventRecordSchema),
});
export type TenantPlanSnapshot = z.infer<typeof TenantPlanSnapshotSchema>;
