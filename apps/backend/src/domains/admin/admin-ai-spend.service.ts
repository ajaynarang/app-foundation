import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma, type AiSurface } from '@appshore/db';
import {
  buildCursorPage,
  clampCursorLimit,
  decodeCursor,
  encodeCursor,
  keysetWhere,
} from '@appshore/kernel/shared/utils/cursor-pagination';
import { escapeLike } from '@appshore/kernel/shared/utils/list-query';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { BUDGET_SEED_NOTE_DEFAULT, adminBudgetNote } from '../ai/routing/provisioning/plan-ai-budgets';
import { PLATFORM_PAID_SQL, payerOf } from '../ai/infrastructure/telemetry/platform-paid';
import type {
  AiSpendSummary,
  AiSpendTenantList,
  AiSpendTenantSummary,
  AiSpendSurfaceRow,
  AiSpendInvocationList,
  AiSpendInvocationItem,
  AiBudget,
  UpdateAiBudgetInput,
  AiCostVsQuota,
} from '@app/shared-types';

/** What `GET /admin/ai-spend/tenants` passes in, already parsed and validated at the controller. */
export interface AiSpendTenantListQuery {
  days: number;
  limit?: number;
  cursor?: string;
  q?: string;
}

/** What `GET /admin/ai-spend/tenants/:tenant_id/invocations` passes in. */
export interface AiSpendInvocationListQuery {
  tenantId: number;
  limit?: number;
  cursor?: string;
  surface?: AiSurface;
}

const INVOCATION_KEYSET = { field: 'createdAt', idField: 'id', kind: 'date', direction: 'desc' } as const;
const INVALID_CURSOR = 'This list position is no longer valid — reload the list';
/** A window total as Postgres prints a `numeric`: the only shape a cost cursor may carry. */
const DECIMAL = /^\d{1,12}(\.\d{1,12})?$/;

/**
 * Reads from the SQL views introduced by the AI Spend views migration:
 *   - vw_ai_cost_per_tenant   — home table totals + sparkline source
 *   - vw_ai_cost_daily        — per-surface drill-in
 *   - ai_invocations          — invocation list (no view; raw with cursor)
 *
 * All endpoints are super-admin scoped. Multi-tenant: no tenant filter on
 * the home view (we list every tenant); tenant-id is required on the
 * drill-in endpoints.
 *
 * Pagination on the invocation list uses keyset (createdAt + id) — offset
 * pagination falls apart on a high-volume ledger.
 *
 * Every cost figure comes with the part the platform paid (`platform_cost_usd`
 * in the views, `PLATFORM_PAID_SQL` on the ledger): a workspace on its own
 * credential pays its own provider, and only platform-paid cost counts toward
 * its AI budget.
 */
