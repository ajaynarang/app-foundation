/**
 * API Contracts for Recurring Lanes endpoints.
 *
 * Shared-types `@app/shared-types/fleet/recurring-lane.schema.ts` exports
 * `RecurringLaneSchema`, but it omits a handful of fields that the backend
 * actually emits via `formatLaneResponse`:
 *
 *   - Per-stop embedded `stop: { id, stopId, name, address, city, state,
 *     zipCode, lat, lon } | null` — not on the shared-types stop schema.
 *
 *   - Date-only date fields (`effectiveFrom`, `effectiveUntil`,
 *     `nextGenerationDate`, `nextScheduledRunDate`) are emitted as
 *     `YYYY-MM-DD` (split at 'T') — not full ISO timestamps.
 *
 *   - `createdAt` / `updatedAt` ARE full ISO timestamps (via `.toISOString()`).
 *
 * Status values are lowercase: 'draft' | 'active' | 'paused' | 'expired'.
 *
 * We hand-write the schemas here to capture the controller's exact shape
 * and avoid a subtle shared-types drift masking a regression.
 *
 * Envelopes:
 *   GET /recurring-lanes                  → { data, total, limit, offset }
 *   GET /recurring-lanes/upcoming         → { data, lookaheadDays }
 *   DELETE /recurring-lanes/:id/soft-delete → { message: string }  (HTTP 200)
 *   POST /recurring-lanes/:id/generate    → a formatted Load response (not a
 *                                             RecurringLane). We assert only
 *                                             the invariant fields we care
 *                                             about via a permissive schema.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString, dateOnlyString } from './helpers.js';

export const RecurringLaneStatusSchema = z.enum(['draft', 'active', 'paused', 'expired']);

export const RecurringLaneStopActionSchema = z.enum(['pickup', 'delivery', 'both']);

// ── Stop entry (as returned by formatLaneResponse) ──────────────────

export const RecurringLaneStopSchema = z.object({
  id: dbId,
  laneId: dbId,
  stopId: dbId,
  sequenceOrder: z.number().int().nonnegative(),
  actionType: RecurringLaneStopActionSchema,
  earliestArrival: z.string().nullable().optional(),
  latestArrival: z.string().nullable().optional(),
  estimatedDockHours: z.number().min(0).max(72),
  dayOffset: z.number().int().min(0).max(30),
  facilityNotes: z.string().nullable().optional(),
  stopName: z.string().nullable(),
  stopCity: z.string().nullable(),
  stopState: z.string().nullable(),
  stopAddress: z.string().nullable(),
  stop: z
    .object({
      id: dbId,
      stopId: stringId,
      name: z.string(),
      address: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      zipCode: z.string().nullable(),
      lat: z.number().nullable(),
      lon: z.number().nullable(),
    })
    .nullable(),
});

// ── Recurring lane entity (create/update/detail/list-item/lifecycle) ──

export const RecurringLaneSchema = z.object({
  id: dbId,
  laneId: stringId,
  name: z.string().min(1),
  customerId: z.number().int().nullable(),
  customerName: z.string().min(1),
  requiredEquipmentType: z.string().nullable(),
  commodityType: z.string().min(1),
  weightLbs: z.number().int().min(0).max(200000),
  rateCents: z.number().int().min(0).max(99999999).nullable(),
  pieces: z.number().int().nullable(),
  specialRequirements: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  scheduleType: z.string().min(1),
  scheduleDays: z.array(z.number()).nullable(),
  scheduleCustomCron: z.string().nullable(),
  autoCreate: z.boolean(),
  autoAssignDriverId: z.number().int().nullable(),
  autoAssignVehicleId: z.number().int().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  estimatedMiles: z.number().nullable(),
  status: RecurringLaneStatusSchema,
  effectiveFrom: dateOnlyString.nullable(),
  effectiveUntil: dateOnlyString.nullable(),
  lastGeneratedAt: isoDateString.nullable(),
  nextGenerationDate: dateOnlyString.nullable(),
  nextScheduledRunDate: dateOnlyString.nullable(),
  skipNextGeneration: z.boolean(),
  totalLoadsGenerated: z.number().int().nonnegative(),
  deletedAt: isoDateString.nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  stops: z.array(RecurringLaneStopSchema),
});

// ── GET /recurring-lanes (paginated envelope) ───────────────────────

export const RecurringLaneListResponseSchema = z.object({
  data: z.array(RecurringLaneSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

// ── GET /recurring-lanes/upcoming ───────────────────────────────────

export const RecurringLaneUpcomingResponseSchema = z.object({
  data: z.array(RecurringLaneSchema),
  lookaheadDays: z.number().int().nonnegative(),
});

// ── GET /recurring-lanes/:id/preview ────────────────────────────────

export const RecurringLanePreviewStopSchema = z.object({
  stopId: dbId,
  stopName: z.string().nullable().optional(),
  stopCity: z.string().nullable().optional(),
  stopState: z.string().nullable().optional(),
  sequenceOrder: z.number().int().nonnegative(),
  actionType: z.string().min(1),
  earliestArrival: z.string().nullable().optional(),
  latestArrival: z.string().nullable().optional(),
  estimatedDockHours: z.number().min(0).max(72),
  dayOffset: z.number().int().min(0).max(30),
});

export const RecurringLanePreviewResponseSchema = z.object({
  laneId: stringId,
  laneName: z.string().min(1),
  customerName: z.string().min(1),
  requiredEquipmentType: z.string().nullable(),
  commodityType: z.string().min(1),
  weightLbs: z.number().int(),
  rateCents: z.number().int().nullable(),
  pieces: z.number().int().nullable(),
  specialRequirements: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  stops: z.array(RecurringLanePreviewStopSchema),
  autoAssignDriverId: z.number().int().nullable(),
  autoAssignVehicleId: z.number().int().nullable(),
  // Controller returns `lane.nextGenerationDate` raw (a Date), which becomes
  // a full ISO string on JSON. Leaving permissive — may be ISO or
  // date-only depending on Prisma serialisation path.
  nextGenerationDate: z.string().nullable(),
});

// ── DELETE /recurring-lanes/:id/soft-delete ─────────────────────────

export const SoftDeleteRecurringLaneResponseSchema = z.object({
  message: z.string().min(1),
});

// ── POST /recurring-lanes/:id/generate ──────────────────────────────
//
// Returns a formatted Load (via `LoadsService.create` → formatLoadResponse).
// Rather than re-declare the Load contract here (already owned by
// `packages/test-utils/src/schemas/loads.ts`), the test narrows to an
// invariant subset — identifiers + lane-inherited fields — using a
// non-strict object schema. Extra keys are accepted silently by default
// in Zod v3 (no `.strict()`), which is what we want without resorting to
// `.passthrough()`.

export const GeneratedLoadResponseSchema = z.object({
  id: dbId,
  loadId: stringId,
  loadNumber: z.string().min(1),
  status: z.string().min(1),
  rateCents: z.number().int().nullable(),
  commodityType: z.string().min(1),
  weightLbs: z.number().int(),
});
