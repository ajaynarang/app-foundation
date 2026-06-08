import type { MemoryPolarity, MemoryScope } from '@prisma/client';
import type { SettlementReview } from '@app/shared-types';

/**
 * Input/output shapes that flow between Inngest steps within the Settlement
 * Review workflow. Mirrors ar-followup's local step.types but for the
 * settlement entity. Kept next to the responsibility so the shared runtime
 * steps stay AR-agnostic (they consume the generic shapes in
 * shared-steps/step.types.ts).
 */

export interface SettlementReviewHydrateInput {
  episodeId: string;
  responsibilityKey: 'settlement_review';
}

export interface HydrateEntitySettlement {
  /** Public settlement id (e.g. stl_abc123) — the entityId on the episode. */
  settlementId: string;
  settlementNumber: string;
  /** Public driver id (e.g. drv_abc123). */
  driverId: string;
  driverName: string;
  status: string;
  periodStart: string | null;
  periodEnd: string | null;
  grossPayCents: number;
  deductionsCents: number;
  netPayCents: number;
  createdAt: string;
  /** Age of the DRAFT in whole days at hydrate time. */
  ageDays: number;
  lineItems: HydrateSettlementLineItem[];
  deductions: HydrateSettlementDeduction[];
}

export interface HydrateSettlementLineItem {
  description: string;
  loadNumber: string | null;
  payAmountCents: number;
}

export interface HydrateSettlementDeduction {
  type: string;
  description: string;
  amountCents: number;
}

export interface HydrateDriverBaseline {
  /** Average net pay (cents) over the recent non-VOID settlement window. */
  avgNetPayCents: number | null;
  /** How many settlements formed the average (0 = new driver, no baseline). */
  sampleSize: number;
}

export interface SettlementReviewMemoryItem {
  id: string;
  scope: MemoryScope;
  polarity: MemoryPolarity;
  content: string;
  confidence: number;
  createdAt: string;
}

export interface SettlementReviewPreflightResult {
  action: 'proceed' | 'skip' | 'abort';
  outcome?: string;
  reason?: string;
}

export interface SettlementReviewHydrateOutput {
  entity: {
    settlement: HydrateEntitySettlement;
    baseline: HydrateDriverBaseline;
    /** Deterministic anomaly signals — the snapshot decide + adapter read. */
    signals: SettlementReview.SettlementAnomalySignals;
  };
  memories: SettlementReviewMemoryItem[];
  preflight: SettlementReviewPreflightResult;
  /**
   * Counterparty/relationship keys the shared close step merges into the
   * memory entityRef so memories key at the driver level. The shared step
   * copies these verbatim without knowing this entity's shape — keeps
   * close.step job-blind.
   */
  relationshipRef?: Record<string, string>;
}

export type SettlementReviewPerceiveOutput = SettlementReview.SettlementReviewPerceive;
export type SettlementReviewDecideOutput = SettlementReview.SettlementReviewDecide;
