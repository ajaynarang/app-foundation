import type { PrismaClient } from '@prisma/client';

import { bootstrapDeskForTenant } from '../../src/domains/desk/responsibilities/bootstrap-desk-for-tenant';

export const seed = {
  name: 'Desk: 12 AI agents + 10 responsibilities per tenant',
  description:
    'Idempotent upsert. ar_followup + closeout_review seeded AVAILABLE; 8 others COMING_SOON. Respects tenant-set trust/conditions/notes on update.',

  async run(prisma: PrismaClient): Promise<{
    tenantsProcessed: number;
    agentsUpserted: number;
    responsibilitiesUpserted: number;
  }> {
    const tenants = await prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      select: { id: true, tenantId: true, companyName: true },
    });

    let agentsUpserted = 0;
    let responsibilitiesUpserted = 0;

    for (const tenant of tenants) {
      const result = await bootstrapDeskForTenant(prisma, tenant.id);
      agentsUpserted += result.agentsUpserted;
      responsibilitiesUpserted += result.responsibilitiesUpserted;
    }

    return {
      tenantsProcessed: tenants.length,
      agentsUpserted,
      responsibilitiesUpserted,
    };
  },
};
