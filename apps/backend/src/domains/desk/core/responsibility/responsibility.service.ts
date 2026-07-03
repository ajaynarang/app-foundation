import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Lifecycle, type Prisma } from '@appshore/db';
import {
  OPEN_EPISODE_STATUSES,
  type DeskResponsibilityDetail,
  type DeskResponsibilityListItem,
  type UpdateDeskResponsibilityRequest,
} from '../types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { findResponsibilityDefinition, RESPONSIBILITY_REGISTRY } from '../../responsibilities';
import type { ResponsibilityDefinition } from '../../responsibilities/definition.types';

/**
 * Reads + updates per-tenant DeskResponsibility rows, enriched with
 * registry metadata (title/description/lifecycle) and rollup counts.
 *
 * Source of truth split:
 *   - Code (RESPONSIBILITY_REGISTRY) — title, description, lifecycle,
 *     conditionsSchema/UI, defaults, triggers, tools
 *   - DB (desk_responsibilities) — per-tenant enabled/trustLevel/
 *     conditions
 *   - Free-form operator rules — DeskMemory (scope=PLAYBOOK,
 *     authoredByUserId NOT NULL); see DeskMemoryService / Rules tab.
 *   - Supervisor is an agent-level concern — see DeskAgentService.
 * Join point: `key` (string).
 */
