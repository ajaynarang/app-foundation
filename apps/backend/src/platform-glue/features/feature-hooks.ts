import type { Provider, Type } from '@nestjs/common';
import { TENANT_PROVISION_HOOKS, type TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import type { OptionalFeature } from './optional-feature';

/** Calls each feature's tenant-provision hook in feature order. With no feature it does nothing. */
export class CompositeTenantProvisionHooks implements TenantProvisionHooks {
  constructor(private readonly hooks: readonly TenantProvisionHooks[]) {}

  async tenantApproved(tenantDbId: number): Promise<void> {
    for (const hook of this.hooks) await hook.tenantApproved(tenantDbId);
  }
}

/** The modules every feature's hook providers need. */
export function featureHookImports(features: readonly OptionalFeature[]) {
  return features.flatMap((f) => f.hooks?.imports ?? []);
}

/**
 * The providers that bind `TENANT_PROVISION_HOOKS`: each feature's hook class, its helpers, and the composite over
 * them. The token is always bound, so a product with no feature gets a no-op rather than a missing provider.
 */
export function featureHookProviders(features: readonly OptionalFeature[]): Provider[] {
  const tenantProvision = features
    .map((f) => f.hooks?.tenantProvision)
    .filter((c): c is Type<TenantProvisionHooks> => c !== undefined);
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
