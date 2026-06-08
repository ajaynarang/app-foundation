import { DeskEpisodeStepKind, MemoryPolarity, SettlementStatus } from '@prisma/client';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';
import { SettlementReview } from '@app/shared-types';

import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { DeskMemoryService } from '../../../core/memory/desk-memory.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import { computeAnomalySignals } from '../anomaly-signals';
import type {
  HydrateEntitySettlement,
  HydrateSettlementDeduction,
  HydrateSettlementLineItem,
  SettlementReviewHydrateInput,
  SettlementReviewHydrateOutput,
  SettlementReviewPreflightResult,
} from '../step.types';

/**
 * hydrate step — the Settlement Review episode's context-loading atom.
 *
 * One step row with kind='hydrate'. Bundles:
 *   1. Settlement + driver + line items + deductions (via Prisma)
 *   2. The driver's recent net-pay average (Prisma aggregate over non-VOID
 *      settlements — the baseline for the offAverage signal)
 *   3. Deterministic anomaly signals (pure math — persisted on the output so
 *      gate/decide/approval-adapter all read the SAME snapshot)
 *   4. Memory lookup (entity-scoped via DeskMemoryService)
 *   5. Preflight rules (abort if no longer DRAFT, skip if driver excluded)
 *
 * Writes one step row regardless of preflight outcome — even a skipped
 * episode gets a hydrate row for audit.
 */
