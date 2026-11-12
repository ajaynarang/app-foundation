import { Injectable, Logger } from '@nestjs/common';
import { TenantPlan } from '@appshore/db';
import type { TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import { AiBudgetSeederService } from '../domains/ai/routing/provisioning/ai-budget-seeder.service';

/**
 * The tenant-provision hook that runs whatever optional features a product kept (bound in `hooks.module.ts`): a workspace's AI budget is seeded
 * from its plan when it is approved (and after a personal signup), and re-seeded when its plan changes. The seeder
 * leaves admin-edited budgets alone. A seeding failure is logged and never fails an approval, a signup or a plan
 * change.
 */
@Injectable()
export class AiBudgetProvisionHooks implements TenantProvisionHooks {
  private readonly logger = new Logger(AiBudgetProvisionHooks.name);

  constructor(private readonly budgetSeeder: AiBudgetSeederService) {}

  async tenantApproved(tenantDbId: number): Promise<void> {
    try {
      await this.budgetSeeder.seedForTenant(tenantDbId);
    } catch (err) {
      this.logger.warn(`AI budget seed failed for workspace ${tenantDbId}: ${(err as Error).message}`);
    }
  }

  async planAssigned(tenantDbId: number, plan: string): Promise<void> {
    if (!(Object.values(TenantPlan) as string[]).includes(plan)) {
      this.logger.warn(`planAssigned with unknown plan ${plan} for workspace ${tenantDbId}; AI budget not seeded`);
      return;
    }
    try {
      await this.budgetSeeder.seedForPlan(tenantDbId, plan as TenantPlan);
    } catch (err) {
      this.logger.warn(`AI budget seed failed for workspace ${tenantDbId}: ${(err as Error).message}`);
    }
  }
}