@Injectable()
export class DeskResponsibilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all responsibilities for the tenant. Returns one row per entry
   * in RESPONSIBILITY_REGISTRY — tenants always see all 10, with
   * COMING_SOON ones marked via `lifecycle`.
   */
  async listForTenant(tenantId: number): Promise<DeskResponsibilityListItem[]> {
    type Row = {
      id: number;
      key: string;
      lifecycle: DeskResponsibilityListItem['lifecycle'];
      enabled: boolean;
      autonomyEnabled: boolean;
      trustLevel: DeskResponsibilityListItem['trustLevel'];
      lastRunAt: Date | null;
    };
    const rows = (await this.prisma.deskResponsibility.findMany({
      where: { tenantId },
      select: {
        id: true,
        key: true,
        lifecycle: true,
        enabled: true,
        autonomyEnabled: true,
        trustLevel: true,
        lastRunAt: true,
      },
    })) as Row[];
    const byKey = new Map(rows.map((r) => [r.key, r]));

    // One aggregated query per rollup so we don't fan-out 10×.
    const responsibilityIds = rows.map((r) => r.id);
    const [openCounts, pendingCounts] = (await Promise.all([
      this.prisma.deskEpisode.groupBy({
        by: ['responsibilityId'],
        where: {
          responsibilityId: { in: responsibilityIds },
          status: { in: [...OPEN_EPISODE_STATUSES] },
        },
        _count: { _all: true },
      }),
      // Approvals don't carry responsibilityId — join through episode.
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

    const openByResp = new Map(openCounts.map((g) => [g.responsibilityId, g._count._all]));
    const pendingByResp = new Map<number, number>();
    for (const a of pendingCounts) {
      const rid = a.episode.responsibilityId;
      pendingByResp.set(rid, (pendingByResp.get(rid) ?? 0) + 1);
    }

    return RESPONSIBILITY_REGISTRY.map((def) => {
      const row = byKey.get(def.key);
      return {
        key: def.key,
        agentKey: def.agentKey,
        title: def.title,
        description: def.description,
        lifecycle: row?.lifecycle ?? def.lifecycle,
        enabled: row?.enabled ?? false,
        autonomyEnabled: row?.autonomyEnabled ?? false,
        trustLevel: row?.trustLevel ?? def.defaults.trustLevel,
        openEpisodeCount: row ? (openByResp.get(row.id) ?? 0) : 0,
        pendingApprovalCount: row ? (pendingByResp.get(row.id) ?? 0) : 0,
        lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      };
    });
  }

  /**
   * Full detail for one responsibility — adds conditions to the list
   * shape. Supervisor is agent-level — fetch via DeskAgentService.
   * Free-form operator guidance previously stored on `notesForAssistant` now
   * lives as operator-authored playbook memories — see DeskMemoryService.
   */
  async getForTenant(tenantId: number, key: string): Promise<DeskResponsibilityDetail> {
    const def = this.requireDefinition(key);
    const row = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: {
        id: true,
        key: true,
        lifecycle: true,
        enabled: true,
        autonomyEnabled: true,
        trustLevel: true,
        conditions: true,
        lastRunAt: true,
      },
    });
    if (!row) {
      throw new NotFoundException(`Responsibility ${key} not seeded for this tenant`);
    }

    const [openEpisodeCount, pendingApprovalCount] = await Promise.all([
      this.prisma.deskEpisode.count({
        where: {
          responsibilityId: row.id,
          status: { in: [...OPEN_EPISODE_STATUSES] },
        },
      }),
      this.prisma.deskApproval.count({
        where: { decision: null, episode: { responsibilityId: row.id } },
      }),
    ]);

    return {
      key: def.key,
      agentKey: def.agentKey,
      title: def.title,
      description: def.description,
      lifecycle: row.lifecycle,
      enabled: row.enabled,
      autonomyEnabled: row.autonomyEnabled,
      trustLevel: row.trustLevel,
      openEpisodeCount,
      pendingApprovalCount,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      conditions: (row.conditions as Record<string, unknown>) ?? {},
    };
  }

  /**
   * Patch the per-tenant row. Validates `conditions` against the
   * registry Zod schema if provided. Rejects any write to a COMING_SOON
   * responsibility except toggling `enabled` — mirrors design-doc §6.2
   * (stubs are read-only until promoted).
   */
  async updateForTenant(
    tenantId: number,
    key: string,
    patch: UpdateDeskResponsibilityRequest,
  ): Promise<DeskResponsibilityDetail> {
    const def = this.requireDefinition(key);
    const row = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { id: true, lifecycle: true },
    });
    if (!row) {
      throw new NotFoundException(`Responsibility ${key} not seeded for this tenant`);
    }
    if (row.lifecycle === 'COMING_SOON') {
      throw new BadRequestException(`Responsibility ${key} is COMING_SOON — settings are read-only`);
    }

    // Validate conditions JSON against the registry schema so garbage
    // never lands in the row. Schema is authoritative — anything the UI
    // sends that doesn't match is 400.
    if (patch.conditions !== undefined) {
      if (!def.conditionsSchema) {
        throw new BadRequestException(`Responsibility ${key} has no conditions schema`);
      }
      const result = def.conditionsSchema.safeParse(patch.conditions);
      if (!result.success) {
        throw new BadRequestException({
          message: 'Invalid conditions',
          issues: result.error.issues,
        });
      }
    }

    const data: Prisma.DeskResponsibilityUncheckedUpdateInput = {};
    if (patch.enabled !== undefined) data.enabled = patch.enabled;
    if (patch.trustLevel !== undefined) data.trustLevel = patch.trustLevel;
    if (patch.conditions !== undefined) data.conditions = patch.conditions as Prisma.InputJsonValue;

    await this.prisma.deskResponsibility.update({
      where: { id: row.id },
      data,
    });

    return this.getForTenant(tenantId, key);
  }

  /**
   * Flip the per-responsibility autonomy switch. Separate from
   * {@link updateForTenant} so turning a responsibility loose on its own
   * (any non-manual trigger) is an explicit, single-purpose action.
   * Off-by-default; a fresh responsibility never runs autonomously until
   * this is set true (and the tenant master switch is on). COMING_SOON
   * responsibilities can't be armed — they have nothing shipped to run.
   */
  async setAutonomyEnabled(tenantId: number, key: string, autonomyEnabled: boolean): Promise<DeskResponsibilityDetail> {
    this.requireDefinition(key);
    const row = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { id: true, lifecycle: true },
    });
    if (!row) {
      throw new NotFoundException(`Responsibility ${key} not seeded for this tenant`);
    }
    if (row.lifecycle === 'COMING_SOON') {
      throw new BadRequestException(`Responsibility ${key} is COMING_SOON — it can't run automatically yet`);
    }

    await this.prisma.deskResponsibility.update({
      where: { id: row.id },
      data: { autonomyEnabled },
    });

    return this.getForTenant(tenantId, key);
  }

  /**
   * Canonical "may this responsibility run on its OWN?" guard.
   *
   * INVARIANT: every non-manual trigger path — the scheduler today, and any
   * future domain-event bridge or webhook entrypoint — MUST gate on this
   * before dispatching `TriggerService.runByKey`. It returns true ONLY when
   * ALL of these align:
   *   - tenant master switch on (`Tenant.deskScheduleEnabled`)
   *   - responsibility enabled for this tenant
   *   - per-responsibility autonomy armed (`autonomyEnabled`)
   *   - responsibility lifecycle === AVAILABLE
   *
   * The scheduler's per-responsibility query already encodes these gates
   * inline (filtering on the same four columns) for efficiency at fan-out;
   * this helper is the canonical check for non-query callers (e.g. an
   * event-driven bridge that holds a single tenant+key in hand). Manual
   * "Run now" never consults this — it must always work.
   */
  async canRunAutonomously(tenantId: number, key: string): Promise<boolean> {
    const [tenant, resp] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { deskScheduleEnabled: true },
      }),
      this.prisma.deskResponsibility.findUnique({
        where: { tenantId_key: { tenantId, key } },
        select: { enabled: true, autonomyEnabled: true, lifecycle: true },
      }),
    ]);

    return Boolean(
      tenant?.deskScheduleEnabled && resp?.enabled && resp.autonomyEnabled && resp.lifecycle === Lifecycle.AVAILABLE,
    );
  }

  private requireDefinition(key: string): ResponsibilityDefinition {
    const def = findResponsibilityDefinition(key);
    if (!def) throw new NotFoundException(`Unknown responsibility ${key}`);
    return def;
  }
}
