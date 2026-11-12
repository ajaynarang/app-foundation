import { TenantPlan } from '@appshore/db';
import { AiBudgetSeederService } from '../ai-budget-seeder.service';
import { BUDGET_SEED_NOTE_DEFAULT, PLAN_AI_BUDGETS } from '../plan-ai-budgets';

const TENANT = 7;

/** `existingNotes`: undefined = no row; null = a row with no note; a string = a row with that note. */
function makeSeeder(existingNotes: string | null | undefined, plan: TenantPlan = TenantPlan.STARTER) {
  const prisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue({ plan }) },
    tenantAiBudget: {
      findUnique: jest.fn().mockResolvedValue(existingNotes === undefined ? null : { notes: existingNotes }),
      create: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: existingNotes === undefined ? 0 : 1 }),
    },
  };
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  const provisioning = {
    syncLimit: jest.fn().mockResolvedValue(undefined),
    ensureSubKey: jest.fn().mockResolvedValue(false),
  };
  return {
    seeder: new AiBudgetSeederService(prisma as never, cache as never, provisioning as never),
    prisma,
    cache,
    provisioning,
  };
}

describe('AiBudgetSeederService', () => {
  it('seeds an absent row with the plan preset, stamps notes and drops the cached budget', async () => {
    const { seeder, prisma, cache } = makeSeeder(undefined);
    await seeder.seedForPlan(TENANT, TenantPlan.PROFESSIONAL);
    expect(prisma.tenantAiBudget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: TENANT, monthlyHardUsd: '500', notes: 'plan:PROFESSIONAL' }),
    });
    expect(prisma.tenantAiBudget.updateMany).not.toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('app:ai-telemetry:budget:7');
  });

  it('reseeds a row it stamped before (a plan change)', async () => {
    const { seeder, prisma } = makeSeeder('plan:TRIAL');
    await seeder.seedForPlan(TENANT, TenantPlan.ENTERPRISE);
    expect(prisma.tenantAiBudget.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, notes: { startsWith: 'plan:' } },
      data: expect.objectContaining({ notes: 'plan:ENTERPRISE', monthlyHardUsd: '1500' }),
    });
    expect(prisma.tenantAiBudget.create).not.toHaveBeenCalled();
  });

  it('reseeds a lazily created default row (plan:DEFAULT)', async () => {
    const { seeder, prisma } = makeSeeder(BUDGET_SEED_NOTE_DEFAULT);
    await seeder.seedForPlan(TENANT, TenantPlan.TRIAL);
    expect(prisma.tenantAiBudget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ notes: 'plan:TRIAL', monthlyHardUsd: '25' }) }),
    );
  });

  it('never touches an admin-managed row (a note without the stamp)', async () => {
    const { seeder, prisma, cache } = makeSeeder('raised for the pilot');
    await seeder.seedForPlan(TENANT, TenantPlan.STARTER);
    expect(prisma.tenantAiBudget.updateMany).not.toHaveBeenCalled();
    expect(prisma.tenantAiBudget.create).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('a row with no note is admin-owned too (an admin cleared it)', async () => {
    const { seeder, prisma } = makeSeeder(null);
    await seeder.seedForPlan(TENANT, TenantPlan.STARTER);
    expect(prisma.tenantAiBudget.updateMany).not.toHaveBeenCalled();
    expect(prisma.tenantAiBudget.create).not.toHaveBeenCalled();
  });

  it('seedForTenant reads the workspace plan; a missing workspace is a no-op', async () => {
    const { seeder, prisma } = makeSeeder(undefined, TenantPlan.TRIAL);
    await seeder.seedForTenant(TENANT);
    expect(prisma.tenantAiBudget.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ notes: 'plan:TRIAL' }),
    });

    const missing = makeSeeder(undefined);
    missing.prisma.tenant.findUnique.mockResolvedValue(null);
    await missing.seeder.seedForTenant(99);
    expect(missing.prisma.tenantAiBudget.create).not.toHaveBeenCalled();
    expect(missing.prisma.tenantAiBudget.updateMany).not.toHaveBeenCalled();
  });

  // An admin save can land between the ownership read and the write. The write only matches a row that still carries
  // the stamp, so the admin's caps win.
  it('leaves the row alone when an admin takes it over after the ownership read', async () => {
    const { seeder, prisma, cache } = makeSeeder('plan:TRIAL');
    prisma.tenantAiBudget.updateMany.mockResolvedValue({ count: 0 });
    await seeder.seedForPlan(TENANT, TenantPlan.ENTERPRISE);
    expect(prisma.tenantAiBudget.create).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('when a row appears between the read and the create, writes it only if it carries the stamp', async () => {
    const { seeder, prisma, cache } = makeSeeder(undefined);
    prisma.tenantAiBudget.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    prisma.tenantAiBudget.updateMany.mockResolvedValue({ count: 1 });
    await seeder.seedForPlan(TENANT, TenantPlan.TRIAL);
    expect(prisma.tenantAiBudget.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, notes: { startsWith: 'plan:' } },
      data: expect.objectContaining({ notes: 'plan:TRIAL' }),
    });
    expect(cache.del).toHaveBeenCalled();

    const adminRow = makeSeeder(undefined);
    adminRow.prisma.tenantAiBudget.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    adminRow.prisma.tenantAiBudget.updateMany.mockResolvedValue({ count: 0 });
    await adminRow.seeder.seedForPlan(TENANT, TenantPlan.TRIAL);
    expect(adminRow.cache.del).not.toHaveBeenCalled();
  });

  it('rethrows a create failure that is not the unique key', async () => {
    const { seeder, prisma } = makeSeeder(undefined);
    prisma.tenantAiBudget.create.mockRejectedValue(new Error('connection lost'));
    await expect(seeder.seedForPlan(TENANT, TenantPlan.TRIAL)).rejects.toThrow('connection lost');
    expect(prisma.tenantAiBudget.updateMany).not.toHaveBeenCalled();
  });

  describe('OpenRouter sub-key sync', () => {
    it('after a seed, pushes the new monthly hard cap to the workspace sub-key', async () => {
      const { seeder, provisioning } = makeSeeder('plan:TRIAL');
      await seeder.seedForPlan(TENANT, TenantPlan.ENTERPRISE);
      expect(provisioning.syncLimit).toHaveBeenCalledWith(TENANT, 1500);
      expect(provisioning.ensureSubKey).not.toHaveBeenCalled();
    });

    it('a new workspace on an absent row gets its key at the plan cap', async () => {
      const { seeder, provisioning } = makeSeeder(undefined);
      await seeder.seedForPlan(TENANT, TenantPlan.TRIAL);
      expect(provisioning.syncLimit).toHaveBeenCalledWith(TENANT, 25);
    });

    it('an admin-managed budget keeps its caps; only a missing key is created (at the admin cap)', async () => {
      const { seeder, provisioning } = makeSeeder('raised for the pilot');
      await seeder.seedForPlan(TENANT, TenantPlan.STARTER);
      expect(provisioning.syncLimit).not.toHaveBeenCalled();
      expect(provisioning.ensureSubKey).toHaveBeenCalledWith(TENANT);
    });

    it('a row taken over by an admin mid-seed is not synced to the plan cap', async () => {
      const { seeder, prisma, provisioning } = makeSeeder('plan:TRIAL');
      prisma.tenantAiBudget.updateMany.mockResolvedValue({ count: 0 });
      await seeder.seedForPlan(TENANT, TenantPlan.ENTERPRISE);
      expect(provisioning.syncLimit).not.toHaveBeenCalled();
      expect(provisioning.ensureSubKey).toHaveBeenCalledWith(TENANT);
    });

    it('a plan with no preset touches nothing at OpenRouter', async () => {
      const { seeder, provisioning } = makeSeeder(undefined);
      await seeder.seedForPlan(TENANT, 'UNKNOWN' as TenantPlan);
      expect(provisioning.syncLimit).not.toHaveBeenCalled();
      expect(provisioning.ensureSubKey).not.toHaveBeenCalled();
    });

    it('does not wait on OpenRouter: a slow sync never delays the seed', async () => {
      const { seeder, provisioning } = makeSeeder(undefined);
      provisioning.syncLimit.mockReturnValue(new Promise(() => undefined));
      await expect(seeder.seedForPlan(TENANT, TenantPlan.TRIAL)).resolves.toBeUndefined();
    });
  });

  it('has a preset for every plan, and STARTER matches the schema defaults', () => {
    for (const plan of Object.values(TenantPlan)) expect(PLAN_AI_BUDGETS[plan]).toBeDefined();
    expect(PLAN_AI_BUDGETS[TenantPlan.STARTER]).toEqual({
      dailySoftUsd: '5',
      dailyHardUsd: '20',
      monthlySoftUsd: '50',
      monthlyHardUsd: '200',
    });
  });
});
