import type { Type } from '@nestjs/common';
import type { TenantProvisionHooks } from '@appshore/platform/domains/platform-hooks';
import { AiBudgetProvisionHooks } from './ai-budget-provision.hooks';

/**
 * The app's always-on tenant-provision hooks, run before any optional feature's. `hooks.module.ts` binds them; the
 * AI budget seed (approval, plan change, personal signup) runs only because it is listed here.
 */
export const ALWAYS_ON_TENANT_PROVISION_HOOKS: readonly Type<TenantProvisionHooks>[] = [AiBudgetProvisionHooks];
