import { TenantPlan } from '@appshore/db';
import { AiBudgetProvisionHooks } from '../ai-budget-provision.hooks';

describe('AiBudgetProvisionHooks (the always-on tenant-provision hook)', () => {
  function makeHooks() {
    const seeder = {
      seedForTenant: jest.fn().mockResolvedValue(undefined),
      seedForPlan: jest.fn().mockResolvedValue(undefined),
    };
    return { hooks: new AiBudgetProvisionHooks(seeder as never), seeder };
  }

  it('seeds the budget from the current plan when a workspace is approved', async () => {
    const { hooks, seeder } = makeHooks();
    await hooks.tenantApproved(4);
    expect(seeder.seedForTenant).toHaveBeenCalledWith(4);
  });

  it('reseeds from the new plan when the plan changes', async () => {
    const { hooks, seeder } = makeHooks();
    await hooks.planAssigned(4, TenantPlan.ENTERPRISE);
    expect(seeder.seedForPlan).toHaveBeenCalledWith(4, TenantPlan.ENTERPRISE);
  });

  it('ignores a plan it does not know', async () => {
    const { hooks, seeder } = makeHooks();
    await hooks.planAssigned(4, 'GOLD');
    expect(seeder.seedForPlan).not.toHaveBeenCalled();
  });

  it('a seeding failure never fails the approval or the plan change', async () => {
    const { hooks, seeder } = makeHooks();
    seeder.seedForTenant.mockRejectedValue(new Error('db down'));
    seeder.seedForPlan.mockRejectedValue(new Error('db down'));
    await expect(hooks.tenantApproved(4)).resolves.toBeUndefined();
    await expect(hooks.planAssigned(4, TenantPlan.STARTER)).resolves.toBeUndefined();
  });
});
