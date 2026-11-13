import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TENANT_PROVISION_HOOKS } from '@appshore/platform/domains/platform-hooks';
import { AiBudgetProvisionHooks } from '../ai-budget-provision.hooks';
import { featureHookProviders } from '../features/feature-hooks';
import { ALWAYS_ON_TENANT_PROVISION_HOOKS } from '../tenant-provision-hooks';

/**
 * The binding that turns plan-budget seeding on. The hook class, the composite and the platform callers each have
 * their own specs; this one holds the wiring. `hooks.module.ts` itself is read as text: importing it loads the Desk
 * stack, which Jest cannot run.
 */
describe('TENANT_PROVISION_HOOKS binding', () => {
  it('lists the AI budget seed hook as always on', () => {
    expect(ALWAYS_ON_TENANT_PROVISION_HOOKS).toContain(AiBudgetProvisionHooks);
  });

  it('hooks.module.ts binds the token with the always-on list', () => {
    const source = readFileSync(join(__dirname, '..', 'hooks.module.ts'), 'utf8');
    expect(source).toMatch(/featureHookProviders\(\s*OPTIONAL_FEATURES\s*,\s*ALWAYS_ON_TENANT_PROVISION_HOOKS\s*\)/);
  });

  it('the composite runs the AI budget seed hook first, ahead of any optional feature', () => {
    const providers = featureHookProviders([], ALWAYS_ON_TENANT_PROVISION_HOOKS);
    const binding = providers.find(
      (p) => typeof p === 'object' && (p as { provide?: unknown }).provide === TENANT_PROVISION_HOOKS,
    ) as { inject: unknown[] } | undefined;
    expect(binding?.inject[0]).toBe(AiBudgetProvisionHooks);
    expect(providers).toContain(AiBudgetProvisionHooks);
  });
});
