import { Injectable } from '@nestjs/common';
import type { TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import { DeskModule } from '../../domains/desk/desk.module';
import { setNestAppContext } from '../../domains/desk/core/inngest/nest-context';
import { DeskBootstrapService } from '../../domains/desk/responsibilities/desk-bootstrap.service';
import { DeskResponsibilityModule } from '../../domains/desk/responsibilities/desk-responsibility.module';
import type { OptionalFeature } from './optional-feature';

/** A newly approved tenant gets its default Desk agents. */
@Injectable()
export class DeskTenantProvisionHooks implements TenantProvisionHooks {
  constructor(private readonly deskBootstrap: DeskBootstrapService) {}
  tenantApproved(tenantDbId: number) {
    return this.deskBootstrap.bootstrapForTenant(tenantDbId);
  }
}

/**
 * Desk: the durable workflow engine for background AI agents. The only file outside the Desk folder that imports
 * from it (held by `apps/backend/src/architecture/optional-features.spec.ts`).
 */
export const DESK_FEATURE: OptionalFeature = {
  name: 'desk',
  modules: [DeskModule],
  hooks: {
    imports: [DeskResponsibilityModule],
    tenantProvision: DeskTenantProvisionHooks,
  },
  // Workflow step handlers are plain functions, not Nest classes; they read services from this container.
  onAppReady: (app) => setNestAppContext(app),
};
