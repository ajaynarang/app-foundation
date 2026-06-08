/**
 * API Contracts for Lane Intelligence endpoints on `LaneIntelligenceController`.
 *
 * Shared-types `packages/shared-types/src/fleet/lane-rate.schema.ts` defines
 * `LaneIntelligenceSchema`, `LaneRateTargetSchema`, and
 * `ComputedLaneRateSchema` that match the backend contract exactly. We
 * re-declare locally for the same reason we re-declare custom fields:
 *
 *   - A silent drift in shared-types would weaken the test contract without
 *     a compile error.
 *   - Spec readers can see the contract next to the tests.
 *
 * The `DELETE /fleet/lane-rate-targets/:id` endpoint returns
 * `{ success: true }` (controller-level wrapper).
 */
import { z } from 'zod';
import { isoDateString } from './helpers.js';

export const LaneRateConfidenceSchema = z.enum(['high', 'low', 'none']);
export const LaneRateTrendSchema = z.enum(['up', 'down', 'flat']);

// ── GET /fleet/lane-rate — combined response ────────────────────────
//
// The `computed` block is null when there are < 3 loads on the lane in the
// last 90 days (MIN_LOADS_FOR_INSIGHT threshold). `target` is null when the
// tenant has not set a target for this lane+equipment combo.

export const ComputedLaneRateSchema = z.object({
  avgRateCentsPerMile: z.number().int(),
  minRateCentsPerMile: z.number().int(),
  maxRateCentsPerMile: z.number().int(),
  loadCount: z.number().int().nonnegative(),
  confidence: LaneRateConfidenceSchema,
  trend: LaneRateTrendSchema,
});

export const LaneRateTargetSchema = z.object({
  laneRateTargetId: z.string().min(1),
  originState: z.string().length(2),
  destinationState: z.string().length(2),
  targetRateCentsPerMile: z.number().int().min(1),
  notes: z.string().nullable(),
  equipmentType: z.string().min(1),
  setByUserName: z.string().min(1),
  updatedAt: isoDateString,
});

export const LaneIntelligenceResponseSchema = z.object({
  computed: ComputedLaneRateSchema.nullable(),
  target: LaneRateTargetSchema.nullable(),
});

// ── DELETE /fleet/lane-rate-targets/:id ─────────────────────────────

export const DeleteLaneRateTargetResponseSchema = z.object({
  success: z.literal(true),
});
