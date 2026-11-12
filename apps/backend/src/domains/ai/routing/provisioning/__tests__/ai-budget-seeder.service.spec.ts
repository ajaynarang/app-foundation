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
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const cache = { del: jest.fn().mockResolvedValue(undefined) };
  return { seeder: new AiBudgetSeederService(prisma as never, cache as never), prisma, cache };
}

describe('AiBudgetSeederService', () => {
  it('seeds an absent row with the plan preset, stamps notes and drops the cached budget', async () => {
    const { seeder, prisma, cache } = makeSeeder(undefined);
    await seeder.seedForPlan(TENANT, TenantPlan.PROFESSIONAL);
    expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT },
        create: expect.objectContaining({ monthlyHardUsd: '500', notes: 'plan:PROFESSIONAL' }),
      }),
    );
    expect(cache.del).toHaveBeenCalledWith('app:ai-telemetry:budget:7');
  });

  it('reseeds a row it stamped before (a plan change)', async () => {
    const { seeder, prisma } = makeSeeder('plan:TRIAL');
    await seeder.seedForPlan(TENANT, TenantPlan.ENTERPRISE);
    expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ notes: 'plan:ENTERPRISE', monthlyHardUsd: '1500' }),
      }),
    );
  });

  it('reseeds a lazily created default row (plan:DEFAULT)', async () => {
    const { seeder, prisma } = makeSeeder(BUDGET_SEED_NOTE_DEFAULT);
    await seeder.seedForPlan(TENANT, TenantPlan.TRIAL);
    expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ notes: 'plan:TRIAL', monthlyHardUsd: '25' }) }),
    );
  });

  it('never touches an admin-managed row (a note without the stamp)', async () => {
    const { seeder, prisma, cache } = makeSeeder('raised for the pilot');
    await seeder.seedForPlan(TENANT, TenantPlan.STARTER);
    expect(prisma.tenantAiBudget.upsert).not.toHaveBeenCalled();
    expect(cache.del).not.toHaveBeenCalled();
  });

  it('a row with no note is admin-owned too (an admin cleared it)', async () => {
    const { seeder, prisma } = makeSeeder(null);
    await seeder.seedForPlan(TENANT, TenantPlan.STARTER);
    expect(prisma.tenantAiBudget.upsert).not.toHaveBeenCalled();
  });

  it('seedForTenant reads the workspace plan; a missing workspace is a no-op', async () => {
    const { seeder, prisma } = makeSeeder(undefined, TenantPlan.TRIAL);
    await seeder.seedForTenant(TENANT);
    expect(prisma.tenantAiBudget.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ notes: 'plan:TRIAL' }) }),
    );

    const missing = makeSeeder(undefined);
    missing.prisma.tenant.findUnique.mockResolvedValue(null);
    await missing.seeder.seedForTenant(99);
    expect(missing.prisma.tenantAiBudget.upsert).not.toHaveBeenCalled();
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
