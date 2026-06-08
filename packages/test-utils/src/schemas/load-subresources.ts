/**
 * API Contracts for Load sub-resource endpoints: charges, notes, activity,
 * messages, driver-actions, money-codes.
 *
 * Hand-written (not re-exported from shared-types) because:
 *
 *   1. `packages/shared-types/src/fleet/driver-action.schema.ts` and
 *      `money-code.schema.ts` import from `zod/v4` — this workspace is on
 *      zod v3. Re-export yields type-mismatch errors. Mirror the shapes
 *      locally against the live `formatResponse` in each service.
 *
 *   2. `packages/shared-types/src/fleet/message.schema.ts` IS zod v3, but
 *      declares `role: z.enum(['driver','dispatcher','system'])`. We keep
 *      the local schema so all six sub-resources live in one file and
 *      evolve together as the controllers change.
 *
 *   3. Note + activity shapes have no shared-types counterpart — they are
 *      service-local projections.
 *
 * Services sourced:
 *   - `apps/backend/src/domains/fleet/loads/services/load-charges.service.ts`
 *     → `formatChargeResponse`.
 *   - `apps/backend/src/domains/fleet/loads/services/load-notes.service.ts`
 *     → returns the raw Prisma `LoadNote` row (NestJS serializes Date → ISO).
 *   - `apps/backend/src/domains/fleet/loads/controllers/loads.controller.ts`
 *     → `getActivity` merges events + notes into a discriminated union.
 *   - `apps/backend/src/domains/fleet/loads/controllers/load-messages.controller.ts`
 *     → inline projection (`{id, role, content, senderId, createdAt}`).
 *   - `apps/backend/src/domains/fleet/loads/services/driver-actions.service.ts`
 *     → `formatResponse`.
 *   - `apps/backend/src/domains/fleet/loads/services/money-code.service.ts`
 *     → `formatResponse` + `getLumperInsights` shape.
 *
 * No `.passthrough()`. Strict shapes enforced at the call site via
 * `.strict()` in each spec.
 */
import { z } from 'zod';
import { dbId, isoDateString, nullableIsoDate } from './helpers.js';

// ── Charges ─────────────────────────────────────────────────────────

