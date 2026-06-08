import { z } from 'zod';
import {
  BundleFormat,
  BundleFormatSchema,
  CarrierType,
  CarrierTypeSchema,
  DriverPayTiming,
  DriverPayTimingSchema,
  FleetSize,
  FleetSizeSchema,
} from '../generated/prisma-enums';

// `BundleFormat`, `DriverPayTiming`, `CarrierType`, `FleetSize` are re-exported
// from the codegen mirror — the Prisma enums are the single source of truth.
export {
  BundleFormat,
  BundleFormatSchema,
  CarrierType,
  CarrierTypeSchema,
  DriverPayTiming,
  DriverPayTimingSchema,
  FleetSize,
  FleetSizeSchema,
};

/**
 * Default tenant timezone (IANA). Used when a tenant has no timezone set — the
 * single source of truth shared by backend (Tenant.timezone default), the Desk
 * scheduler read path, and the Organization settings form. Matches the Prisma
 * `Tenant.timezone` column default.
 */
export const DEFAULT_TENANT_TIMEZONE = 'UTC';

export const TenantDetailsSchema = z.object({
  tenantId: z.string(),
  companyName: z.string(),
  subdomain: z.string().optional(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
});

export const UpdateTenantSchema = z.object({
  companyName: z.string().min(1).optional(),
});

export const TenantListItemSchema = z.object({
  tenantId: z.string(),
  companyName: z.string(),
  subdomain: z.string().optional(),
  isActive: z.boolean(),
  plan: z.string().optional(),
  createdAt: z.string(),
});

export const TenantListResponseSchema = z.object({
  tenants: z.array(TenantListItemSchema),
  total: z.number(),
});

// ─── Tenant settings (Phase 1 factoring overhaul) ─────────────────────────────

export const SetTenantFactoringDefaultSchema = z.object({
  factoringCompanyId: z.number().int().positive().nullable(),
});
export type SetTenantFactoringDefaultInput = z.infer<typeof SetTenantFactoringDefaultSchema>;

export const TenantFactoringDefaultSchema = z.object({
  factoringCompanyId: z.number().nullable(),
  factoringCompany: z
    .object({
      id: z.number(),
      companyId: z.string(),
      companyName: z.string(),
    })
    .nullable(),
});
export type TenantFactoringDefault = z.infer<typeof TenantFactoringDefaultSchema>;

// ─── Bundle format setting (factoring cleanup) ────────────────────────────────

export const SetTenantBundleFormatSchema = z.object({
  format: BundleFormatSchema,
});
export type SetTenantBundleFormatInput = z.infer<typeof SetTenantBundleFormatSchema>;

export const TenantBundleFormatResponseSchema = z.object({
  format: BundleFormatSchema,
});
export type TenantBundleFormatResponse = z.infer<typeof TenantBundleFormatResponseSchema>;

// ─── Driver pay timing (Phase 4) ────────────────────────────────────────────

export const SetDriverPayTimingSchema = z.object({
  timing: DriverPayTimingSchema,
});
export type SetDriverPayTimingInput = z.infer<typeof SetDriverPayTimingSchema>;

export const TenantDriverPayTimingResponseSchema = z.object({
  timing: DriverPayTimingSchema,
});
export type TenantDriverPayTimingResponse = z.infer<typeof TenantDriverPayTimingResponseSchema>;

/**
 * Combined settings payload returned by `GET /tenants/me/settings`. The
 * dispatcher reads this on every invoice-detail render to compute the
 * resolved-factor chip and the submit-to-factor preview button label.
 */
export const TenantSettingsResponseSchema = z.object({
  factoringCompanyId: z.number().nullable(),
  factoringCompany: z
    .object({
      id: z.number(),
      companyId: z.string(),
      companyName: z.string(),
    })
    .nullable(),
  bundleFormat: BundleFormatSchema,
  // Phase 4C — driver pay timing surfaces in the settings response so the
  // frontend toggle renders the current state without a second fetch.
  driverPayTiming: z.enum(['ON_DELIVERY', 'ON_FACTOR_FUND']).optional(),
});
export type TenantSettingsResponse = z.infer<typeof TenantSettingsResponseSchema>;

// ─── Organization profile (self-service company profile edit) ─────────────────

/**
 * The editable company-profile field set on the Organization settings page,
 * written by OWNER/ADMIN via `PATCH /tenants/me`. All fields optional — the
 * service maps only what is provided. Contact fields write the TENANT contact
 * (`Tenant.contactEmail`/`contactPhone`), NOT the owner User login. Lifecycle
 * and billing fields (subdomain, plan, status) are intentionally excluded.
 */
export const UpdateOrganizationProfileSchema = z.object({
  companyName: z.string().min(2).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  dotNumber: z
    .string()
    .regex(/^\d{1,8}$/, 'DOT number must be 1-8 digits')
    .optional(),
  mcNumber: z
    .string()
    .regex(/^\d{1,8}$/, 'MC number must be 1-8 digits')
    .optional(),
  carrierType: CarrierTypeSchema.optional(),
  fleetSize: FleetSizeSchema.optional(),
  timezone: z.string().optional(),
});
export type UpdateOrganizationProfileInput = z.infer<typeof UpdateOrganizationProfileSchema>;

/**
 * Current organization profile returned by `GET /tenants/me/profile` so the
 * settings form can render existing values. `timezone` always resolves to a
 * concrete IANA id (defaults to `DEFAULT_TENANT_TIMEZONE`).
 */
export const OrganizationProfileSchema = z.object({
  companyName: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  dotNumber: z.string().nullable(),
  mcNumber: z.string().nullable(),
  carrierType: CarrierTypeSchema,
  fleetSize: FleetSizeSchema.nullable(),
  timezone: z.string(),
});
export type OrganizationProfile = z.infer<typeof OrganizationProfileSchema>;

// Inferred types
export type TenantDetails = z.infer<typeof TenantDetailsSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type TenantListItem = z.infer<typeof TenantListItemSchema>;
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;
