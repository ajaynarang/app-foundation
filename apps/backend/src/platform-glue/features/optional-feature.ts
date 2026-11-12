import type { DynamicModule, ForwardReference, INestApplication, Provider, Type } from '@nestjs/common';
import type { TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';

type ModuleImport = Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference;

/**
 * A feature a product chooses at scaffold time. The app reaches a feature's code only through this seam:
 * `<name>.feature.ts` beside this file is the one file outside the feature's folder that may import from it, and
 * `index.ts` lists the features this product kept. A product that said no has neither the folder nor the line, and
 * `tools/init-app/features/<name>.json` names everything else that went with it.
 * Held by `apps/backend/src/architecture/optional-features.spec.ts`.
 */
export interface OptionalFeature {
  /** The manifest name: `tools/init-app/features/<name>.json`. */
  readonly name: string;
  /** Modules the app module imports. */
  readonly modules: readonly ModuleImport[];
  /** What the feature binds to the platform's lifecycle hooks (`platform-glue/hooks.module.ts`). */
  readonly hooks?: {
    /** Modules the hook providers need. */
    readonly imports?: readonly ModuleImport[];
    /** Extra providers the hook classes need. */
    readonly providers?: readonly Provider[];
    /** Called when a tenant is approved, after every earlier feature's contribution. */
    readonly tenantProvision?: Type<TenantProvisionHooks>;
  };
  /** Runs once the Nest app exists, before it listens. */
  onAppReady?(app: INestApplication): void;
}
