import { type Prisma, type PrismaClient, UserRole } from '@appshore/db';

import { RESPONSIBILITY_REGISTRY } from './index';

/**
 * Desk agents ("personas"). The starter seeds ONE generic `assistant` agent.
 * System-prompt keys follow the `desk.agent.<key>.v1` naming used by
 * PromptingService; DeskPromptRegistrar supplies the fallback content.
 *
 * Add more agents here (and a matching `agentKey` on your responsibilities in
 * `responsibilities/index.ts`) as you build out the Desk.
 */
const AGENT_SEED: Array<{ key: string; name: string; systemPromptKey: string; description: string }> = [
  {
    key: 'assistant',
    name: 'Assistant',
    systemPromptKey: 'desk.agent.assistant.v1',
    description: 'The generic Desk assistant. Owns responsibilities, proposes actions, and respects approval gates.',
  },
];

/**
 * Idempotent seed of Desk agents + responsibilities for one tenant. Safe
 * to run repeatedly; upserts by the unique (tenantId, key) constraint.
 *
 * Called from:
 *   - platform seed (packages/foundation/db/prisma/seeds/07-desk.seed.ts) on fresh install
 *   - tenant onboarding flow (future) after a new tenant is approved
 */
export async function bootstrapDeskForTenant(
  prisma: PrismaClient,
  tenantId: number,
): Promise<{ agentsUpserted: number; responsibilitiesUpserted: number; supervisorBackfilled: number }> {
  let agentsUpserted = 0;
  let responsibilitiesUpserted = 0;

  // Default supervisor is the tenant's OWNER. Every tenant has exactly one
  // OWNER (created at registration, cannot be deleted — see User.role
  // comment in schema.prisma), so this is safe and deterministic. Falls
  // through to null only in pathological cases (e.g. a tenant approved
  // before its owner row existed); the trigger-layer 'no_supervisor'
  // gate covers those.
  const defaultSupervisor = await prisma.user.findFirst({
    where: { tenantId, role: UserRole.OWNER },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  const defaultSupervisorUserId = defaultSupervisor?.id ?? null;

  // Agents — upsert by (tenantId, key)
  for (const a of AGENT_SEED) {
    await prisma.deskAgent.upsert({
      where: { tenantId_key: { tenantId, key: a.key } },
      create: {
        tenantId,
        key: a.key,
        name: a.name,
        description: a.description,
        systemPromptKey: a.systemPromptKey,
        isActive: true,
        // New agents get the OWNER as supervisor by default. Admin can
        // re-assign later via PATCH /desk/agents/:key.
        supervisorUserId: defaultSupervisorUserId,
      },
      update: {
        // Update metadata + force isActive=true on every bootstrap. There
        // is currently no admin UI or code path that sets
        // DeskAgent.isActive = false — so "preserving" it was protecting
        // a theoretical future use case at the cost of a real bug today
        // (the /desk/agents filter uses isActive, so a stale false row
        // hides the agent entirely from the Crew tab). If we ship an
        // admin pause-agent UI later, give it a different column
        // (e.g. `pausedAt: timestamp`) so seed + admin-disable don't
        // fight each other.
        //
        // `description` is product copy — intentionally overwritten on
        // every bootstrap so tenants pick up copy changes without a data
        // migration.
        name: a.name,
        description: a.description,
        systemPromptKey: a.systemPromptKey,
        isActive: true,
      },
    });
    agentsUpserted++;
  }

  // Responsibilities — upsert by (tenantId, key), respect tenant-set
  // trustLevel / conditions / enabled / supervisor on update
  for (const def of RESPONSIBILITY_REGISTRY) {
    const agent = await prisma.deskAgent.findUniqueOrThrow({
      where: { tenantId_key: { tenantId, key: def.agentKey } },
      select: { id: true },
    });

    await prisma.deskResponsibility.upsert({
      where: { tenantId_key: { tenantId, key: def.key } },
      create: {
        tenantId,
        agentId: agent.id,
        key: def.key,
        title: def.title,
        description: def.description,
        lifecycle: def.lifecycle,
        enabled: def.lifecycle === 'AVAILABLE',
        trustLevel: def.defaults.trustLevel,
        conditions: def.defaults.conditions as Prisma.InputJsonValue,
      },
      update: {
        // Update ONLY metadata that should track code changes —
        // title/description/lifecycle. Leave tenant policy alone:
        //   • trustLevel, conditions, enabled → all tenant-editable,
        //     seeds never touch on update.
        //   • supervisor is on DeskAgent now (lifted 2026-04-23),
        //     not per-responsibility.
        //   • notesForAssistant retired (2026-04-27) — operator free-form
        //     rules now live as playbook memories.
        title: def.title,
        description: def.description,
        lifecycle: def.lifecycle,
        agentId: agent.id,
      },
    });
    responsibilitiesUpserted++;
  }

  // Backfill: existing agents seeded before this defaulting was added
  // shipped with supervisorUserId = null. Set them to the OWNER on next
  // bootstrap sweep ONLY when the column is still null — never clobber
  // an admin-assigned supervisor (which is the whole point of the
  // tenantId_key upsert's update branch leaving supervisor alone).
  let supervisorBackfilled = 0;
  if (defaultSupervisorUserId !== null) {
    const result = await prisma.deskAgent.updateMany({
      where: { tenantId, supervisorUserId: null },
      data: { supervisorUserId: defaultSupervisorUserId },
    });
    supervisorBackfilled = result.count;
  }

  return { agentsUpserted, responsibilitiesUpserted, supervisorBackfilled };
}
