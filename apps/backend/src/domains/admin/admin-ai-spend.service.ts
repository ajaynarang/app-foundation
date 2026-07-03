import { Injectable, Logger } from '@nestjs/common';
import type { AiSurface } from '@appshore/db';

import { PrismaService } from '../../infrastructure/database/prisma.service';
import type {
  AiSpendTenantSummary,
  AiSpendSurfaceRow,
  AiSpendInvocationList,
  AiSpendInvocationItem,
  AiBudget,
  UpdateAiBudgetInput,
  AiCostVsQuota,
} from '@app/shared-types';

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
 */
@Injectable()
export class AdminAiSpendService {
  private readonly logger = new Logger(AdminAiSpendService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ───────────────────────────────────────────────────────────────────────
  // Home — one row per tenant, last N days
  // ───────────────────────────────────────────────────────────────────────
  async listTenantSummaries(opts: { days: number }): Promise<AiSpendTenantSummary[]> {
    const since = startOfDayUtcDaysAgo(opts.days);

    // Per-tenant totals + sparkline. We pull the daily slices for the
    // window and aggregate in JS to keep the SQL simple and cacheable.
    const dailyRows = await this.prisma.$queryRaw<DailySliceRaw[]>`
      SELECT
        t.id            AS tenant_id,
        t.tenant_id     AS tenant_slug,
        t.company_name  AS company_name,
        v.day           AS day,
        v.total_cost_usd::text AS total_cost_usd,
        v.call_count    AS call_count,
        v.error_count   AS error_count
      FROM vw_ai_cost_per_tenant v
      JOIN tenants t ON t.id = v.tenant_id
      WHERE v.day >= ${since}::date
      ORDER BY t.id ASC, v.day ASC
    `;

    // Last-activity per tenant — separate query, indexed read.
    const lastActivityRows = await this.prisma.$queryRaw<LastActivityRaw[]>`
      SELECT tenant_id, MAX(created_at) AS last_at
      FROM ai_invocations
      GROUP BY tenant_id
    `;
    const lastActivityByTenant = new Map<number, Date>();
    for (const r of lastActivityRows) lastActivityByTenant.set(r.tenant_id, r.last_at);

    // Group daily slices by tenant.
    const byTenant = new Map<number, { slug: string; companyName: string; days: DailySliceRaw[] }>();
    for (const row of dailyRows) {
      const bucket = byTenant.get(row.tenant_id) ?? {
        slug: row.tenant_slug,
        companyName: row.company_name,
        days: [],
      };
      bucket.days.push(row);
      byTenant.set(row.tenant_id, bucket);
    }

    const result: AiSpendTenantSummary[] = [];
    for (const [tenantId, bucket] of byTenant) {
      let totalCost = 0;
      let callCount = 0;
      let errorCount = 0;
      const sparkline: AiSpendTenantSummary['sparkline'] = [];
      for (const d of bucket.days) {
        totalCost += parseFloat(d.total_cost_usd);
        callCount += Number(d.call_count);
        errorCount += Number(d.error_count);
        sparkline.push({
          day: formatIsoDate(d.day),
          costUsd: d.total_cost_usd,
        });
      }
      result.push({
        tenantId,
        tenantSlug: bucket.slug,
        companyName: bucket.companyName,
        windowCostUsd: totalCost.toFixed(6),
        windowCallCount: callCount,
        windowErrorCount: errorCount,
        sparkline,
        lastActivityAt: lastActivityByTenant.get(tenantId)?.toISOString() ?? null,
      });
    }

    // Highest spenders first — that's what super-admin wants to see.
    result.sort((a, b) => parseFloat(b.windowCostUsd) - parseFloat(a.windowCostUsd));
    return result;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Drill-in — per-surface breakdown for one tenant
  // ───────────────────────────────────────────────────────────────────────
  async listSurfaceBreakdown(opts: { tenantId: number; days: number }): Promise<AiSpendSurfaceRow[]> {
    const since = startOfDayUtcDaysAgo(opts.days);

    const rows = await this.prisma.$queryRaw<SurfaceSliceRaw[]>`
      SELECT
        surface,
        SUM(total_cost_usd)::text AS total_cost_usd,
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
      windowCallCount: Number(r.call_count),
      windowErrorCount: Number(r.error_count),
      windowTotalTokens: Number(r.total_tokens),
    }));
  }

  // ───────────────────────────────────────────────────────────────────────
  // Invocation list — drill-in detail with keyset cursor
  // ───────────────────────────────────────────────────────────────────────
  async listInvocations(opts: {
    tenantId: number;
    surface?: string;
    limit: number;
    cursor?: string;
  }): Promise<AiSpendInvocationList> {
    const limit = Math.min(Math.max(opts.limit, 1), 100);
    const cursor = parseCursor(opts.cursor);

    const where: Record<string, unknown> = { tenantId: opts.tenantId };
    if (opts.surface) where.surface = opts.surface;
    if (cursor) {
      // Keyset: older than the last seen createdAt OR same createdAt with
      // a smaller id (UUIDv7 is monotonic so id ties break by time).
      where.OR = [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }];
    }

    const rows = await this.prisma.aiInvocation.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, // peek one extra to detect more
    });

    const hasMore = rows.length > limit;
    const trimmed = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCursor(trimmed[trimmed.length - 1]) : null;

    const items: AiSpendInvocationItem[] = trimmed.map((row) => ({
      id: row.id,
      surface: row.surface,
      agentId: row.agentId,
      model: row.model,
      provider: row.provider,
      costUsd: row.costUsd?.toString() ?? null,
      promptTokens: row.promptTokens,
      completionTokens: row.completionTokens,
      cachedTokens: row.cachedTokens,
      latencyMs: row.latencyMs,
      status: row.status,
      langfuseTraceId: row.langfuseTraceId,
      linkRefType: row.linkRefType,
      linkRefId: row.linkRefId,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, nextCursor };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Budget config (Sprint 2 — PR 10)
  // ───────────────────────────────────────────────────────────────────────

  /** Fetch (or lazily create) a tenant's budget caps. */
  async getBudget(tenantId: number): Promise<AiBudget> {
    const row = await this.prisma.tenantAiBudget.upsert({
      where: { tenantId },
      create: { tenantId },
      update: {},
    });
    return this.toBudget(row);
  }

  /**
   * Update a tenant's budget caps. Validation (≥0, hard≥soft, monthly≥daily)
   * is enforced by the DTO (UpdateAiBudgetSchema) at the controller boundary;
   * here we just persist. Note: this does NOT bust AiTelemetryService's 60s
   * budget cache directly — the next check picks up the new caps within a
   * minute, which is acceptable for an admin config change.
   */
  async updateBudget(tenantId: number, input: UpdateAiBudgetInput): Promise<AiBudget> {
    const row = await this.prisma.tenantAiBudget.upsert({
      where: { tenantId },
      create: {
        tenantId,
        dailySoftUsd: input.dailySoftUsd,
        dailyHardUsd: input.dailyHardUsd,
        monthlySoftUsd: input.monthlySoftUsd,
        monthlyHardUsd: input.monthlyHardUsd,
        notes: input.notes ?? null,
      },
      update: {
        dailySoftUsd: input.dailySoftUsd,
        dailyHardUsd: input.dailyHardUsd,
        monthlySoftUsd: input.monthlySoftUsd,
        monthlyHardUsd: input.monthlyHardUsd,
        notes: input.notes ?? null,
      },
    });
    return this.toBudget(row);
  }

  /**
   * Cost vs quota side-by-side for one tenant. Cost + budget come from this
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
      this.prisma.$queryRaw<{ total_usd: string; call_count: bigint | number }[]>`
        SELECT COALESCE(SUM(cost_usd), 0)::text AS total_usd, COUNT(*)::bigint AS call_count
        FROM ai_invocations
        WHERE tenant_id = ${opts.tenantId} AND created_at >= ${since}
      `,
      this.getBudget(opts.tenantId),
    ]);
    const cost = costRows[0] ?? { total_usd: '0', call_count: 0 };

    return {
      windowDays: opts.days,
      cost: { totalUsd: cost.total_usd, callCount: Number(cost.call_count) },
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

interface DailySliceRaw {
  tenant_id: number;
  tenant_slug: string;
  company_name: string;
  day: Date;
  total_cost_usd: string;
  call_count: bigint | number;
  error_count: bigint | number;
}

interface SurfaceSliceRaw {
  surface: AiSurface;
  total_cost_usd: string;
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

interface ParsedCursor {
  createdAt: Date;
  id: string;
}

function parseCursor(raw?: string): ParsedCursor | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf('|');
    if (sep < 0) return null;
    const createdAt = new Date(decoded.slice(0, sep));
    const id = decoded.slice(sep + 1);
    if (Number.isNaN(createdAt.getTime()) || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}
