import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@appshore/db';
import type { AiInvocation, ModelPricing, TenantAiBudget } from '@appshore/db';
import type { AiBudgetState, AiCallContext, AiUsage } from '@app/shared-types';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M, CACHE_TTL_HOT_60S } from '@appshore/kernel/constants/cache.constants';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { AiBudgetExceededError } from './ai-budget-exceeded.error';
import { ZeroRetentionUnavailable } from '../redaction/zero-retention-unavailable.error';
import { ZDR_ELIGIBLE_TIERS } from '../providers/ai-provider';
import type { ModelAlias } from '@app/shared-types';

/**
 * AiTelemetryService — single write path for the AI cost ledger.
 *
 * Every LLM and embedding call across the platform (chat, desk steps, document
 * intelligence, alert briefings, memory extraction, embeddings, KB ingest)
 * flows through this service via `record()`. Token counts + latency + the
 * computed USD cost land in `ai_invocations` and the per-tenant cost
 * aggregates get invalidated through a domain event staged in the same
 * transaction as the row (the outbox, ADR "Outbox and deadlines").
 *
 * Cost math: `(promptTokens - cachedTokens) * input + cachedTokens *
 * cachedInput + completionTokens * output`, all per million tokens. If no
 * `ModelPricing` row matches the provider/model at write time, the row is
 * still written with `costUsd = null` and a warning is logged — untagged
 * cost is a bug we want to see, not a silent failure that drops data.
 *
 * Callers MUST supply both `tenantId` and `surface`. The guard throws if
 * either is missing — every other failure mode degrades gracefully, but
 * untagged spend would corrupt the ledger.
 *
 * Idempotency: when `context.idempotencyKey` is set, a duplicate write is a
 * no-op at the DB layer (unique index + safe upsert). Document parsers and
 * Desk step retries use this to avoid double-billing on transient retries.
 */
@Injectable()
export class AiTelemetryService {
  private readonly logger = new Logger(AiTelemetryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AppCacheService,
    /**
     * Signals only: the budget breaches and the zero-retention refusal have no write behind them and must fire
     * with the database down (`no-direct-emit.allowlist.json`).
     */
    private readonly events: DomainEventService,
    private readonly outbox: OutboxService,
  ) {}

  /**
   * Persist one AI invocation. Returns the recorded row. Safe to call inside
   * a retry loop — `idempotencyKey` (if supplied) prevents double-counting.
   *
   * Plain `Error` is thrown for the missing-context guards because this
   * service runs both inside HTTP request paths (where NestJS exception
   * filters would format the error) and inside BullMQ workers / Mastra
   * lifecycle hooks (where there is no filter). A loud generic Error is the
   * common denominator — and these guards are programmer errors, not
   * user-facing conditions.
   */
  async record(usage: AiUsage, context: AiCallContext): Promise<AiInvocation> {
    if (!context.tenantId) {
      throw new Error('AiTelemetryService.record: tenantId is required');
    }
    if (!context.surface) {
      throw new Error('AiTelemetryService.record: surface is required');
    }

    const costUsd = await this.computeCost(usage);

    const row = await this.persistRow(usage, context, costUsd);

    // Drop this tenant's spent-so-far cache so the next budget check sees the new spend.
    // Best-effort; a stale 60s window is acceptable.
    void this.invalidateSpentCache(row.tenantId).catch(() => {});

    return row;
  }

