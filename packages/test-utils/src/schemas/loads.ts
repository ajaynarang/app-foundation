/**
 * API Contracts for Load endpoints.
 *
 * Hand-written against the real `formatLoadResponse` in
 * `apps/backend/src/domains/fleet/loads/utils/format-load-response.ts` because
 * `@app/shared-types/fleet/load.schema.ts` `LoadSchema` drifts from the
 * backend's actual output in several ways:
 *
 *   1. `vehicleId` (numeric FK) is emitted by `formatLoadResponse` but missing
 *      from shared-types `LoadSchema` (shared-types exposes `vehicleNumber`
 *      only). `.strict()` parse fails.
 *
 *   2. Stop shape — backend emits `stopId` as a number (FK to `Stop.id`) and
 *      adds flattened `stopCity/stopState/stopAddress/stopZipCode/stopStopId`
 *      fields. Shared-types `LoadStopSchema` types `stopId` as a number but
 *      is missing `stopStopId` as a required surface.
 *
 *   3. `activeLeg` is emitted for relay loads only — shared-types has no
 *      field for it and `.strict()` rejects.
 *
 * These schemas capture the backend's exact emitted shape. When shared-types
 * catches up (and we verify field-for-field), this file can re-export from
 * shared-types with a thin extension. Until then, stay local.
 *
 * Envelopes:
 *   GET /loads                           → { data, total, limit, offset }
 *   POST /loads/:id/tracking-token       → { trackingToken, trackingUrl }   (see tracking.ts)
 *   GET /loads/:id/revert-preview        → { from, to, affectedInvoices, affectedSettlementLines, affectedStops, warnings, blocked, blockReason }
 *   DELETE /loads/:id                    → { deleted: true, loadId }
 *   GET /loads/:id/stops                 → LoadStopItemSchema[]
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString, dateOnlyString, nullableIsoDate } from './helpers.js';

// ── Enums (mirrored from the Prisma LoadStatus enum + state machine) ──

export const LoadStatusSchema = z.enum([
  'TENDER',
  'DRAFT',
  'PENDING',
  'ASSIGNED',
  'IN_TRANSIT',
  'ON_HOLD',
  'DELIVERED',
  'CANCELLED',
  'TONU',
]);

// ── Stop (as emitted by formatLoadResponse within a Load detail) ─────

export const LoadStopItemSchema = z.object({
  id: dbId,
  stopId: dbId,
  sequenceOrder: z.number().int().nonnegative(),
  actionType: z.string().min(1),
  appointmentDate: dateOnlyString.nullable(),
  earliestArrival: z.string().nullable(),
  latestArrival: z.string().nullable(),
  estimatedDockHours: z.number().nonnegative(),
  actualDockHours: z.number().nullable(),
  status: z.string().min(1),
  arrivedAt: nullableIsoDate,
  completedAt: nullableIsoDate,
  bolNumber: z.string().nullable(),
  podSignedBy: z.string().nullable(),
  driverNotes: z.string().nullable(),
  dispatcherNotes: z.string().nullable(),
  actualWeight: z.number().nullable(),
  actualPieces: z.number().nullable(),
  detentionMinutes: z.number().nullable(),
  stopName: z.string().nullable(),
  stopCity: z.string().nullable(),
  stopState: z.string().nullable(),
  stopAddress: z.string().nullable(),
  stopZipCode: z.string().nullable(),
  stopLat: z.number().nullable(),
  stopLon: z.number().nullable(),
  stopStopId: z.string().nullable(),
  // `uploadedDocuments` is enriched by `enrichStopsWithDocuments` ONLY for
  // the list/detail read paths after document upload. On every write path
  // (POST /loads, PATCH /loads/:id, duplicate, status-change, revert,
  // etc.) the field defaults to `[]` — that's the invariant we assert.
  // Documents themselves have their own contract (DocumentSchema) — not
  // this schema's concern. Typed as an array of unknown so strict() does
  // not reject when the read-path enriches with Document records.
  uploadedDocuments: z.array(z.unknown()),
});

// ── Full load (POST /loads, GET /loads/:id, PATCH /loads/:id, …) ─────

const LoadResponseBaseFields = {
  id: dbId,
  loadId: stringId,
  loadNumber: z.string().min(1),
  status: LoadStatusSchema,
  weightLbs: z.number().int().nonnegative(),
  commodityType: z.string().min(1),
  specialRequirements: z.string().nullable(),
  customerName: z.string().min(1),
  requiredEquipmentType: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  rateCents: z.number().int().nullable(),
  billingStatus: z.string().nullable(),
  pieces: z.number().int().nullable(),
  intakeSource: z.string().nullable(),
  intakeMetadata: z.unknown().nullable(),
  trackingToken: z.string().nullable(),
  customerId: z.number().int().nullable(),
  driverId: z.number().int().nullable(),
  driverName: z.string().nullable(),
  vehicleId: z.number().int().nullable(),
  vehicleNumber: z.string().nullable(),
  isActive: z.boolean(),
  pickupDate: dateOnlyString.nullable(),
  deliveryDate: dateOnlyString.nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  estimatedMiles: z.number().nullable(),
  actualMiles: z.number().nullable(),
  routePlan: z
    .object({
      planId: z.string().min(1),
      status: z.string().min(1),
    })
    .nullable(),
  assignedAt: nullableIsoDate,
  inTransitAt: nullableIsoDate,
  deliveredAt: nullableIsoDate,
  cancelledAt: nullableIsoDate,
  onHoldAt: nullableIsoDate,
  onHoldReason: z.string().nullable(),
  tonuAt: nullableIsoDate,
  tonuReason: z.string().nullable(),
  minTempF: z.number().nullable(),
  maxTempF: z.number().nullable(),
  hazmatClass: z.string().nullable(),
  recurringLaneId: z.number().int().nullable(),
  isRelay: z.boolean(),
  tripId: z.string().nullable(),
  tripOrder: z.number().int().nullable(),
  tripLoadCount: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  stops: z.array(LoadStopItemSchema),
  // activeLeg is emitted as `undefined` (and omitted from JSON) for non-relay
  // loads. Model as optional.
  activeLeg: z
    .object({
      legId: z.string(),
      sequence: z.number().int(),
      status: z.string(),
      driverName: z.string().nullable(),
      vehicleUnitNumber: z.string().nullable(),
      actualMiles: z.number().nullable(),
    })
    .nullable()
    .optional(),
  // Legs + invoices only present for relay loads / loads with invoices —
  // keep them optional so strict() passes on the common case.
  legs: z.array(z.unknown()).optional(),
  invoices: z.array(z.unknown()).optional(),
};

export const LoadResponseSchema = z.object(LoadResponseBaseFields);

// ── GET /loads (paginated envelope + list-item shape) ────────────────
//
// `LoadQueryService.findAll` emits a different projection than
// `formatLoadResponse` (see `load-query.service.ts` → the `data.map(...)`
// block). Fields that differ from the detail shape:
//   - no `stops`, no `activeLeg` on non-relay, no `routePlan` nested the
//     same way, no `trackingToken`, no `isActive`, `minTempF`, `maxTempF`,
//     `hazmatClass`, `recurringLaneId`, `specialRequirements`,
//     `intakeMetadata`, `customerId`, `driverId`, `vehicleId`,
//     `cancelledAt`, `onHoldAt`, `onHoldReason`, `tonuAt`, `tonuReason`,
//     `pieces` (present but typed differently on list item).
//   - adds: `stopCount`, `missingCoordinates`, `pickupTime`,
//     `deliveryTime`, `vehicleUnitNumber`, `driverPayCents`, `payStatus`,
//     `externalLoadId`, `externalSource`, `lastSyncedAt`.

export const LoadListItemSchema = z.object({
  id: dbId,
  loadId: stringId,
  loadNumber: z.string().min(1),
  status: LoadStatusSchema,
  customerName: z.string().min(1),
  stopCount: z.number().int().nonnegative(),
  missingCoordinates: z.number().int().nonnegative(),
  weightLbs: z.number().int().nonnegative(),
  commodityType: z.string().min(1),
  requiredEquipmentType: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  rateCents: z.number().int().nullable(),
  billingStatus: z.string().nullable(),
  pieces: z.number().int().nullable(),
  intakeSource: z.string().nullable(),
  // External-sync fields are absent on manually-created loads; when a
  // TMS/Samsara sync runs they land as strings. Optional + nullable covers
  // both paths without passthrough.
  externalLoadId: z.string().nullable().optional(),
  externalSource: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
  pickupDate: dateOnlyString.nullable(),
  deliveryDate: dateOnlyString.nullable(),
  pickupTime: z.string().nullable(),
  deliveryTime: z.string().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  assignedAt: nullableIsoDate,
  inTransitAt: nullableIsoDate,
  deliveredAt: nullableIsoDate,
  routePlan: z
    .object({
      planId: z.string().min(1),
      status: z.string().min(1),
    })
    .nullable(),
  driverName: z.string().nullable(),
  vehicleUnitNumber: z.string().nullable(),
  driverPayCents: z.number().nullable(),
  payStatus: z.string().nullable(),
  isRelay: z.boolean(),
  tripId: z.string().nullable(),
  tripOrder: z.number().int().nullable(),
  tripLoadCount: z.number().int().nullable(),
  legs: z.array(z.unknown()).optional(),
  activeLeg: z.unknown().optional(),
});

export const LoadListResponseSchema = z.object({
  data: z.array(LoadListItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

// ── DELETE /loads/:id ─────────────────────────────────────────────────

export const DeleteLoadResponseSchema = z.object({
  deleted: z.literal(true),
  loadId: stringId,
});

// ── GET /loads/:id/revert-preview ─────────────────────────────────────
//
// Backend returns `status` + `actionType` on affectedStops (not
// `currentStatus` like shared-types `RevertPreviewResponseSchema`).
// Hand-written to match the real service output.

export const RevertPreviewResponseSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  affectedInvoices: z.array(
    z.object({
      id: dbId,
      invoiceNumber: z.string().min(1),
      status: z.string().min(1),
      totalCents: z.number().int(),
    }),
  ),
  affectedSettlementLines: z.array(
    z.object({
      id: dbId,
      settlementNumber: z.string().min(1),
      settlementStatus: z.string().min(1),
      payAmountCents: z.number().int(),
    }),
  ),
  affectedStops: z.array(
    z.object({
      id: dbId,
      sequenceOrder: z.number().int().nonnegative(),
      status: z.string().min(1),
      actionType: z.string().min(1),
    }),
  ),
  warnings: z.array(z.string()),
  blocked: z.boolean(),
  blockReason: z.string().nullable(),
});

// ── POST /loads/:id/tracking-token ────────────────────────────────────
//
// Same response shape as TrackingTokenResponseSchema in tracking.ts; the
// field name there is `trackingToken`, not `token`. Re-exported from
// tracking.ts to keep a single source of truth.
export { TrackingTokenResponseSchema } from './tracking.js';

// ── POST /loads/:id/assign ────────────────────────────────────────────
//
// `LoadAssignmentService.assignLoad` returns its OWN shape (not a
// formatLoadResponse) — the operation is a mutation that echoes back
// the assignment outcome + warnings, not a full load read. This is one
// of the few endpoints on LoadsController that doesn't re-read via
// findOne. See the `return { success, message, loadId, driverId, ... }`
// block at the tail of LoadAssignmentService.assignLoad.

export const AssignLoadWarningSchema = z.object({
  type: z.string().min(1),
  message: z.string().min(1),
});

export const AssignLoadResponseSchema = z.object({
  success: z.literal(true),
  message: z.string().min(1),
  loadId: stringId,
  // Echoed back as the STRING public ids that were posted in.
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
  trailerId: z.string().nullable(),
  driverName: z.string().min(1),
  vehicleUnitNumber: z.string().min(1),
  trailerUnitNumber: z.string().nullable(),
  status: LoadStatusSchema,
  warnings: z.array(AssignLoadWarningSchema),
});

// ── PATCH /loads/:id/stops/:stop_id/status ────────────────────────────
//
// `StopStatusService.updateStopStatus` returns:
//   `{ stopId, status, arrivedAt?, loadingStartedAt?, completedAt?,
//      detentionMinutes? }`  — a thin shape, not the full stop row.

export const UpdateStopStatusResponseSchema = z.object({
  stopId: dbId,
  status: z.enum(['ARRIVED', 'IN_PROGRESS', 'COMPLETED']),
  arrivedAt: z.union([z.string(), z.date()]).optional(),
  loadingStartedAt: z.union([z.string(), z.date()]).optional(),
  completedAt: z.union([z.string(), z.date()]).optional(),
  detentionMinutes: z.number().int().nullable().optional(),
});

// ── Re-exported aliases for legacy call sites ─────────────────────────
//
// Earlier QA specs referred to these names. They now all resolve to the
// single LoadResponseSchema — every mutating/read path on the main
// controller returns the same `formatLoadResponse` shape.

export const CreateLoadResponseSchema = LoadResponseSchema;
export const LoadDetailSchema = LoadResponseSchema;
export const LoadStatusChangeSchema = LoadResponseSchema;
