import { SetMetadata } from '@nestjs/common';
import type { SystemReason } from './system-reasons';

export const SYSTEM_SCOPE_METADATA = 'rls:system-scope';
export const TARGET_TENANT_METADATA = 'rls:target-tenant';

/**
 * Marks a SUPER_ADMIN-only controller or route that reads across tenants. `RlsScopeInterceptor` runs the handler in a
 * `system` scope carrying `reason` and logs the reason with the super-admin's user id. Use it only on handlers whose
 * `@Roles` is exactly `SUPER_ADMIN`.
 */
export const SystemScope = (reason: SystemReason) => SetMetadata(SYSTEM_SCOPE_METADATA, reason);

export interface TargetTenantOptions {
  /** Route param that names the tenant. */
  param: string;
  /** `id`: the numeric `tenants.id`. `slug`: the tenant's public string id (`tenants.tenant_id`). */
  by: 'id' | 'slug';
}

/**
 * Marks a SUPER_ADMIN-only route that acts on ONE tenant named in the URL. `RlsScopeInterceptor` resolves the param
 * and runs the handler as that tenant, with an audit log line naming the super-admin. Overrides a class-level
 * `@SystemScope`.
 */
export const TargetTenant = (param: string, by: TargetTenantOptions['by'] = 'id') =>
  SetMetadata(TARGET_TENANT_METADATA, { param, by } satisfies TargetTenantOptions);
