import { DeskEpisodeStepKind, LoadStatus, MemoryPolarity } from '@prisma/client';
import { DESK_OUTCOMES } from '../../../shared-steps/outcomes';

import { BillingReadinessService } from '../../../../financials/close-out/billing-readiness.service';
import { nestApp } from '../../../core/inngest/nest-context';
import { DeskStepWriter } from '../../../core/episode/desk-step-writer.service';
import { DeskMemoryService } from '../../../core/memory/desk-memory.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

import type { HydratePreflightResult } from '../../../shared-steps/step.types';
import type { CloseoutHydrateChargeItem, CloseoutHydrateInput, CloseoutHydrateOutput } from '../step.types';

/**
 * hydrate step — the Closeout Review episode's context-loading atom.
 *
 * One step row with kind='hydrate'. Bundles:
 *   1. Load + customer data (via Prisma)
 *   2. Billing-readiness result (BillingReadinessService — same service the
 *      get-billing-readiness MCP tool wraps)
 *   3. Load charges (the source of truth generate-invoice will bill from —
 *      mirrors the get-load-charges MCP tool)
 *   4. Memory lookup (entity-scoped via DeskMemoryService)
 *   5. Preflight rules:
 *        • abort  — an invoice now exists / load no longer DELIVERED (a
 *                   manual invoice landed between fan-out and this run)
 *        • skip   — readiness has blockers OR no billable charges; the
 *                   workflow closes as no_action with the blocker reason
 *                   rather than ever drafting a wrong invoice
 *        • proceed otherwise
 *
 * Writes one step row regardless of preflight outcome — even a skipped
 * episode gets a hydrate row for audit.
 *
 * Internal plumbing — a composite read op with no AI surface, so it is not
 * bounded by the invocation pipeline.
 */
