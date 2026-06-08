import { type Prisma, type PrismaClient, UserRole } from '@prisma/client';

import { RESPONSIBILITY_REGISTRY } from './index';

/**
 * 12 AI personas ("agents"). Mirrors AGENT_KEYS in shared-types/desk/enums.
 * System-prompt keys follow the DESK_<ROLE>_SYSTEM naming used by
 * PromptingService; the registrar (P1.10) supplies the fallback content.
 */
const AGENT_SEED: Array<{ key: string; name: string; systemPromptKey: string; description: string }> = [
  {
    key: 'sally-dispatch',
    name: 'Dispatch',
    systemPromptKey: 'desk.agent.dispatch.v1',
    description: 'Picks the best driver for new loads and watches late ETAs before they become problems.',
  },
  {
    key: 'sally-billing',
    name: 'Billing',
    systemPromptKey: 'desk.agent.billing.v1',
    description:
      'Keeps invoices moving — nudges overdue customers, handles close-out review, flags anything unusual for approval.',
  },
  {
    key: 'sally-payroll',
    name: 'Payroll',
    systemPromptKey: 'desk.agent.payroll.v1',
    description: 'Runs driver settlements with pay precision over speed — zero silent edits.',
  },
  {
    key: 'sally-compliance',
    name: 'Compliance',
    systemPromptKey: 'desk.agent.compliance.v1',
    description: 'Watches DOT, HOS and safety risk — risk-averse by default, escalates anything borderline.',
  },
  {
    key: 'sally-safety',
    name: 'Safety',
    systemPromptKey: 'desk.agent.safety.v1',
    description: 'Keeps the safety culture honest — facts first, blame last, always traceable.',
  },
  {
    key: 'sally-maintenance',
    name: 'Maintenance',
    systemPromptKey: 'desk.agent.maintenance.v1',
    description: 'Coordinates shop visits and PM around when drivers are actually home.',
  },
  {
    key: 'sally-fuel',
    name: 'Fuel',
    systemPromptKey: 'desk.agent.fuel.v1',
    description: 'Plans fuel stops and IFTA posture to find the cheapest legal gallon on each route.',
  },
  {
    key: 'sally-route',
    name: 'Route',
    systemPromptKey: 'desk.agent.route.v1',
    description: 'Plans HOS-aware routes and ETAs so drivers do not burn hours on avoidable detours.',
  },
  {
    key: 'sally-driver',
    name: 'Driver',
    systemPromptKey: 'desk.agent.driver.v1',
    description: 'Handles driver check-ins, day-of changes, and the small acknowledgements dispatchers forget.',
  },
  {
    key: 'sally-customer',
    name: 'Customer',
    systemPromptKey: 'desk.agent.customer.v1',
    description: 'Sends customer updates and confirmations at the exact moment they want them.',
  },
  {
    key: 'sally-support',
    name: 'Support',
    systemPromptKey: 'desk.agent.support.v1',
    description: 'Triages inbound tickets, answers what is obvious, and escalates what is not.',
  },
  {
    key: 'sally-prospect',
    name: 'Prospect',
    systemPromptKey: 'desk.agent.prospect.v1',
    description: 'Researches carriers and loads before outreach so the first email is informed.',
  },
];

/**
 * Idempotent seed of Desk agents + responsibilities for one tenant. Safe
 * to run repeatedly; upserts by the unique (tenantId, key) constraint.
 *
 * Called from:
 *   - platform seed (prisma/seeds/13-desk.seed.ts) on fresh install
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

  // 12 agents — upsert by (tenantId, key)
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

  // 10 responsibilities — upsert by (tenantId, key), respect tenant-set
  // trustLevel / conditions / notes / enabled / supervisor on update
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
        //   • notesForSally retired (2026-04-27) — operator free-form
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