export const LoadChargeSchema = z.object({
  id: dbId,
  loadId: dbId,
  chargeType: z.string().min(1),
  description: z.string(),
  quantity: z.number().int().nonnegative(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  isBillable: z.boolean(),
  isPayable: z.boolean(),
  createdAt: isoDateString,
});

// ── Notes ───────────────────────────────────────────────────────────
//
// Service returns the Prisma `LoadNote` row directly. Prisma model fields
// (from schema.prisma, lines 1863-1877): id, loadId, userId, content,
// noteType, isPinned, createdAt, updatedAt. There is NO `pinnedAt` column
// on the model — `LoadNotesService.pinNote` only flips `isPinned`.
// NestJS class-serializer converts Date → ISO string at the HTTP boundary.

export const LoadNoteSchema = z.object({
  id: dbId,
  loadId: dbId,
  userId: dbId,
  content: z.string(),
  noteType: z.string().min(1),
  isPinned: z.boolean(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ── Activity (merged events + notes) ────────────────────────────────
//
// `LoadsController.getActivity` emits an array where each item is either
// `{ type: 'event', ... }` or `{ type: 'note', ... }`. Zod discriminated
// union catches type drift precisely.

export const LoadActivityEventItemSchema = z.object({
  type: z.literal('event'),
  id: dbId,
  eventType: z.string().min(1),
  fromValue: z.string().nullable(),
  toValue: z.string().nullable(),
  description: z.string().nullable(),
  userId: z.number().int().nullable(),
  // Prisma `metadata Json?` — can be any shape or null. We keep it loose
  // because this is a pass-through of caller-provided JSON.
  metadata: z.unknown(),
  createdAt: isoDateString,
});

export const LoadActivityNoteItemSchema = z.object({
  type: z.literal('note'),
  id: dbId,
  content: z.string(),
  noteType: z.string().min(1),
  isPinned: z.boolean(),
  userId: z.number().int().nullable(),
  createdAt: isoDateString,
});

export const LoadActivityItemSchema = z.discriminatedUnion('type', [
  LoadActivityEventItemSchema,
  LoadActivityNoteItemSchema,
]);

// ── Messages ────────────────────────────────────────────────────────
//
// `getMessages` / `sendMessage` emit the same shape:
//   { id, role, content, senderId, createdAt }
//
// - `getMessages` sets `senderId = m.inputMode` (which is the role string:
//   "driver" or "dispatcher" — the controller uses it as a sender marker).
// - `sendMessage` sets `senderId = user.userId` (string user public id).
//
// So `senderId` is `z.string()` — the producer is one of two places but
// both emit strings. Tests assert the narrower shape at the call site.

export const LoadMessageRoleSchema = z.enum(['driver', 'dispatcher', 'system']);

export const LoadMessageSchema = z.object({
  id: z.string().min(1),
  role: LoadMessageRoleSchema,
  content: z.string(),
  senderId: z.string(),
  createdAt: isoDateString,
});

export const UnreadCountResponseSchema = z.object({
  count: z.number().int().nonnegative(),
});

export const MarkMessageReadResponseSchema = z.object({
  success: z.literal(true),
});

export const MarkMessageDeliveredResponseSchema = z.object({
  success: z.literal(true),
});

// ── Driver Actions ──────────────────────────────────────────────────

export const DriverActionTypeSchema = z.enum(['detention', 'scale_ticket', 'fuel_receipt', 'issue_report']);

export const DriverActionStatusSchema = z.enum(['submitted', 'acknowledged', 'resolved']);

export const DriverActionSchema = z.object({
  id: dbId,
  actionRequestId: z.string().min(1),
  loadId: dbId,
  stopId: z.number().int().nullable(),
  driverId: dbId,
  actionType: DriverActionTypeSchema,
  status: DriverActionStatusSchema,
  note: z.string().nullable(),
  // Prisma `metadata Json?` — can be any shape or null.
  metadata: z.unknown(),
  documentId: z.number().int().nullable(),
  loadChargeId: z.number().int().nullable(),
  acknowledgedAt: nullableIsoDate,
  resolvedAt: nullableIsoDate,
  createdAt: isoDateString,
});

// ── Money Codes ─────────────────────────────────────────────────────

export const MoneyCodeMethodSchema = z.enum(['comchek', 'efs', 'cash']);

export const MoneyCodeStatusSchema = z.enum(['requested', 'approved', 'denied', 'used', 'expired', 'cancelled']);

export const MoneyCodeSchema = z.object({
  id: dbId,
  moneyCodeId: z.string().min(1),
  loadId: dbId,
  stopId: z.number().int().nullable(),
  driverId: dbId,
  code: z.string().nullable(),
  amountCents: z.number().int(),
  requestedCents: z.number().int(),
  method: MoneyCodeMethodSchema,
  status: MoneyCodeStatusSchema,
  requestedAt: isoDateString,
  approvedAt: nullableIsoDate,
  usedAt: nullableIsoDate,
  expiresAt: nullableIsoDate,
  driverNote: z.string().nullable(),
  dispatcherNote: z.string().nullable(),
  receiptDocumentId: z.number().int().nullable(),
  loadChargeId: z.number().int().nullable(),
  createdAt: isoDateString,
});

// ── Dispatch Sheet (email-send envelope) ────────────────────────────
//
// `DispatchSheetEmailService.sendDispatchSheet` returns
// `{ sent: boolean; sentTo: string }`. The controller passes this through
// verbatim, both for the load-level and the leg-level send endpoints.
// No `messageId` field — we send via Resend but do not surface the remote
// id (see `dispatch-sheet-email.service.ts`).

export const DispatchSheetSendResponseSchema = z.object({
  sent: z.boolean(),
  sentTo: z.string().min(1),
});

// ── Load Legs ───────────────────────────────────────────────────────
//
// `LoadLegService.getLegsForLoad` emits raw Prisma rows with nested
// driver/vehicle/originStop/destStop includes — NOT a flattened projection.
// Shared-types `LoadLegSchema` (flat shape with `driverName`,
// `vehicleUnitNumber`, etc.) does NOT match the live response; keep this
// local. When the service grows a `formatLegResponse` that matches
// shared-types, delete this and re-export.
//
// Nested shapes intentionally left as `z.unknown()` — they are Prisma rows
// whose full shape depends on the includes; we assert the top-level fields
// the tests actually need (id, legId, sequence, status, FKs, timestamps).

export const LoadLegStatusSchema = z.enum(['pending', 'assigned', 'in_transit', 'on_hold', 'delivered', 'cancelled']);

export const LoadLegSchema = z.object({
  id: dbId,
  legId: z.string().min(1),
  sequence: z.number().int().positive(),
  status: LoadLegStatusSchema,
  // `driverId` / `vehicleId` / `trailerId` are numeric Driver/Vehicle/Trailer
  // PKs — nullable because legs start unassigned.
  driverId: z.number().int().nullable(),
  vehicleId: z.number().int().nullable(),
  trailerId: z.number().int().nullable(),
  // `originStopId` / `destStopId` reference LoadStop.id (numeric PK).
  originStopId: dbId,
  destStopId: dbId,
  loadId: dbId,
  tenantId: z.number().int(),
  routePlanId: z.number().int().nullable(),
  actualMiles: z.number().nullable(),
  assignedAt: nullableIsoDate,
  pickedUpAt: nullableIsoDate,
  deliveredAt: nullableIsoDate,
  createdAt: isoDateString,
  updatedAt: isoDateString,
  // Prisma include payloads — shape depends on the query's `include`. We keep
  // these loose and let the test call site inspect specific fields semantically.
  driver: z.unknown().nullable().optional(),
  vehicle: z.unknown().nullable().optional(),
  trailer: z.unknown().nullable().optional(),
  originStop: z.unknown().optional(),
  destStop: z.unknown().optional(),
  routePlan: z.unknown().nullable().optional(),
  // `load` include (only present on POST /legs creation path).
  load: z.unknown().optional(),
});

// ── Update Leg Status response ──────────────────────────────────────
//
// `advanceLegStatus` returns the updated leg with driver/vehicle/origin/dest
// Prisma includes — same shape as a list item from `getLegsForLoad`.
export const UpdateLegStatusResponseSchema = LoadLegSchema;

// ── Assign-all-legs response (full Load, `formatLoadResponse`) ──────
//
// `LoadAssignmentService.assignAllLegs` → `loadQueryService.findOne(loadId)`
// which returns `formatLoadResponse`. Shape matches `LoadResponseSchema` in
// schemas/loads.ts. Kept as a separate alias here so callers can import
// everything from `LoadSubresourceSchemas` without crossing module
// boundaries — the test imports `LoadResponseSchema` directly anyway.

// ── Driver view (GET /loads/:id/driver-view) ────────────────────────
//
// Driver-scoped relay leg projection — one item per leg the driver owns.
// Fields come from the inline `driverLegs.map(...)` block at
// `loads.controller.ts:741-776`. Strictly typed.

const DriverViewStopSchema = z.object({
  id: dbId,
  actionType: z.string().min(1),
  stopName: z.string().nullable(),
  stopCity: z.string().nullable(),
  stopState: z.string().nullable(),
  stopAddress: z.string().nullable(),
});

export const DriverViewItemSchema = z.object({
  legId: z.string().min(1),
  legSequence: z.number().int().positive(),
  totalLegs: z.number().int().positive(),
  isRelay: z.literal(true),
  isFinalLeg: z.boolean(),
  status: LoadLegStatusSchema,
  loadId: z.string().min(1),
  loadNumber: z.string().min(1),
  loadStatus: z.string().min(1),
  customerName: z.string().min(1),
  commodityType: z.string().min(1),
  weightLbs: z.number().int().nonnegative(),
  requiredEquipmentType: z.string().nullable(),
  specialRequirements: z.string().nullable(),
  originStop: DriverViewStopSchema.nullable(),
  destStop: DriverViewStopSchema.nullable(),
});

// ── Driver Recommendations ──────────────────────────────────────────
//
// Hand-written to match `DriverRecommendationDto` in
// `apps/backend/src/domains/fleet/loads/dto/driver-recommendation.dto.ts`.
// Controller wraps the array in `{ recommendations: [...] }`.

export const DriverRecommendationHosSchema = z.object({
  driveHoursRemaining: z.number(),
  shiftHoursRemaining: z.number(),
  cycleHoursRemaining: z.number(),
  breakHoursRemaining: z.number(),
  nextResetAt: z.string().nullable(),
});

export const DriverRecommendationProximitySchema = z.object({
  distanceMilesFromPickup: z.number(),
  lastKnownLocation: z.string(),
});

export const DriverRecommendationAvailabilitySchema = z.object({
  status: z.enum(['available', 'on_load', 'resting']),
  currentLoadNumber: z.string().nullable(),
  currentLoadEta: z.string().nullable(),
  availableAt: isoDateString,
});

export const DriverRecommendationVehicleSchema = z
  .object({
    vehicleId: z.string().min(1),
    unitNumber: z.string().min(1),
    equipmentType: z.string(),
  })
  .nullable();

export const DriverRecommendationSchema = z.object({
  driverId: z.string().min(1),
  name: z.string().min(1),
  initials: z.string().min(1).max(3),
  matchScore: z.number().int(),
  matchRationale: z.string(),
  isBestMatch: z.boolean(),
  equipmentMatch: z.boolean(),
  equipmentType: z.string().nullable(),
  hos: DriverRecommendationHosSchema,
  proximity: DriverRecommendationProximitySchema,
  availability: DriverRecommendationAvailabilitySchema,
  vehicle: DriverRecommendationVehicleSchema,
  activeLoadCount: z.number().int().nonnegative(),
});

export const DriverRecommendationsResponseSchema = z.object({
  recommendations: z.array(DriverRecommendationSchema),
});

// ── Generate Route response ─────────────────────────────────────────
//
// `RoutePlanningEngineService.planRoute` returns either a `RoutePlanResult`
// (single load) or a `RelayRoutePlanResult` (isRelay=true). We only call
// this from non-relay routing tests, so we target `RoutePlanResult`:
//
//   { planId, status, isFeasible, feasibilityIssues, totalDistanceMiles,
//     totalDriveTimeHours, totalTripTimeHours, totalDrivingDays,
//     totalCostEstimate, departureTime (ISO), estimatedArrival (ISO),
//     segments, complianceReport, weatherAlerts, dailyBreakdown,
//     costBreakdown?, initialFuelPercent? }
//
// The nested segment/compliance/day shapes are internal to the simulator
// and not surfaced as tested contract — keep them `z.unknown()` so we
// assert on the top-level fields we care about without brittle coupling to
// simulator internals. If a specific nested assertion is added later,
// tighten here.

export const GenerateRouteResponseSchema = z.object({
  planId: z.string().min(1),
  status: z.string().min(1),
  isFeasible: z.boolean(),
  feasibilityIssues: z.array(z.string()),
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalTripTimeHours: z.number(),
  totalDrivingDays: z.number(),
  totalCostEstimate: z.number(),
  departureTime: isoDateString,
  estimatedArrival: isoDateString,
  segments: z.array(z.unknown()),
  complianceReport: z.unknown(),
  weatherAlerts: z.array(z.unknown()),
  dailyBreakdown: z.array(z.unknown()),
  costBreakdown: z.unknown().optional(),
  initialFuelPercent: z.number().optional(),
});

// ── Assign-with-route response ──────────────────────────────────────
//
// `RoutePlanPersistenceService.activatePlan` returns a Prisma RoutePlan
// row with all columns included, plus `segments`, `loads`, `driver`,
// `vehicle` Prisma includes, and `totalCostEstimate` mutated cents→dollars
// by `convertPlanCentsToDollars`. Shape mirrors `model RoutePlan` in
// `apps/backend/prisma/schema.prisma:1062-1125` field-for-field so
// `.strict()` is durable against accidental column additions.
//
// Prisma converts DateTime → ISO string at the HTTP boundary via the
// global JSON serializer. Json? columns stay as arbitrary JSON blobs —
// we keep those loose (`z.unknown()`) since the simulator output changes
// across versions and isn't part of this endpoint's tested contract.

export const AssignWithRouteResponseSchema = z.object({
  id: z.number().int(),
  planId: z.string().min(1),
  driverId: z.number().int(),
  vehicleId: z.number().int(),
  tenantId: z.number().int(),
  planVersion: z.number().int(),
  isActive: z.boolean(),
  status: z.string().min(1),
  optimizationPriority: z.string().min(1),
  totalDistanceMiles: z.number(),
  totalDriveTimeHours: z.number(),
  totalOnDutyTimeHours: z.number(),
  // `centsToDollars` runs on totalCostEstimate before serialization.
  totalCostEstimate: z.number().nullable(),
  isFeasible: z.boolean(),
  feasibilityIssues: z.unknown().nullable(),
  complianceReport: z.unknown().nullable(),
  activatedAt: nullableIsoDate,
  departureTime: nullableIsoDate,
  estimatedArrival: nullableIsoDate,
  completedAt: nullableIsoDate,
  cancelledAt: nullableIsoDate,
  totalTripTimeHours: z.number(),
  totalDrivingDays: z.number().int(),
  dispatcherParams: z.unknown().nullable(),
  dailyBreakdown: z.unknown().nullable(),
  costBreakdown: z.unknown().nullable(),
  initialFuelPercent: z.number().int().nullable(),
  supersededById: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  tripId: z.number().int().nullable(),
  // Prisma include payloads — shape depends on select-include tree.
  segments: z.array(z.unknown()),
  loads: z.array(z.unknown()),
  driver: z.unknown(),
  vehicle: z.unknown(),
});

// `getLumperInsights` returns:
//   { facilityAvg: { avg, count } | null,
//     driverHistory: { count, allMatched } | null,
//     facilityName: string | null }
export const MoneyCodeInsightsResponseSchema = z.object({
  facilityAvg: z
    .object({
      avg: z.number().int(),
      count: z.number().int().nonnegative(),
    })
    .nullable(),
  driverHistory: z
    .object({
      count: z.number().int().nonnegative(),
      allMatched: z.boolean(),
    })
    .nullable(),
  facilityName: z.string().nullable(),
});