  /**
   * Compute USD cost from a `ModelPricing` snapshot keyed by provider+model.
   * Returns null when no pricing row is configured (the call still gets
   * recorded — see class-level note).
   *
   * Cached pricing is cached itself for `CACHE_TTL_COLD_30M` because model
   * prices rotate on the order of months and a cache miss on every call
   * would dominate latency for high-frequency surfaces like embeddings.
   */
  async computeCost(usage: AiUsage): Promise<Prisma.Decimal | null> {
    const pricing = await this.resolvePricing(usage.provider, usage.model);
    if (!pricing) {
      this.logger.warn(
        `No model_pricing row for ${usage.provider}/${usage.model}; recording invocation with null cost. Add a pricing row via seeds/model-pricing.seed.ts.`,
      );
      return null;
    }

    const cachedTokens = usage.cachedTokens ?? 0;
    const billableInput = Math.max(0, usage.promptTokens - cachedTokens);

    const PER_MTOK = new Prisma.Decimal(1_000_000);

    const inputCost = new Prisma.Decimal(billableInput).mul(pricing.inputPerMtokUsd).div(PER_MTOK);
    const cachedCost = pricing.cachedInputPerMtokUsd
      ? new Prisma.Decimal(cachedTokens).mul(pricing.cachedInputPerMtokUsd).div(PER_MTOK)
      : new Prisma.Decimal(0);
    const outputCost = new Prisma.Decimal(usage.completionTokens).mul(pricing.outputPerMtokUsd).div(PER_MTOK);

    return inputCost.plus(cachedCost).plus(outputCost);
  }

  /**
   * Look up the active pricing snapshot for a provider+model pair. "Active"
   * means: latest `effectiveFromDate` ≤ today, with `effectiveUntilDate`
   * either null or > today. Returns null when no row is configured at all.
   *
   * Calendar-date semantics: we don't truncate `new Date()` to midnight
   * here — Postgres casts the timestamp to date on comparison with a DATE
   * column, which gives us "today's effective row" without timezone drift.
   */
  private async resolvePricing(provider: string, model: string): Promise<ModelPricing | null> {
    return this.cache.getOrSet(
      buildKey('app:ai-telemetry', 'pricing', provider, model),
      async () => {
        const now = new Date();
        return this.prisma.modelPricing.findFirst({
          where: {
            provider,
            model,
            effectiveFromDate: { lte: now },
            OR: [{ effectiveUntilDate: null }, { effectiveUntilDate: { gt: now } }],
          },
          orderBy: { effectiveFromDate: 'desc' },
        });
      },
      CACHE_TTL_COLD_30M,
    );
  }

  /**
   * Write the ledger row (or find the one an earlier attempt wrote) and stage
   * AI_INVOCATION_RECORDED with it — the event commits with the row. An
   * idempotent replay writes nothing, so it stages nothing: one invocation, one
   * event. Listeners invalidate per-tenant cost-aggregate caches (super-admin view).
   *
   * The publish runs after commit without being awaited: every AI call passes
   * through here, so it must not wait on a Redis enqueue (a slow or reconnecting
   * Redis would hold the call as long as the add hangs). The row is durable, and
   * `publishStaged` never throws; what it fails to publish the relay publishes.
   */
  private async persistRow(
    usage: AiUsage,
    context: AiCallContext,
    costUsd: Prisma.Decimal | null,
  ): Promise<AiInvocation> {
    const { row, staged } = await this.prisma.$transaction(async (tx) => {
      const found = await this.findOrCreateRow(tx, usage, context, costUsd);
      if (!found.created) return { row: found.row, staged: [] };
      const event = await this.outbox.stage(tx, DOMAIN_EVENTS.AI_INVOCATION_RECORDED, found.row.tenantId, {
        invocationId: found.row.id,
        surface: found.row.surface,
        model: found.row.model,
        provider: found.row.provider,
        costUsd: costUsd?.toString() ?? null,
        totalTokens: found.row.totalTokens,
      });
      return { row: found.row, staged: [event] };
    });
    if (staged.length > 0) void this.outbox.publishStaged(staged);
    return row;
  }

