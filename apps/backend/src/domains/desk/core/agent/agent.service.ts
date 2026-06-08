import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import {
  OPEN_EPISODE_STATUSES,
  type AgentActivityStats,
  type AgentActivityWindow,
  type AgentDetail,
  type AgentKey,
  type AgentRosterItem,
  type EligibleSupervisor,
  type ResponsibilityHeld,
  type UpdateAgentRequest,
} from '@sally/shared-types';

import { CACHE_TTL_HOT_60S, CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RESPONSIBILITY_REGISTRY } from '../../responsibilities';

type SupervisorRoleRow = { role: UserRole };

const SUPERVISOR_ELIGIBLE_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.DISPATCHER];

/**
 * Reads + mutates the agent roster. Agents themselves carry one real piece
 * of config — the supervisor user. "Enable an agent" is still a convenience
 * that bulk-toggles every responsibility the agent owns.
 *
 * All rollup numbers are derived from responsibility rows + episodes +
 * approvals. We never store counts on DeskAgent.
 */
@Injectable()
export class DeskAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  // ─── Roster ────────────────────────────────────────────────────────────

  /**
   * Roster for the Crew tab. One row per DeskAgent for this tenant,
   * enriched with rollup counts + supervisor join. Registry order.
   */
  async listForTenant(tenantId: number): Promise<AgentRosterItem[]> {
    type AgentRow = {
      id: number;
      key: string;
      name: string;
      description: string | null;
      supervisor: {
        id: number;
        firstName: string;
        lastName: string;
        role: UserRole;
      } | null;
      responsibilities: Array<{
        id: number;
        lifecycle: 'AVAILABLE' | 'COMING_SOON';
        enabled: boolean;
        lastRunAt: Date | null;
      }>;
    };
    const agents = (await this.prisma.deskAgent.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        supervisor: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        responsibilities: {
          select: {
            id: true,
            lifecycle: true,
            enabled: true,
            lastRunAt: true,
          },
        },
      },
    })) as AgentRow[];

    const responsibilityIds = agents.flatMap((a) => a.responsibilities.map((r) => r.id));
    const { openByResp, pendingByResp } = await this.fetchRollups(responsibilityIds);

    const agentsByKey = new Map(agents.map((a) => [a.key, a]));
    // Registry-ordered keys first (agents that own a responsibility), then
    // any remaining seeded agents in insertion order. Every seeded agent
    // shows on Crew — agents with zero responsibilities simply rollup to
    // "coming soon" with 0 counts until their registry entries ship.
    const registryKeys: string[] = Array.from(new Set(RESPONSIBILITY_REGISTRY.map((r) => r.agentKey as string)));
    const seededKeys: string[] = agents.map((a) => a.key);
    const orderedKeys: string[] = [
      ...registryKeys.filter((k) => agentsByKey.has(k)),
      ...seededKeys.filter((k) => !registryKeys.includes(k)),
    ];

    return orderedKeys.map((k) => {
      const agent = agentsByKey.get(k);
      return {
        key: agent.key as AgentKey,
        name: agent.name,
        description: agent.description,
        supervisor: agent.supervisor
          ? {
              id: agent.supervisor.id,
              firstName: agent.supervisor.firstName,
              lastName: agent.supervisor.lastName,
              role: agent.supervisor.role,
            }
          : null,
        ...this.rollupRow(agent.responsibilities, openByResp, pendingByResp),
      };
    });
  }

  // ─── Detail (sheet header) ─────────────────────────────────────────────

  /**
   * Detail for the rewritten agent sheet. Superset of roster item with
   * responsibilities + persona first line.
   */
  async getDetailForTenant(tenantId: number, key: string): Promise<AgentDetail> {
    const agent = await this.prisma.deskAgent.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        supervisor: {
          select: { id: true, firstName: true, lastName: true, role: true },
        },
        responsibilities: {
          select: {
            key: true,
            lifecycle: true,
            enabled: true,
            trustLevel: true,
          },
        },
      },
    });
    if (!agent) throw new NotFoundException(`Agent ${key} not found`);

    const responsibilities: ResponsibilityHeld[] = agent.responsibilities.map((r) => {
      const def = RESPONSIBILITY_REGISTRY.find((d) => d.key === r.key);
      return {
        key: r.key,
        title: def?.title ?? r.key,
        description: def?.description ?? null,
        trustLevel: r.trustLevel,
        lifecycle: r.lifecycle,
        enabled: r.enabled,
      };
    });

    const isActive = agent.responsibilities.some((r) => r.enabled && r.lifecycle === 'AVAILABLE');

    return {
      key: agent.key as AgentKey,
      name: agent.name,
      description: agent.description,
      isActive,
      supervisor: agent.supervisor
        ? {
            id: agent.supervisor.id,
            firstName: agent.supervisor.firstName,
            lastName: agent.supervisor.lastName,
            role: agent.supervisor.role,
          }
        : null,
      responsibilities,
    };
  }

  // ─── Update (bulk enable + supervisor) ────────────────────────────────

  /**
   * PATCH /desk/agents/:key. Accepts `enabled` (bulk-toggle AVAILABLE
   * responsibilities) and/or `supervisorUserId` (rebind agent supervisor).
   */
  async updateAgent(
    tenantId: number,
    agentKey: string,
    patch: UpdateAgentRequest,
  ): Promise<{ updatedResponsibilityCount: number; supervisorUpdated: boolean }> {
    const agent = await this.prisma.deskAgent.findUnique({
      where: { tenantId_key: { tenantId, key: agentKey } },
      select: { id: true },
    });
    if (!agent) throw new NotFoundException(`Agent ${agentKey} not found`);

    let updatedResponsibilityCount = 0;
    let supervisorUpdated = false;

    if (patch.supervisorUserId !== undefined) {
      if (patch.supervisorUserId !== null) {
        await this.assertEligibleSupervisor(tenantId, patch.supervisorUserId);
      }
      await this.prisma.deskAgent.update({
        where: { id: agent.id },
        data: { supervisorUserId: patch.supervisorUserId },
      });
      supervisorUpdated = true;
    }

    if (patch.enabled !== undefined) {
      const result = await this.prisma.deskResponsibility.updateMany({
        where: { agentId: agent.id, lifecycle: 'AVAILABLE' },
        data: { enabled: patch.enabled },
      });
      updatedResponsibilityCount = result.count;
    }

    // Invalidate caches dependent on this agent.
    await this.cache.del(buildKey('sally:desk', 'eligible-supervisors', tenantId));
    return { updatedResponsibilityCount, supervisorUpdated };
  }

  /**
   * Bulk toggle — retained for existing callers. Equivalent to
   * `updateAgent` with only `enabled` set. Prefer `updateAgent` in new
   * code; this method will be folded in a follow-up PR.
   */
  async bulkSetEnabled(
    tenantId: number,
    agentKey: string,
    patch: { enabled: boolean },
  ): Promise<{ updatedCount: number }> {
    const result = await this.updateAgent(tenantId, agentKey, { enabled: patch.enabled });
    return { updatedCount: result.updatedResponsibilityCount };
  }

  // ─── Activity stats ───────────────────────────────────────────────────

  /**
   * Windowed activity counters — episodes + tool calls + approvals over
   * the requested window, plus lifetime lastActivityAt. Cached WARM.
   */
  async getActivity(tenantId: number, agentKey: string, window: AgentActivityWindow): Promise<AgentActivityStats> {
    const cacheKey = buildKey('sally:desk', 'agent-activity', tenantId, agentKey, window);
    return this.cache.getOrSet(cacheKey, () => this.computeActivity(tenantId, agentKey, window), CACHE_TTL_WARM_5M);
  }

  private async computeActivity(
    tenantId: number,
    agentKey: string,
    window: AgentActivityWindow,
  ): Promise<AgentActivityStats> {
    const agent = await this.prisma.deskAgent.findUnique({
      where: { tenantId_key: { tenantId, key: agentKey } },
      select: { id: true, responsibilities: { select: { id: true } } },
    });
    if (!agent) throw new NotFoundException(`Agent ${agentKey} not found`);

    const { start, end } = resolveWindow(window);
    // Principal audit IDs: `desk:<responsibilityId>` (see fromDeskResponsibility).
    const principalAuditIds = agent.responsibilities.map((r) => `desk:${r.id}`);

    const [episodeCount, toolCallCount, approvalCount, lastEpisode] = await Promise.all([
      this.prisma.deskEpisode.count({
        where: {
          tenantId,
          ownerAgentId: agent.id,
          openedAt: { gte: start, lt: end },
        },
      }),
      principalAuditIds.length > 0
        ? this.prisma.agentInvocationLog.count({
            where: {
              tenantId,
              principalKind: 'desk_responsibility',
              principalId: { in: principalAuditIds },
              createdAt: { gte: start, lt: end },
            },
          })
        : Promise.resolve(0),
      this.prisma.deskApproval.count({
        where: {
          episode: { tenantId, ownerAgentId: agent.id },
          decidedAt: { gte: start, lt: end },
        },
      }),
      this.prisma.deskEpisode.findFirst({
        where: { tenantId, ownerAgentId: agent.id },
        orderBy: { openedAt: 'desc' },
        select: { openedAt: true },
      }),
    ]);

    return {
      episodeCount,
      toolCallCount,
      approvalCount,
      lastActivityAt: lastEpisode?.openedAt.toISOString() ?? null,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
    };
  }

  // ─── Eligible supervisors ─────────────────────────────────────────────

  /**
   * Users in this tenant eligible to supervise an agent — OWNER/ADMIN/
   * DISPATCHER, excluding drivers, customers, and deactivated users.
   */
  async listEligibleSupervisors(tenantId: number): Promise<EligibleSupervisor[]> {
    const cacheKey = buildKey('sally:desk', 'eligible-supervisors', tenantId);
    return this.cache.getOrSet(cacheKey, () => this.fetchEligibleSupervisors(tenantId), CACHE_TTL_HOT_60S);
  }

  private async fetchEligibleSupervisors(tenantId: number): Promise<EligibleSupervisor[]> {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        deletedAt: null,
        role: { in: SUPERVISOR_ELIGIBLE_ROLES as UserRole[] },
      },
      select: { id: true, firstName: true, lastName: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return users.map((u) => ({
      id: u.id,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
    }));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private async fetchRollups(responsibilityIds: number[]): Promise<{
    openByResp: Map<number, number>;
    pendingByResp: Map<number, number>;
  }> {
    if (responsibilityIds.length === 0) {
      return { openByResp: new Map(), pendingByResp: new Map() };
    }
    const [openByResp, pendingByResp] = (await Promise.all([
      this.prisma.deskEpisode.groupBy({
        by: ['responsibilityId'],
        where: {
          responsibilityId: { in: responsibilityIds },
          status: { in: [...OPEN_EPISODE_STATUSES] },
        },
        _count: { _all: true },
      }),
      this.prisma.deskApproval.findMany({
        where: {
          decision: null,
          episode: { responsibilityId: { in: responsibilityIds } },
        },
        select: { episode: { select: { responsibilityId: true } } },
      }),
    ])) as [
      Array<{ responsibilityId: number; _count: { _all: number } }>,
      Array<{ episode: { responsibilityId: number } }>,
    ];

    const openMap = new Map(openByResp.map((g) => [g.responsibilityId, g._count._all]));
    const pendingMap = new Map<number, number>();
    for (const a of pendingByResp) {
      const rid = a.episode.responsibilityId;
      pendingMap.set(rid, (pendingMap.get(rid) ?? 0) + 1);
    }
    return { openByResp: openMap, pendingByResp: pendingMap };
  }

  private rollupRow(
    responsibilities: Array<{
      id: number;
      lifecycle: 'AVAILABLE' | 'COMING_SOON';
      enabled: boolean;
      lastRunAt: Date | null;
    }>,
    openByResp: Map<number, number>,
    pendingByResp: Map<number, number>,
  ): Omit<AgentRosterItem, 'key' | 'name' | 'description' | 'supervisor'> {
    let available = 0;
    let comingSoon = 0;
    let openEpisodes = 0;
    let pending = 0;
    let lastRunAt: Date | null = null;
    let anyEnabled = false;

    for (const r of responsibilities) {
      if (r.lifecycle === 'COMING_SOON') comingSoon++;
      else available++;
      if (r.enabled && r.lifecycle === 'AVAILABLE') anyEnabled = true;
      openEpisodes += openByResp.get(r.id) ?? 0;
      pending += pendingByResp.get(r.id) ?? 0;
      if (r.lastRunAt && (!lastRunAt || r.lastRunAt > lastRunAt)) {
        lastRunAt = r.lastRunAt;
      }
    }
    return {
      isActive: anyEnabled,
      availableResponsibilityCount: available,
      comingSoonResponsibilityCount: comingSoon,
      openEpisodeCount: openEpisodes,
      pendingApprovalCount: pending,
      lastRunAt: lastRunAt?.toISOString() ?? null,
    };
  }

  private async assertEligibleSupervisor(tenantId: number, userId: number): Promise<void> {
    const user = (await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true, deletedAt: null },
      select: { role: true },
    })) as SupervisorRoleRow | null;
    if (!user) throw new BadRequestException('Selected user is not part of this tenant');
    if (!SUPERVISOR_ELIGIBLE_ROLES.includes(user.role)) {
      throw new BadRequestException('Selected user is not eligible to supervise an agent');
    }
  }
}

// ─── Module-level pure helpers ──────────────────────────────────────────

const WINDOW_MS: Record<AgentActivityWindow, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function resolveWindow(window: AgentActivityWindow): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_MS[window]);
  return { start, end };
}