@Injectable()
export class AdminAiSpendService {
  private readonly logger = new Logger(AdminAiSpendService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────
  // Home — one row per tenant, last N days
  // ───────────────────────────────────────────────────────────────────────
  /**
   * One page of the tenants that spent in the window, highest spend first, the tenant's public id breaking
   * ties. The window totals are a SQL aggregate, so the keyset is spelled out in SQL. The sparkline and last
   * activity are read for the page's tenants only.
   *
   * The cursor is tagged with the window's first day (`2026-09-30.<cursor>`): a cursor from another `days`,
   * or from a walk that crossed UTC midnight (the window moved and every total with it), is a 400 that asks
   * for a reload, never a page that skips or repeats tenants. Within one window the totals stay live: today's
   * slice can grow between pages, and a tenant whose total rises past the cursor during a walk shows on
   * neither page of that walk. Accepted: the next load reads it.
   */
  async listTenants(query: AiSpendTenantListQuery): Promise<AiSpendTenantList> {
    const take = clampCursorLimit(query.limit);
    const since = startOfDayUtcDaysAgo(query.days);
    const tag = `${formatIsoDate(since)}.`;
    // Decoded before any query runs: a malformed (or other-window) cursor is a 400 and costs nothing.
    const after = query.cursor ? tenantKeyset(tag, query.cursor) : Prisma.empty;
    const search = query.q
      ? Prisma.sql`AND (t.company_name ILIKE ${`%${escapeLike(query.q)}%`} OR t.tenant_id ILIKE ${`%${escapeLike(query.q)}%`})`
      : Prisma.empty;
    const totals = Prisma.sql`
      WITH totals AS (
        SELECT v.tenant_id,
               SUM(v.total_cost_usd)    AS cost,
               SUM(v.platform_cost_usd) AS platform_cost,
               SUM(v.call_count)        AS calls,
               SUM(v.error_count)    AS errors
        FROM vw_ai_cost_per_tenant v
        WHERE v.day >= ${since}::date
        GROUP BY v.tenant_id
      )`;

    const [rows, counted] = await Promise.all([
      this.prisma.$queryRaw<TenantTotalsRaw[]>`
        ${totals}
        SELECT t.id AS tenant_id, t.tenant_id AS tenant_slug, t.company_name,
               totals.cost::text AS total_cost_usd, totals.platform_cost::text AS platform_cost_usd,
               totals.calls AS call_count, totals.errors AS error_count
        FROM totals JOIN tenants t ON t.id = totals.tenant_id
        WHERE TRUE ${search} ${after}
        ORDER BY totals.cost DESC, t.tenant_id ASC
        LIMIT ${take + 1}`,
      this.prisma.$queryRaw<Array<{ total: bigint }>>`
        ${totals}
        SELECT COUNT(*) AS total FROM totals JOIN tenants t ON t.id = totals.tenant_id
        WHERE TRUE ${search}`,
    ]);
    // The tiebreak is the tenant's public id: its numeric id may sit in the row, never in a cursor.
    const page = buildCursorPage(rows, take, (row) => `${tag}${encodeCursor(row.total_cost_usd, row.tenant_slug)}`);
    const items = await this.withTrend(page.items, since);
    return { items, nextCursor: page.nextCursor, total: Number(counted[0]?.total ?? 0) };
  }

  /** The window in one figure: what every tenant together spent, and how many spent anything. */
  async getSummary(opts: { days: number }): Promise<AiSpendSummary> {
    const since = startOfDayUtcDaysAgo(opts.days);
    const [row] = await this.prisma.$queryRaw<
      Array<{ total_cost_usd: string | null; platform_cost_usd: string | null; tenant_count: bigint | number }>
    >`
      SELECT SUM(total_cost_usd)::text AS total_cost_usd, SUM(platform_cost_usd)::text AS platform_cost_usd,
             COUNT(DISTINCT tenant_id) AS tenant_count
      FROM vw_ai_cost_per_tenant
      WHERE day >= ${since}::date`;
    return {
      windowCostUsd: row?.total_cost_usd ?? (0).toFixed(6),
      windowPlatformCostUsd: row?.platform_cost_usd ?? (0).toFixed(6),
      tenantCount: Number(row?.tenant_count ?? 0),
    };
  }

  /** Sparkline and last activity for the tenants on one page. */
  private async withTrend(rows: TenantTotalsRaw[], since: Date): Promise<AiSpendTenantSummary[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.tenant_id);
    const [daily, last] = await Promise.all([
      this.prisma.$queryRaw<DailySliceRaw[]>`
        SELECT tenant_id, day, total_cost_usd::text AS total_cost_usd
        FROM vw_ai_cost_per_tenant
        WHERE day >= ${since}::date AND tenant_id IN (${Prisma.join(ids)})
        ORDER BY day ASC`,
      this.prisma.$queryRaw<LastActivityRaw[]>`
        SELECT tenant_id, MAX(created_at) AS last_at
        FROM ai_invocations
        WHERE tenant_id IN (${Prisma.join(ids)})
        GROUP BY tenant_id`,
    ]);
    const lastByTenant = new Map(last.map((row) => [row.tenant_id, row.last_at]));
    return rows.map((row) => ({
      tenantId: row.tenant_id,
      tenantSlug: row.tenant_slug,
      companyName: row.company_name,
      windowCostUsd: row.total_cost_usd,
      windowPlatformCostUsd: row.platform_cost_usd,
      windowCallCount: Number(row.call_count),
      windowErrorCount: Number(row.error_count),
      sparkline: daily
        .filter((day) => day.tenant_id === row.tenant_id)
        .map((day) => ({ day: formatIsoDate(day.day), costUsd: day.total_cost_usd })),
      lastActivityAt: lastByTenant.get(row.tenant_id)?.toISOString() ?? null,
    }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Drill-in — per-surface breakdown for one tenant
  // ───────────────────────────────────────────────────────────────────────
  async listSurfaceBreakdown(opts: { tenantId: number; days: number }): Promise<AiSpendSurfaceRow[]> {
    const since = startOfDayUtcDaysAgo(opts.days);

    const rows = await this.prisma.$queryRaw<SurfaceSliceRaw[]>`
      SELECT
        surface,
        SUM(total_cost_usd)::text    AS total_cost_usd,
        SUM(platform_cost_usd)::text AS platform_cost_usd,
        SUM(call_count)::bigint   AS call_count,
        SUM(error_count)::bigint  AS error_count,
        SUM(total_tokens)::bigint AS total_tokens
      FROM vw_ai_cost_daily
      WHERE tenant_id = ${opts.tenantId} AND day >= ${since}::date
      GROUP BY surface
      ORDER BY SUM(total_cost_usd) DESC
    `;

    return rows.map((r) => ({
      surface: r.surface,
      windowCostUsd: r.total_cost_usd,
      windowPlatformCostUsd: r.platform_cost_usd,
      windowCallCount: Number(r.call_count),
      windowErrorCount: Number(r.error_count),
      windowTotalTokens: Number(r.total_tokens),
    }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Invocation list — drill-in detail with keyset cursor
  // ───────────────────────────────────────────────────────────────────────
  /** One tenant's invocations, newest first: keyset on (createdAt, id), with the total for the surface filter. */
  async listInvocations(query: AiSpendInvocationListQuery): Promise<AiSpendInvocationList> {
    const take = clampCursorLimit(query.limit);
    // Decoded before any query runs: a malformed cursor is a 400 and costs nothing.
    const keyset = query.cursor ? keysetWhere({ ...INVOCATION_KEYSET, cursor: query.cursor }) : undefined;
    const scope: Prisma.AiInvocationWhereInput = { tenantId: query.tenantId };
    if (query.surface) scope.surface = query.surface;

    const [rows, total] = await Promise.all([
      this.prisma.aiInvocation.findMany({
        where: keyset ? { AND: [scope, keyset] } : scope,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
      }),
      this.prisma.aiInvocation.count({ where: scope }),
    ]);
    const page = buildCursorPage(rows, take, (row) => encodeCursor(row.createdAt, row.id));
    const items: AiSpendInvocationItem[] = page.items.map((row) => ({
      id: row.id,
      surface: row.surface,
      agentId: row.agentId,
      model: row.model,
      provider: row.provider,
      costUsd: row.costUsd?.toString() ?? null,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      cachedTokens: row.cachedTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      latencyMs: row.latencyMs,
      status: row.status,
      routeId: row.routeId,
      credentialType: row.credentialType,
      payer: payerOf(row.credentialType),
      langfuseTraceId: row.langfuseTraceId,
      linkRefType: row.linkRefType,
      linkRefId: row.linkRefId,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, nextCursor: page.nextCursor, total };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Budget config (Sprint 2 — PR 10)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Fetch (or lazily create) a tenant's budget caps. A row created here holds the schema defaults, which nobody
   * chose, so it is stamped `plan:DEFAULT` and the plan seeder may still replace it.
   */
  async getBudget(tenantId: number): Promise<AiBudget> {
    const row = await this.prisma.tenantAiBudget.upsert({
      where: { tenantId },
      create: { tenantId, notes: BUDGET_SEED_NOTE_DEFAULT },
      update: {},
    });
    return this.toBudget(row);
  }

  /**
   * Update a tenant's budget caps. Validation (≥0, hard≥soft, monthly≥daily)
   * is enforced by the DTO (UpdateAiBudgetSchema) at the controller boundary;
   * here we just persist. The note is the admin's own (or null). A `plan:`
   * stamp sent back (the sheet pre-fills the stored note) is dropped to null,
   * so an edit always takes the row out of the plan seeder's hands. Note: this does NOT bust AiTelemetryService's 60s
   * budget cache directly — the next check picks up the new caps within a
   * minute, which is acceptable for an admin config change.
   */
  async updateBudget(tenantId: number, input: UpdateAiBudgetInput): Promise<AiBudget> {
    const notes = adminBudgetNote(input.notes);
    const row = await this.prisma.tenantAiBudget.upsert({
      where: { tenantId },
      create: {
        tenantId,
        dailySoftUsd: input.dailySoftUsd,
        dailyHardUsd: input.dailyHardUsd,
        monthlySoftUsd: input.monthlySoftUsd,
        monthlyHardUsd: input.monthlyHardUsd,
        notes,
      },
      update: {
        dailySoftUsd: input.dailySoftUsd,
        dailyHardUsd: input.dailyHardUsd,
        monthlySoftUsd: input.monthlySoftUsd,
        monthlyHardUsd: input.monthlyHardUsd,
        notes,
      },
    });
    return this.toBudget(row);
  }

  /**
   * Cost vs quota side-by-side for one tenant. The budget is compared with
   * `platformUsd` (what the platform paid); `tenantUsd` is what the workspace
   * paid on its own credentials, shown and never capped. Cost + budget come from this
   * domain (the ledger + budget table). Quota comes from the separate
   * plan/billing system — exposed here as a best-effort array so the panel
   * can show the distinction. Quota integration is a documented follow-up:
   * the quota counters live behind PlansService/entitlements and aren't
   * surfaced through a stable read API yet, so we return [] today rather
   * than couple to an unstable internal. The panel renders cost+budget and
   * notes quota as "not yet wired".
   */
  async getCostVsQuota(opts: { tenantId: number; days: number }): Promise<AiCostVsQuota> {
    const since = startOfDayUtcDaysAgo(opts.days);
    const [costRows, budget] = await Promise.all([
      this.prisma.$queryRaw<{ total_usd: string; platform_usd: string; call_count: bigint | number }[]>`
        SELECT COALESCE(SUM(cost_usd), 0)::text AS total_usd,
               COALESCE(SUM(cost_usd) FILTER (WHERE ${PLATFORM_PAID_SQL}), 0)::text AS platform_usd,
               COUNT(*)::bigint AS call_count
        FROM ai_invocations
        WHERE tenant_id = ${opts.tenantId} AND created_at >= ${since}
      `,
      this.getBudget(opts.tenantId),
    ]);
    const cost = costRows[0] ?? { total_usd: '0', platform_usd: '0', call_count: 0 };
    const tenantUsd = new Prisma.Decimal(cost.total_usd).minus(new Prisma.Decimal(cost.platform_usd));

    return {
      windowDays: opts.days,
      cost: {
        totalUsd: cost.total_usd,
        platformUsd: cost.platform_usd,
        tenantUsd: tenantUsd.toString(),
        callCount: Number(cost.call_count),
      },
      budget,
      quota: [], // see method doc — quota read API is a follow-up integration
    };
  }

  private toBudget(row: {
    dailySoftUsd: { toString(): string };
    dailyHardUsd: { toString(): string };
    monthlySoftUsd: { toString(): string };
    monthlyHardUsd: { toString(): string };
    notes: string | null;
  }): AiBudget {
    return {
      dailySoftUsd: row.dailySoftUsd.toString(),
      dailyHardUsd: row.dailyHardUsd.toString(),
      monthlySoftUsd: row.monthlySoftUsd.toString(),
      monthlyHardUsd: row.monthlyHardUsd.toString(),
      notes: row.notes,
    };
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────

interface TenantTotalsRaw {
  tenant_id: number;
  tenant_slug: string;
  company_name: string;
  total_cost_usd: string;
  platform_cost_usd: string;
  call_count: bigint | number;
  error_count: bigint | number;
}

interface DailySliceRaw {
  tenant_id: number;
  day: Date;
  total_cost_usd: string;
}

interface SurfaceSliceRaw {
  surface: AiSurface;
  total_cost_usd: string;
  platform_cost_usd: string;
  call_count: bigint | number;
  error_count: bigint | number;
  total_tokens: bigint | number;
}

interface LastActivityRaw {
  tenant_id: number;
  last_at: Date;
}

function startOfDayUtcDaysAgo(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days + 1); // inclusive of today
  return d;
}

function formatIsoDate(d: Date | string): string {
  const date = d instanceof Date ? d : new Date(d);
  return date.toISOString().slice(0, 10);
}

/**
 * The SQL keyset after a tagged cursor (`<window day>.<cursor>`). The tag must name the window in use, the id
 * must be a tenant id and the cost must read as a decimal: anything else is a 400, never a query.
 */
function tenantKeyset(tag: string, tagged: string): Prisma.Sql {
  if (typeof tagged !== 'string' || !tagged.startsWith(tag)) throw new BadRequestException(INVALID_CURSOR);
  const { sortValue, id } = decodeCursor(tagged.slice(tag.length));
  if (typeof id !== 'string' || id.length === 0 || typeof sortValue !== 'string' || !DECIMAL.test(sortValue)) {
    throw new BadRequestException(INVALID_CURSOR);
  }
  return Prisma.sql`AND (totals.cost < ${sortValue}::numeric OR (totals.cost = ${sortValue}::numeric AND t.tenant_id > ${id}))`;
}
