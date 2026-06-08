/**
 * API Contracts for the Customer Portal load endpoints
 * (`/customer/loads` + `/customer/loads/:id` + `/customer/loads/request`).
 *
 * Hand-written. `@sally/shared-types/fleet/customer.schema.ts` exports
 * `CustomerLoadSchema` and `CustomerLoadDetailSchema`, but both drift from
 * the backend responses:
 *
 *   1. LIST — `CustomerLoadService.findByCustomerId` emits fields like
 *      `estimatedDelivery`, `originCity`, `destinationCity` as `string | null`,
 *      yet shared-types marks them as `.optional()` (which rejects explicit
 *      `null`). We use `.nullable()` to match reality.
 *
 *   2. DETAIL — `CustomerLoadService.findOneForCustomer` passes through
 *      `formatLoadResponse` which returns the full dispatcher-style load
 *      envelope (~40+ fields including `rateCents`, `driverId`, `vehicleId`,
 *      `intakeSource`, `tripId`, `legs`, etc.), NOT the trimmed
 *      `CustomerLoadDetailSchema` in shared-types. We mirror the real
 *      response with the fields the test asserts on and leave the long
 *      tail permissive.
 *
 *   3. REQUEST — `POST /customer/loads/request` uses `@Body() body: any`
 *      (no DTO validation). Response is whatever `loadCreationService.create`
 *      returns, which is the full `formatLoadResponse` envelope again.
 *
 * No `.strict()` on detail/request because the envelope has many optional
 * lifecycle timestamps (`assignedAt`, `inTransitAt`, `deliveredAt`, ...) plus
 * conditional `legs[]` (relay-only). We assert the fields that matter and
 * allow the rest.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ── GET /customer/loads — List item ───────────────────────────────────

export const CustomerLoadListItemSchema = z
  .object({
    loadId: stringId,
    loadNumber: z.string(),
    status: z.string(),
    customerName: z.string().nullable(),
    estimatedDelivery: z.string().nullable(),
    originCity: z.string().nullable(),
    originState: z.string().nullable(),
    destinationCity: z.string().nullable(),
    destinationState: z.string().nullable(),
    trackingToken: z.string().nullable(),
    createdAt: isoDateString,
  })
  .strict();

// ── GET /customer/loads/:id & POST /customer/loads/request ────────────
//
// Both endpoints return the full `formatLoadResponse` envelope. We capture
// the commonly-asserted top-level fields and allow the tail of timestamps
// + optional relay shape via .optional()/.nullable() without .strict().

const LoadStopItemSchema = z.object({
  id: dbId,
  stopId: stringId,
  sequenceOrder: z.number().int(),
  actionType: z.string(),
  status: z.string(),
});

export const CustomerLoadDetailSchema = z.object({
  id: dbId,
  loadId: stringId,
  loadNumber: z.string(),
  status: z.string(),
  weightLbs: z.number().nullable(),
  commodityType: z.string().nullable(),
  customerName: z.string().nullable(),
  customerId: z.number().nullable(),
  rateCents: z.number().nullable(),
  pieces: z.number().nullable(),
  referenceNumber: z.string().nullable(),
  requiredEquipmentType: z.string().nullable(),
  trackingToken: z.string().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  pickupDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  stops: z.array(LoadStopItemSchema),
});
