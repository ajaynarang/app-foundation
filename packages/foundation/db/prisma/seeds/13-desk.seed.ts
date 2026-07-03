import type { PrismaClient } from '../../generated/client';

/**
 * Desk seed — generic, domain-free starter.
 *
 * Seeds one example AI agent and one example responsibility per active
 * tenant so the Desk surface has something to render. The responsibility is
 * COMING_SOON and not autonomous by default — it is a placeholder for teams
 * to replace with their own workflows.
 *
 * Idempotent: upserts by the unique (tenantId, key) constraints. Safe to run
 * repeatedly. Respects tenant-set trust/conditions on update.
 */

const EXAMPLE_AGENT = {
  key: 'assistant',
  name: 'Assistant',
  systemPromptKey: 'desk.agent.assistant.v1',
  description: 'A general-purpose AI agent that can run automated workspace workflows.',
};

const EXAMPLE_RESPONSIBILITY = {
  key: 'example-workflow',
  title: 'Example Workflow',
  description: 'A placeholder responsibility. Replace it with your own automated workflow.',
};

export const seed = {
  name: 'Desk: example agent + responsibility per tenant',
  description:
    'Idempotent upsert of one example agent and one COMING_SOON responsibility per active tenant. Respects tenant-set trust/conditions on update.',

  async run(prisma: PrismaClient): Promise<{
    tenantsProcessed: number;
    agentsUpserted: number;
    responsibilitiesUpserted: number;
  }> {
    const tenants = await prisma.tenant.findMany({
      where: { status: { in: ['ACTIVE', 'PENDING_APPROVAL'] } },
      select: { id: true },
    });

    let agentsUpserted = 0;
    let responsibilitiesUpserted = 0;

    for (const tenant of tenants) {
      const agent = await prisma.deskAgent.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: EXAMPLE_AGENT.key } },
        update: {
          name: EXAMPLE_AGENT.name,
          description: EXAMPLE_AGENT.description,
          systemPromptKey: EXAMPLE_AGENT.systemPromptKey,
        },
        create: {
          tenantId: tenant.id,
          key: EXAMPLE_AGENT.key,
          name: EXAMPLE_AGENT.name,
          description: EXAMPLE_AGENT.description,
          systemPromptKey: EXAMPLE_AGENT.systemPromptKey,
        },
      });
      agentsUpserted++;

      await prisma.deskResponsibility.upsert({
        where: { tenantId_key: { tenantId: tenant.id, key: EXAMPLE_RESPONSIBILITY.key } },
        // Do not overwrite tenant-set policy (trustLevel/conditions/enabled) on update.
        update: {
          title: EXAMPLE_RESPONSIBILITY.title,
          description: EXAMPLE_RESPONSIBILITY.description,
          agentId: agent.id,
        },
        create: {
          tenantId: tenant.id,
          agentId: agent.id,
          key: EXAMPLE_RESPONSIBILITY.key,
          title: EXAMPLE_RESPONSIBILITY.title,
          description: EXAMPLE_RESPONSIBILITY.description,
          lifecycle: 'COMING_SOON',
        },
      });
      responsibilitiesUpserted++;
    }

    return {
      tenantsProcessed: tenants.length,
      agentsUpserted,
      responsibilitiesUpserted,
    };
  },
};
