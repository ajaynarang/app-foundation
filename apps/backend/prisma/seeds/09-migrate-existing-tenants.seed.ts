import { PrismaClient, TenantPlan } from '@prisma/client';
import { generateUuidV7 } from '../../src/shared/utils/uuidv7';

export const seed = {
  name: 'Migrate Existing Tenants to Enterprise',
  description: 'Assigns ENTERPRISE plan to all existing tenants and creates audit events',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    // Find all tenants that don't have a plan assigned yet (planAssignedAt is null)
    const existingTenants = await prisma.tenant.findMany({
      where: { planAssignedAt: null },
      select: { id: true, tenantId: true, plan: true },
    });

    if (existingTenants.length === 0) {
      return { created: 0, skipped: 0 };
    }

    const now = new Date();

    for (const tenant of existingTenants) {
      await prisma.$transaction([
        prisma.tenant.update({
          where: { tenantId: tenant.tenantId },
          data: {
            plan: TenantPlan.ENTERPRISE,
            planAssignedAt: now,
            planAssignedBy: 'system-migration',
            trialStartedAt: now,
            trialEndsAt: null, // No trial expiry for migrated tenants
          },
        }),
        prisma.tenantPlanEvent.create({
          data: {
            id: generateUuidV7(),
            tenantId: tenant.id,
            fromPlan: null,
            toPlan: TenantPlan.ENTERPRISE,
            changedBy: 'system-migration',
            reason: 'Migrated existing tenant to Enterprise — initial tier assignment',
            createdAt: now,
          },
        }),
      ]);
    }

    return { created: existingTenants.length, skipped: 0 };
  },
};
