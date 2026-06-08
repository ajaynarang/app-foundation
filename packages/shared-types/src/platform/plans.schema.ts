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
  pricePerUnit: z.number().nullable(),
  unitLabel: z.string(),
  fleetLimit: z.number().nullable(),
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
  vehicleCount: z.number(),
  fleetLimit: z.number().nullable(),
  daysLeftInTrial: z.number().nullable(),
  fleetLimitWarning: z.boolean(),
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
