/**
 * API Contracts for Close-Out endpoints (Phase 2 Group 2a).
 *
 * Backend controller:
 *   apps/backend/src/domains/financials/close-out/close-out.controller.ts
 *
 * Services (source of truth for response shape):
 *   apps/backend/src/domains/financials/close-out/close-out.service.ts
 *     - getSummary → `{ needsDocs, readyForReview, readyToBill,
 *                       readyToBillTotalCents, overduePods, total }`
 *     - list      → `{ loads: CloseOutLoad[], total: number }`   (NOT a
 *                    `{ data, limit, offset }` envelope — the controller
 *                    accepts `?limit` + `?offset` query params but does not
 *                    echo them in the response).
 *     - approveForBilling → `{ loadId: string, billingStatus: 'APPROVED' }`
 *     - sendBack          → `{ loadId: string, billingStatus: 'READY_FOR_REVIEW' }`
 *   apps/backend/src/domains/financials/close-out/billing-readiness.service.ts
 *     - evaluate → `BillingReadinessResult` (identical shape to shared-types).
 *
 * Schema strategy:
 *   - `CloseOutSummarySchema`, `CloseOutLoadSchema`, `BillingReadinessResultSchema`
 *     are re-exported from `@app/shared-types/financials/close-out.schema.ts`
 *     unchanged — the shared-types schemas are byte-for-byte alignment with the
 *     services above. Strict parse is safe.
 *   - `CloseOutListResponseSchema` is hand-written here: shared-types does not
 *     expose a list envelope, and the service's `{ loads, total }` shape does
 *     NOT match the generic paginated envelope (`{ data, total, limit, offset }`)
 *     used by `GET /loads`. Do not substitute with `expectPaginatedContract`.
 *   - `ApproveForBillingResponseSchema` + `SendBackResponseSchema` are thin
 *     literal-status shapes hand-written here.
 *
 * No passthrough anywhere — every field the backend emits is present in the
 * schemas. If the backend adds a field, the strict parse will fail and the
 * test will direct us to update the schema (and shared-types in lockstep).
 */
import { z } from 'zod';
import {
  BillingReadinessResultSchema as SharedBillingReadinessResultSchema,
  BillingReadinessItemSchema as SharedBillingReadinessItemSchema,
  CloseOutLoadSchema as SharedCloseOutLoadSchema,
  CloseOutSummarySchema as SharedCloseOutSummarySchema,
} from '@app/shared-types';

// ── Re-exports from shared-types ──────────────────────────────────────

/** GET /close-out/summary — `{ needsDocs, readyForReview, ... }` counts. */
export const CloseOutSummarySchema = SharedCloseOutSummarySchema;

/** One list row in GET /close-out (inside the `loads` array). */
export const CloseOutLoadSchema = SharedCloseOutLoadSchema;

/** GET /close-out/:loadId/readiness — per-item shape. */
export const BillingReadinessItemSchema = SharedBillingReadinessItemSchema;

/** GET /close-out/:loadId/readiness — envelope shape. */
export const BillingReadinessResponseSchema = SharedBillingReadinessResultSchema;

// ── Hand-written here (no shared-types equivalent) ────────────────────

/**
 * GET /close-out — list envelope.
 *
 * Backend emits `{ loads: CloseOutLoad[], total: number }`. The list is
 * filtered to `status: 'DELIVERED'` + `billingStatus ∈ { PENDING_DOCUMENTS,
 * READY_FOR_REVIEW, APPROVED }` by the service, so fresh-off-delivery
 * loads show up as PENDING_DOCUMENTS until their readiness hits 100%.
 */
export const CloseOutListResponseSchema = z.object({
  loads: z.array(CloseOutLoadSchema),
  total: z.number().int().nonnegative(),
});

/**
 * POST /close-out/:loadId/approve — thin response. Service intentionally
 * returns `{ loadId, billingStatus: 'APPROVED' }` (see `approveForBilling`
 * return statement). Literal status narrows the post-condition.
 */
export const ApproveForBillingResponseSchema = z.object({
  loadId: z.string().min(1),
  billingStatus: z.literal('APPROVED'),
});

/**
 * POST /close-out/:loadId/send-back — thin response. Service returns
 * `{ loadId, billingStatus: 'READY_FOR_REVIEW' }` after flipping an
 * APPROVED load back for review.
 */
export const SendBackResponseSchema = z.object({
  loadId: z.string().min(1),
  billingStatus: z.literal('READY_FOR_REVIEW'),
});
