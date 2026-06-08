import { z } from 'zod';

/**
 * Default tenant timezone (IANA). Used when a tenant has no timezone set — the
 * single source of truth shared by backend (Tenant.timezone default) and the
 * Organization settings form. Matches the Prisma `Tenant.timezone` column default.
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

/**
 * Combined settings payload returned by `GET /tenants/me/settings`.
 */
export const TenantSettingsResponseSchema = z.object({
  timezone: z.string(),
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
  timezone: z.string(),
});
export type OrganizationProfile = z.infer<typeof OrganizationProfileSchema>;

// Inferred types
export type TenantDetails = z.infer<typeof TenantDetailsSchema>;
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;
export type TenantListItem = z.infer<typeof TenantListItemSchema>;
export type TenantListResponse = z.infer<typeof TenantListResponseSchema>;