export async function hydrateStep(input: SettlementReviewHydrateInput): Promise<SettlementReviewHydrateOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const memoryService = app.get(DeskMemoryService);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      id: true,
      tenantId: true,
      ownerAgentId: true,
      entityType: true,
      entityId: true,
      conditionsSnapshot: true,
    },
  });

  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.HYDRATE,
  });

  try {
    if (episode.entityType !== 'settlement' || !episode.entityId) {
      throw new Error(`hydrate: Settlement Review requires entityType=settlement; got ${episode.entityType}`);
    }

    const conditions = SettlementReview.SettlementReviewConditionsSchema.parse(episode.conditionsSnapshot ?? {});

    // ── 1. Settlement + driver + line items + deductions ──────────────
    const row = await prisma.settlement.findFirst({
      where: { tenantId: episode.tenantId, settlementId: episode.entityId },
      select: {
        settlementId: true,
        settlementNumber: true,
        status: true,
        periodStart: true,
        periodEnd: true,
        grossPayCents: true,
        deductionsCents: true,
        netPayCents: true,
        createdAt: true,
        driverId: true,
        driver: { select: { driverId: true, name: true } },
        lineItems: {
          select: {
            description: true,
            payAmountCents: true,
            load: { select: { loadNumber: true } },
          },
        },
        deductions: { select: { type: true, description: true, amountCents: true } },
      },
    });
    if (!row) {
      throw new Error(`hydrate: settlement ${episode.entityId} not found`);
    }

    const ageDays = daysBetween(row.createdAt, new Date());
    const lineItems: HydrateSettlementLineItem[] = row.lineItems.map((li) => ({
      description: li.description,
      loadNumber: li.load?.loadNumber ?? null,
      payAmountCents: li.payAmountCents,
    }));
    const deductions: HydrateSettlementDeduction[] = row.deductions.map((d) => ({
      type: d.type,
      description: d.description,
      amountCents: d.amountCents,
    }));

    const settlement: HydrateEntitySettlement = {
      settlementId: row.settlementId,
      settlementNumber: row.settlementNumber,
      driverId: row.driver.driverId,
      driverName: row.driver.name,
      status: row.status,
      periodStart: row.periodStart ? row.periodStart.toISOString().slice(0, 10) : null,
      periodEnd: row.periodEnd ? row.periodEnd.toISOString().slice(0, 10) : null,
      grossPayCents: row.grossPayCents,
      deductionsCents: row.deductionsCents,
      netPayCents: row.netPayCents,
      createdAt: row.createdAt.toISOString(),
      ageDays,
      lineItems,
      deductions,
    };

    // ── 2. Driver baseline — average net pay over recent non-VOID,
    //       non-DRAFT settlements (exclude this draft + other drafts so the
    //       baseline reflects pay that actually went out). ────────────────
    const baseline = await computeDriverBaseline(prisma, episode.tenantId, row.driverId, row.settlementId);

    // ── 3. Anomaly signals (deterministic; persisted on the snapshot) ──
    const signals = computeAnomalySignals({
      netPayCents: settlement.netPayCents,
      grossPayCents: settlement.grossPayCents,
      deductionsCents: settlement.deductionsCents,
      lineItemCount: settlement.lineItems.length,
      ageDays: settlement.ageDays,
      avgNetPayCents: baseline.avgNetPayCents,
      staleDays: conditions.staleDays,
      offAverageThresholdPct: conditions.offAverageThresholdPct,
    });

    // ── 4. Memory ─────────────────────────────────────────────────────
    const memories = await memoryService.findRelevant({
      tenantId: episode.tenantId,
      agentId: episode.ownerAgentId,
      entityRef: {
        driverId: settlement.driverId,
        settlementId: settlement.settlementId,
      },
      queryContext: `Draft settlement ${settlement.settlementNumber} for ${settlement.driverName}; net ${settlement.netPayCents / 100}, ${settlement.lineItems.length} loads, ${settlement.ageDays}d old.`,
      // We want CORRECT-aligned memories (past flags / cautions for this
      // driver) to surface — pay correctness leans conservative.
      queryIntent: MemoryPolarity.CORRECT,
      limit: 5,
    });

    if (memories.length > 0) {
      await prisma.deskEpisode.update({
        where: { id: episode.id },
        data: { retrievedMemoryIds: memories.map((m) => m.id) },
      });
    }

    // ── 5. Preflight ──────────────────────────────────────────────────
    const preflight = evaluatePreflight({
      status: settlement.status,
      driverId: settlement.driverId,
      excludeDriverIds: conditions.excludeDriverIds,
    });

    const output: SettlementReviewHydrateOutput = {
      entity: { settlement, baseline, signals },
      memories,
      preflight,
      // Driver is settlement-review's counterparty — surface it so the shared
      // close step keys memories at the driver level without reaching into
      // this responsibility's hydrate shape.
      relationshipRef: { driverId: settlement.driverId },
    };

    await stepWriter.succeeded({
      stepId: step.id,
      output: output as unknown as Record<string, unknown>,
    });
    return output;
  } catch (err) {
    await stepWriter.failed({
      stepId: step.id,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers — pure-ish functions scoped to hydrate; not exported
// ─────────────────────────────────────────────────────────────────────────

function daysBetween(fromDate: Date, toDate: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((toDate.getTime() - fromDate.getTime()) / msPerDay);
}

/**
 * Driver's recent net-pay average. Window = last N (default 6) settlements
 * that actually represent pay (APPROVED or PAID), most recent first, for the
 * SAME driver, excluding this draft. A new driver (no prior approved/paid
 * settlements) yields avgNetPayCents=null → offAverage is skipped, not flagged.
 */
async function computeDriverBaseline(
  prisma: PrismaService,
  tenantId: number,
  driverId: number,
  thisSettlementId: string,
): Promise<SettlementReviewHydrateOutput['entity']['baseline']> {
  const rows = await prisma.settlement.findMany({
    where: {
      tenantId,
      driverId,
      status: { in: [SettlementStatus.APPROVED, SettlementStatus.PAID] },
      settlementId: { not: thisSettlementId },
    },
    select: { netPayCents: true },
    orderBy: { createdAt: 'desc' },
    take: SettlementReview.SETTLEMENT_REVIEW_AVERAGE_WINDOW,
  });

  if (rows.length === 0) {
    return { avgNetPayCents: null, sampleSize: 0 };
  }

  const total = rows.reduce((sum, r) => sum + r.netPayCents, 0);
  return { avgNetPayCents: Math.round(total / rows.length), sampleSize: rows.length };
}

/**
 * Preflight rules for Settlement Review — deterministic, run from hydrate.
 *   - abort if the settlement is no longer DRAFT (already approved/paid/void
 *     between fan-out and hydrate)
 *   - skip if the driver is on the excludeDriverIds list
 */
function evaluatePreflight(input: {
  status: string;
  driverId: string;
  excludeDriverIds?: string[];
}): SettlementReviewPreflightResult {
  if (input.status.toUpperCase() !== SettlementStatus.DRAFT) {
    return {
      action: 'abort',
      outcome: DESK_OUTCOMES.PREFLIGHT_ABORTED,
      reason: `Settlement status=${input.status} (no longer DRAFT)`,
    };
  }

  if (input.excludeDriverIds?.includes(input.driverId)) {
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.PREFLIGHT_SKIPPED,
      reason: `Driver ${input.driverId} is on the exclude list`,
    };
  }

  return { action: 'proceed' };
}