export async function hydrateStep(input: CloseoutHydrateInput): Promise<CloseoutHydrateOutput> {
  const app = nestApp();
  const prisma = app.get(PrismaService);
  const stepWriter = app.get(DeskStepWriter);
  const memoryService = app.get(DeskMemoryService);
  const billingReadiness = app.get(BillingReadinessService);

  const episode = await prisma.deskEpisode.findUniqueOrThrow({
    where: { id: input.episodeId },
    select: {
      id: true,
      tenantId: true,
      ownerAgentId: true,
      entityType: true,
      entityId: true,
    },
  });

  const step = await stepWriter.open({
    episodeId: input.episodeId,
    kind: DeskEpisodeStepKind.HYDRATE,
  });

  try {
    if (episode.entityType !== 'load' || !episode.entityId) {
      throw new Error(`hydrate: Closeout Review requires entityType=load; got ${episode.entityType}`);
    }

    // ── 1. Load + customer + charges + any existing invoices ───────────
    const loadRow = await prisma.load.findFirst({
      where: { tenantId: episode.tenantId, loadNumber: episode.entityId },
      select: {
        id: true,
        loadNumber: true,
        status: true,
        billingStatus: true,
        deliveredAt: true,
        customer: { select: { id: true, companyName: true } },
        charges: {
          orderBy: { id: 'asc' },
          select: {
            chargeType: true,
            description: true,
            quantity: true,
            unitPriceCents: true,
            totalCents: true,
            isBillable: true,
          },
        },
        _count: { select: { invoices: true } },
      },
    });
    if (!loadRow) {
      throw new Error(`hydrate: load ${episode.entityId} not found`);
    }

    const now = new Date();
    const hoursSinceDelivery = loadRow.deliveredAt ? hoursBetween(loadRow.deliveredAt, now) : 0;

    const load = {
      loadNumber: loadRow.loadNumber,
      customerId: String(loadRow.customer.id),
      customerName: loadRow.customer.companyName,
      deliveredAt: loadRow.deliveredAt ? loadRow.deliveredAt.toISOString() : null,
      hoursSinceDelivery,
      billingStatus: loadRow.billingStatus,
      status: loadRow.status,
    };

    const billableCharges = loadRow.charges.filter((c) => c.isBillable);
    const billableTotalCents = billableCharges.reduce((sum, c) => sum + c.totalCents, 0);
    const chargeItems: CloseoutHydrateChargeItem[] = billableCharges.map((c) => ({
      chargeType: c.chargeType,
      description: c.description,
      quantity: c.quantity,
      unitPriceDollars: c.unitPriceCents / 100,
      totalDollars: c.totalCents / 100,
    }));
    const charges = {
      hasBillableCharges: billableCharges.length > 0,
      billableTotalDollars: billableTotalCents / 100,
      items: chargeItems,
    };

    // ── 2. Billing readiness (same service the MCP tool wraps) ─────────
    const readinessResult = await billingReadiness.evaluate(loadRow.loadNumber, episode.tenantId);
    const blockers = readinessResult.items
      .filter((item) => item.status === 'missing' || item.status === 'overdue')
      .map((item) => `${item.label}: ${item.reason}`);
    const readiness = {
      score: readinessResult.score,
      hasBlockers: readinessResult.hasBlockers,
      readyToApprove: readinessResult.readyToApprove,
      blockers,
    };

    // ── 3. Memory ──────────────────────────────────────────────────────
    const memories = await memoryService.findRelevant({
      tenantId: episode.tenantId,
      agentId: episode.ownerAgentId,
      entityRef: {
        customerId: load.customerId,
        loadNumber: load.loadNumber,
      },
      queryContext: `Delivered uninvoiced load ${load.loadNumber} for ${load.customerName}; delivered ${hoursSinceDelivery}h ago, billable total ${charges.billableTotalDollars}.`,
      queryIntent: MemoryPolarity.REINFORCE,
      limit: 5,
    });
    if (memories.length > 0) {
      await prisma.deskEpisode.update({
        where: { id: episode.id },
        data: { retrievedMemoryIds: memories.map((m) => m.id) },
      });
    }

    // ── 4. Preflight ───────────────────────────────────────────────────
    const preflight = evaluatePreflight({
      loadStatus: loadRow.status,
      existingInvoiceCount: loadRow._count.invoices,
      hasBillableCharges: charges.hasBillableCharges,
      hasBlockers: readiness.hasBlockers,
      blockers,
    });

    const output: CloseoutHydrateOutput = {
      entity: { load, readiness, charges },
      memories,
      preflight,
      // Key closeout memories at the customer level (not the one-off load) so
      // learned billing patterns persist across that customer's loads.
      relationshipRef: { customerId: load.customerId },
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
// Helpers — pure functions scoped to hydrate; not exported
// ─────────────────────────────────────────────────────────────────────────

function hoursBetween(fromDate: Date, toDate: Date): number {
  return Math.floor((toDate.getTime() - fromDate.getTime()) / (60 * 60 * 1000));
}

/**
 * Preflight rules for Closeout Review — all deterministic, run from hydrate.
 *
 * Money-safety order: abort if the load is no longer billable-from-scratch
 * (an invoice now exists, or it left DELIVERED), then skip→no_action on any
 * billing blocker so we never reach the draft/execute path for a load that
 * isn't ready.
 */
function evaluatePreflight(input: {
  loadStatus: string;
  existingInvoiceCount: number;
  hasBillableCharges: boolean;
  hasBlockers: boolean;
  blockers: string[];
}): HydratePreflightResult {
  // abort — a manual invoice landed (or the load left DELIVERED) between
  // fan-out and this run. Nothing to do; closing as resolved.
  if (input.existingInvoiceCount > 0) {
    return {
      action: 'abort',
      outcome: DESK_OUTCOMES.PREFLIGHT_ABORTED,
      reason: 'Load already has an invoice',
    };
  }
  if (input.loadStatus !== LoadStatus.DELIVERED) {
    return {
      action: 'abort',
      outcome: DESK_OUTCOMES.PREFLIGHT_ABORTED,
      reason: `Load status=${input.loadStatus}`,
    };
  }

  // skip→no_action — not billable yet. Flag the gap; never draft.
  if (!input.hasBillableCharges) {
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
      reason: 'No billable charges on this load',
    };
  }
  if (input.hasBlockers) {
    const detail = input.blockers.length > 0 ? input.blockers.join('; ') : 'billing requirements not met';
    return {
      action: 'skip',
      outcome: DESK_OUTCOMES.NO_ACTION_NEEDED,
      reason: `Not billable yet — ${detail}`,
    };
  }

  return { action: 'proceed' };
}
