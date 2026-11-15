import { z } from 'zod';
import { TenantPlanSchema, TenantStatusSchema, UserRoleSchema } from '../generated/prisma-enums';

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

// ─── Wire shapes of the tenant and workspace routes (the published contract) ─────────

/**
 * A tenant row as the super-admin lifecycle routes answer it (approve / reject / suspend / reactivate / update,
 * `PATCH /plans/tenant/:tenant_id`) and as the user routes nest it: every column, dates as ISO strings. `id` is the
 * numeric key the admin billing and AI-spend routes still take (listed in `id-boundary.allowlist.json`).
 */
export const TenantRecordSchema = z.object({
  id: z.number().int(),
  tenantId: z.string(),
  companyName: z.string(),
  subdomain: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  status: TenantStatusSchema,
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  suspendedBy: z.string().nullable(),
  suspensionReason: z.string().nullable(),
  reactivatedAt: z.string().nullable(),
  reactivatedBy: z.string().nullable(),
  onboardingCompletedAt: z.string().nullable(),
  onboardingProgress: z.record(z.string(), z.unknown()).nullable(),
  timezone: z.string().nullable(),
  deskScheduleEnabled: z.boolean(),
  aiZeroRetention: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  plan: TenantPlanSchema,
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  planAssignedAt: z.string().nullable(),
  planAssignedBy: z.string().nullable(),
  jobsPaused: z.boolean(),
  jobsPausedAt: z.string().nullable(),
  jobsPausedBy: z.number().int().nullable(),
});
export type TenantRecord = z.infer<typeof TenantRecordSchema>;

/** One row of `GET /tenants` (super admin): the tenant, its owners and admins, and how many users it has. */
export const TenantAdminListItemSchema = TenantRecordSchema.extend({
  users: z.array(
    z.object({
      userId: z.string(),
      email: z.string().nullable(),
      firstName: z.string(),
      lastName: z.string(),
      role: UserRoleSchema,
    }),
  ),
  _count: z.object({ users: z.number().int() }),
});
export type TenantAdminListItem = z.infer<typeof TenantAdminListItemSchema>;

/** `POST /tenants/register`: the new tenant's public id, its (pending) status and a line to show. */
export const TenantRegistrationResultSchema = z.object({
  tenantId: z.string(),
  status: TenantStatusSchema,
  message: z.string(),
});
export type TenantRegistrationResult = z.infer<typeof TenantRegistrationResultSchema>;

/** `GET /tenants/check-subdomain/:subdomain`. */
export const SubdomainAvailabilitySchema = z.object({ available: z.boolean() });
export type SubdomainAvailability = z.infer<typeof SubdomainAvailabilitySchema>;

/** `GET /tenants/branding/:subdomain`: the login page's branding, or `null` for an unknown or inactive tenant. */
export const TenantBrandingSchema = z
  .object({
    tenantId: z.string().describe("The tenant's public id — the login form's workspace hint"),
    companyName: z.string(),
    logoUrl: z.string().nullable(),
  })
  .nullable();
export type TenantBranding = z.infer<typeof TenantBrandingSchema>;

/** `GET /tenants/:tenant_id/details`: the super-admin tenant sheet: lifecycle, members, metrics. */
export const TenantAdminDetailsSchema = z.object({
  tenant: z.object({
    id: z.number().int(),
    tenantId: z.string(),
    companyName: z.string(),
    subdomain: z.string().nullable(),
    status: TenantStatusSchema,
    contactEmail: z.string().nullable(),
    contactPhone: z.string().nullable(),
    createdAt: z.string(),
    approvedAt: z.string().optional(),
    approvedBy: z.string().nullable(),
    rejectedAt: z.string().optional(),
    rejectionReason: z.string().nullable(),
    suspendedAt: z.string().optional(),
    suspendedBy: z.string().nullable(),
    suspensionReason: z.string().nullable(),
    reactivatedAt: z.string().optional(),
    reactivatedBy: z.string().nullable(),
  }),
  users: z.array(
    z.object({
      userId: z.string(),
      email: z.string().nullable(),
      firstName: z.string(),
      lastName: z.string(),
      role: UserRoleSchema,
      isActive: z.boolean(),
      lastLoginAt: z.string().nullable(),
    }),
  ),
  metrics: z.object({ totalUsers: z.number().int() }),
});
export type TenantAdminDetails = z.infer<typeof TenantAdminDetailsSchema>;

/** One workspace the user belongs to, with their role in it. */
export const WorkspaceSummarySchema = z.object({
  tenantId: z.string(),
  name: z.string(),
  subdomain: z.string().nullable(),
  role: UserRoleSchema,
  isDefault: z.boolean(),
});
export type WorkspaceSummaryItem = z.infer<typeof WorkspaceSummarySchema>;

/** `GET /workspaces`: every active workspace of the user, the default first. */
export const WorkspaceListResponseSchema = z.object({ workspaces: z.array(WorkspaceSummarySchema) });
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponseSchema>;

/** `POST /workspaces/switch`: a fresh access token for the target workspace (the refresh token rides a cookie). */
export const WorkspaceSwitchResponseSchema = z.object({
  accessToken: z.string(),
  workspace: WorkspaceSummarySchema.omit({ isDefault: true }),
});
export type WorkspaceSwitchResponse = z.infer<typeof WorkspaceSwitchResponseSchema>;
