import type { Provider, Type } from '@nestjs/common';
import { TENANT_PROVISION_HOOKS, type TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import type { OptionalFeature } from './optional-feature';

/**
 * Calls each tenant-provision hook in order: the app's always-on hooks first (they run with or without any optional
 * feature), then each feature's. With none it does nothing.
 */
export class CompositeTenantProvisionHooks implements TenantProvisionHooks {
  constructor(private readonly hooks: readonly TenantProvisionHooks[]) {}

  async tenantApproved(tenantDbId: number): Promise<void> {
    for (const hook of this.hooks) await hook.tenantApproved(tenantDbId);
  }

  async planAssigned(tenantDbId: number, plan: string): Promise<void> {
    for (const hook of this.hooks) await hook.planAssigned?.(tenantDbId, plan);
  }
}

/** The modules every feature's hook providers need. */
export function featureHookImports(features: readonly OptionalFeature[]) {
  return features.flatMap((f) => f.hooks?.imports ?? []);
}

/**
 * The providers that bind `TENANT_PROVISION_HOOKS`: the app's always-on hook classes, each feature's hook class, its
 * helpers, and the composite over them. The token is always bound, so a product with no feature still gets the
 * always-on hooks (or a no-op) rather than a missing provider.
 */
export function featureHookProviders(
  features: readonly OptionalFeature[],
  alwaysOn: readonly Type<TenantProvisionHooks>[] = [],
): Provider[] {
  const tenantProvision = [
    ...alwaysOn,
    ...features.map((f) => f.hooks?.tenantProvision).filter((c): c is Type<TenantProvisionHooks> => c !== undefined),
  ];
  return [
    ...features.flatMap((f) => f.hooks?.providers ?? []),
    ...tenantProvision,
    {
      provide: TENANT_PROVISION_HOOKS,
      useFactory: (...hooks: TenantProvisionHooks[]) => new CompositeTenantProvisionHooks(hooks),
      inject: tenantProvision,
    },
  ];
}
