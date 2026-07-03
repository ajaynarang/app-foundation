/**
 * Platform → app hook contracts.
 *
 * The platform package must not import app domains (notifications, desk, …).
 * Where a platform service needs an app-side side-effect, it calls one of
 * these optional hooks instead. The app binds implementations in a @Global
 * module (see apps/backend/src/platform-glue/hooks.module.ts) — the same
 * inversion the AppShore spec uses for auth principal enrichment.
 */

export interface UserLifecycleHooks {
  /** An invited user accepted and joined the tenant. */
  userJoined(tenantDbId: number, userName: string, role: string): Promise<void>;
  /** An admin changed a user's role. */
  userRoleChanged(
    tenantDbId: number,
    userId: number,
    userName: string,
    oldRole: string,
    newRole: string,
  ): Promise<void>;
}
export const USER_LIFECYCLE_HOOKS = 'APPSHORE_USER_LIFECYCLE_HOOKS';

export interface TenantProvisionHooks {
  /** A tenant was approved/activated — provision app-side resources. */
  tenantApproved(tenantDbId: number): Promise<void>;
}
export const TENANT_PROVISION_HOOKS = 'APPSHORE_TENANT_PROVISION_HOOKS';
