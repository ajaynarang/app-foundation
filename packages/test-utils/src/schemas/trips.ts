/**
 * API Contracts for Trip endpoints.
 *
 * `@sally/shared-types/fleet/trip.schema.ts` already exports:
 *   - `TripSchema`        (flat trip row)
 *   - `TripDetailSchema`  (`TripSchema.extend({ driverName, …, loads, routePlanId })`)
 *   - `TripListItemSchema` (list-view projection)
 *
 * Drift vs the actual `TripService.findOne` / `findAll` outputs in
 * `apps/backend/src/domains/fleet/trips/trip.service.ts`:
 *
 *   1. `loads[].tripOrder` — service emits the current integer order
 *      (`number`) after create; the shared-types schema types it as
 *      `z.number().nullable()`. Permissive form already matches, no drift.
 *
 *   2. Every timestamp field (`assignedAt`, `startedAt`, `completedAt`,
 *      `cancelledAt`, `lastGeneratedAt`, `updatedAt`, `createdAt`) is
 *      emitted via `?.toISOString() ?? null` or `toISOString()`. Shared-
 *      types types them as `z.string().nullable()` (or bare `z.string()`),
 *      which matches.
 *
 *   3. `loads[].pickupDate` / `loads[].deliveryDate` — the service emits
 *      `toISOString().slice(0, 10)` (date-only `YYYY-MM-DD`, not full
 *      ISO). Shared-types declares `z.string().nullable()` which is
 *      permissive enough. No drift that breaks parsing.
 *
 *   4. List envelope — `{ data, total, limit, offset }` — shared-types
 *      doesn't export this wrapper, so we declare it locally.
 *
 * Net: we re-export shared-types' `TripDetailSchema` / `TripListItemSchema`
 * directly and add the list-envelope + cancel-response wrappers locally.
 * No `.passthrough()`. No hand-written re-declaration unless drift forces
 * it.
 */
import { z } from 'zod';
import { TripDetailSchema, TripListItemSchema, TripStatusSchema } from '@sally/shared-types';

// ── Re-export shared-types entity schemas (no drift) ────────────────

export { TripStatusSchema, TripDetailSchema, TripListItemSchema };

// The detail shape is what every mutating endpoint (create/update/assign/
// add-load/remove-load/cancel) returns via `findOne`.
export const TripSchema = TripDetailSchema;

// ── GET /trips (paginated envelope) ───────────────────────────────

export const TripListResponseSchema = z.object({
  data: z.array(TripListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type TripListResponse = z.infer<typeof TripListResponseSchema>;