  /**
   * Insert the ledger row. When `idempotencyKey` is set, a duplicate write
   * returns the existing row (`created: false`) instead of creating a second one.
   */
  private async findOrCreateRow(
    tx: Prisma.TransactionClient,
    usage: AiUsage,
    context: AiCallContext,
    costUsd: Prisma.Decimal | null,
  ): Promise<{ row: AiInvocation; created: boolean }> {
    if (context.idempotencyKey) {
      const existing = await tx.aiInvocation.findUnique({
        where: { idempotencyKey: context.idempotencyKey },
      });
      if (existing) return { row: existing, created: false };
    }

    const row = await tx.aiInvocation.create({
      data: {
        id: generateUuidV7(),
        tenantId: context.tenantId,
        userId: context.userId ?? null,
        surface: context.surface,
        agentId: context.agentId ?? null,
        model: usage.model,
        provider: usage.provider,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        cachedTokens: usage.cachedTokens ?? null,
        costUsd,
        latencyMs: usage.latencyMs ?? null,
        status: usage.status,
        errorCode: usage.errorCode ?? null,
        parentInvocationId: context.parentInvocationId ?? null,
        linkRefType: context.linkRefType ?? null,
        linkRefId: context.linkRefId ?? null,
        langfuseTraceId: context.langfuseTraceId ?? null,
        idempotencyKey: context.idempotencyKey ?? null,
      },
    });
    return { row, created: true };
  }

  // ───────────────────────────────────────────────────────────────────────
  // Zero-data-retention enforcement (Sprint 2)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * For a tenant flagged `aiZeroRetention`, ensure the requested model tier
   * has a verified ZDR provider route — else throw `ZeroRetentionUnavailable`
   * (fail-closed). No-op for tenants without the flag.
   *
   * Tenant flag is cached 60s (changes rarely). The ZDR-eligible tier set is
   * currently empty pending the provider-route decision (see
   * `ZDR_ELIGIBLE_TIERS`), so a ZDR tenant is correctly blocked until a
   * compliant route is wired — rather than leaking to a retaining endpoint.
   */
  async assertZeroRetention(tenantId: number, tier: ModelAlias): Promise<void> {
    const requiresZdr = await this.tenantRequiresZeroRetention(tenantId);
    if (!requiresZdr) return;
    if (!ZDR_ELIGIBLE_TIERS.has(tier)) {
      void this.events
        .emit(DOMAIN_EVENTS.AI_ZERO_RETENTION_UNAVAILABLE, tenantId, { tier })
        .catch((e) => this.logger.warn(`zdr-unavailable event emit failed: ${e.message}`));
      throw new ZeroRetentionUnavailable(tier);
    }
  }

  private async tenantRequiresZeroRetention(tenantId: number): Promise<boolean> {
    return this.cache.getOrSet(
      buildKey('app:ai-telemetry', 'zdr', tenantId),
      async () => {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { aiZeroRetention: true },
        });
        return tenant?.aiZeroRetention ?? false;
      },
      CACHE_TTL_HOT_60S,
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Budget evaluation (Sprint 2)
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Evaluate a tenant's AI spend against its budget WITHOUT throwing.
   * Returns `ok | soft | hard` plus the spent + cap figures. Read this from
   * a surface that wants to show a soft-cap banner but not block.
   */
  async checkBudget(tenantId: number): Promise<AiBudgetState> {
    const [budget, spent] = await Promise.all([this.getBudget(tenantId), this.getSpent(tenantId)]);

    const dailyHard = new Prisma.Decimal(budget.dailyHardUsd);
    const monthlyHard = new Prisma.Decimal(budget.monthlyHardUsd);
    const dailySoft = new Prisma.Decimal(budget.dailySoftUsd);
    const monthlySoft = new Prisma.Decimal(budget.monthlySoftUsd);

    let state: AiBudgetState['state'] = 'ok';
    if (spent.daily.gte(dailyHard) || spent.monthly.gte(monthlyHard)) {
      state = 'hard';
    } else if (spent.daily.gte(dailySoft) || spent.monthly.gte(monthlySoft)) {
      state = 'soft';
    }

    return {
      state,
      dailyUsdSpent: spent.daily.toFixed(6),
      monthlyUsdSpent: spent.monthly.toFixed(6),
      dailySoftUsd: budget.dailySoftUsd.toString(),
      dailyHardUsd: budget.dailyHardUsd.toString(),
      monthlySoftUsd: budget.monthlySoftUsd.toString(),
      monthlyHardUsd: budget.monthlyHardUsd.toString(),
    };
  }

