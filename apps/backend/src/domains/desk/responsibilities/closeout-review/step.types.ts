import type { CloseoutReview } from '@sally/shared-types';

import type { HydrateMemoryItem, HydratePreflightResult } from '../../shared-steps/step.types';

/**
 * Input/output shapes that flow between Inngest steps within the Closeout
 * Review workflow. Closeout's hydrate output is load-shaped (the AR shape
 * in shared-steps/step.types.ts is invoice-shaped), so it lives here next
 * to the responsibility that owns it. Preflight + memory item shapes are
 * shared infrastructure and reused from the shared step types.
 */

export interface CloseoutHydrateInput {
  episodeId: string;
  responsibilityKey: 'closeout_review';
}

export interface CloseoutHydrateEntityLoad {
  loadNumber: string;
  customerId: string;
  customerName: string;
  deliveredAt: string | null;
  hoursSinceDelivery: number;
  billingStatus: string | null;
  status: string;
}

export interface CloseoutHydrateChargeItem {
  chargeType: string;
  description: string;
  quantity: number;
  unitPriceDollars: number;
  totalDollars: number;
}

export interface CloseoutHydrateCharges {
  hasBillableCharges: boolean;
  billableTotalDollars: number;
  items: CloseoutHydrateChargeItem[];
}

export interface CloseoutHydrateReadiness {
  score: number;
  hasBlockers: boolean;
  readyToApprove: boolean;
  /** Human-readable blocker labels (overdue / missing requirements). */
  blockers: string[];
}

export interface CloseoutHydrateOutput {
  entity: {
    load: CloseoutHydrateEntityLoad;
    readiness: CloseoutHydrateReadiness;
    charges: CloseoutHydrateCharges;
  };
  memories: HydrateMemoryItem[];
  preflight: HydratePreflightResult;
  /** Counterparty keys folded into the memory entityRef by the shared close
   *  step — closeout keys at the customer level so billing patterns persist
   *  across that customer's loads, not just the one-off load. */
  relationshipRef?: Record<string, string>;
}

// ─── Perceive / Decide / Draft outputs (Zod-inferred from shared-types) ──
export type CloseoutPerceiveOutput = CloseoutReview.CloseoutReviewPerceive;
export type CloseoutDecideOutput = CloseoutReview.CloseoutReviewDecide;
export type CloseoutDraftOutput = CloseoutReview.CloseoutReviewDraft;