  /**
   * Like `checkBudget` but THROWS `AiBudgetExceededError` on `hard`. Surfaces
   * call this pre-flight; the catch runs their fallback. On `soft` it emits a
   * signal event and returns the state (caller may surface a banner). On
   * `ok`/`soft` it never throws.
   *
   * Defensive: if budget evaluation itself errors (DB hiccup), we log and
   * return an `ok`-shaped state rather than block a tenant on infra failure —
   * a telemetry/budget outage must not take down AI features.
   */
  async assertBudget(tenantId: number): Promise<AiBudgetState> {
    let state: AiBudgetState;
    try {
      state = await this.checkBudget(tenantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Budget check failed for tenant ${tenantId}; allowing call (fail-open): ${msg}`);
      return this.openBudgetState();
    }

    if (state.state === 'hard') {
      void this.events
        .emit(DOMAIN_EVENTS.AI_BUDGET_HARD_BREACHED, tenantId, { ...state })
        .catch((e) => this.logger.warn(`budget-hard event emit failed: ${e.message}`));
      throw new AiBudgetExceededError(tenantId, state);
    }
    if (state.state === 'soft') {
      void this.events
        .emit(DOMAIN_EVENTS.AI_BUDGET_SOFT_BREACHED, tenantId, { ...state })
        .catch((e) => this.logger.warn(`budget-soft event emit failed: ${e.message}`));
    }
    return state;
  }

  /**
   * Fetch (or lazily create) the tenant's budget row. Cached 60s — budgets
   * change rarely (super-admin edits), so a short HOT TTL is plenty and keeps
   * the pre-call check from hitting the DB on every AI call.
   */
  private async getBudget(tenantId: number): Promise<TenantAiBudget> {
    return this.cache.getOrSet(
      buildKey('app:ai-telemetry', 'budget', tenantId),
      async () =>
        this.prisma.tenantAiBudget.upsert({
          where: { tenantId },
          create: { tenantId },
          update: {},
        }),
      CACHE_TTL_HOT_60S,
    );
  }

  /**
   * Sum the tenant's spend for today + the current calendar month from the
   * ledger. Cached 60s (HOT) and busted on every new invocation, so the
   * window of staleness is bounded. Uses a single grouped raw query rather
   * than two findMany scans.
   */
  private async getSpent(tenantId: number): Promise<{ daily: Prisma.Decimal; monthly: Prisma.Decimal }> {
    const cached = await this.cache.getOrSet(
      buildKey('app:ai-telemetry', 'spent', tenantId),
      async () => {
        const now = new Date();
        const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

        const rows = await this.prisma.$queryRaw<{ daily: string | null; monthly: string | null }[]>`
          SELECT
            COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= ${startOfDay}), 0)::text   AS daily,
            COALESCE(SUM(cost_usd) FILTER (WHERE created_at >= ${startOfMonth}), 0)::text AS monthly
          FROM ai_invocations
          WHERE tenant_id = ${tenantId} AND created_at >= ${startOfMonth}
        `;
        const row = rows[0] ?? { daily: '0', monthly: '0' };
        return { daily: row.daily ?? '0', monthly: row.monthly ?? '0' };
      },
      CACHE_TTL_HOT_60S,
    );
    return {
      daily: new Prisma.Decimal(cached.daily),
      monthly: new Prisma.Decimal(cached.monthly),
    };
  }

  private async invalidateSpentCache(tenantId: number): Promise<void> {
    await this.cache.del(buildKey('app:ai-telemetry', 'spent', tenantId));
  }

  /** A permissive state used when budget evaluation fails (fail-open). */
  private openBudgetState(): AiBudgetState {
    return {
      state: 'ok',
      dailyUsdSpent: '0',
      monthlyUsdSpent: '0',
      dailySoftUsd: '0',
      dailyHardUsd: '0',
      monthlySoftUsd: '0',
      monthlyHardUsd: '0',
    };
  }
}
