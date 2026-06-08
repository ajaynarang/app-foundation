/**
 * API Contracts for Settlement endpoints (Phase 2 Group 2e).
 *
 * Reconciled against:
 *   - apps/backend/src/domains/financials/settlements/services/settlements.service.ts
 *   - apps/backend/src/domains/financials/settlements/services/settlement-pdf.service.ts
 *   - apps/backend/src/domains/financials/settlements/controllers/settlements.controller.ts
 *   - packages/shared-types/src/financials/settlement.schema.ts
 *
 * Why hand-written + not `@sally/shared-types`:
 *   - shared-types' `SettlementSchema` bakes in fields the wire doesn't always
 *     emit (`updatedAt` is absent on some mutations; `driver.payStructures`
 *     is present on detail but not on list projections; `approvedAt` /
 *     `paidAt` are ISO strings on the wire but typed as `z.string().nullable()`
 *     there — still hand-writing so tests can use `.strict()` safely).
 *   - The service's `serializeDateFields` helper emits `periodStart` /
 *     `periodEnd` as YYYY-MM-DD date strings (`@db.Date` columns). Other
 *     timestamps (`createdAt`, `approvedAt`, `paidAt`) stay ISO.
 *   - The `deductions` endpoint returns a bare Prisma row (no serialisation
 *     layer); its shape is distinct from the nested deductions on detail.
 *
 * Drift notes — kept in one place so future migrations know what to change:
 *   - `Settlement.updatedAt` column exists (`@updatedAt`) but is absent on
 *     `updateNotes` response (the service returns the raw `prisma.update`
 *     row which DOES include `updatedAt`). Safer to accept both.
 *   - `approve`, `markPaid`, `voidSettlement` include `{ driver, lineItems,
 *     deductions }`. `updateNotes` does not include relations at all.
 *   - `addDeduction` returns a single `SettlementDeduction` row (Prisma
 *     shape). `removeDeduction` returns `undefined` (no return from service
 *     — controller forwards) which NestJS emits as empty 200.
 *   - Driver self-service list uses the same `findAll` path as dispatcher
 *     list — identical shape, driver-scoped `where`.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString, dateOnlyString, nullableIsoDate } from './helpers.js';

// ── Enum mirrors (shared-types parity, hand-written so .strict() works) ─────

const SettlementStatusSchema = z.enum(['DRAFT', 'APPROVED', 'PAID', 'VOID']);

const PayStructureTypeSchema = z.enum(['PER_MILE', 'PERCENTAGE', 'FLAT_RATE', 'HYBRID']);

const DeductionTypeSchema = z.enum(['FUEL_ADVANCE', 'CASH_ADVANCE', 'INSURANCE', 'EQUIPMENT_LEASE', 'ESCROW', 'OTHER']);

// ── Sub-shapes ──────────────────────────────────────────────────────────────

/** Driver projection — `select: { driverId, name }` in the service. */
const SettlementDriverSchema = z.object({
  driverId: stringId,
  name: z.string(),
});

/**
 * SettlementDeduction row — raw Prisma `SettlementDeduction` shape.
 *
 * Created via `addDeduction` (returns the row directly). Also nested on
 * detail via the `deductions` include.
 */
export const SettlementDeductionResponseSchema = z.object({
  id: dbId,
  settlementId: dbId,
  type: DeductionTypeSchema,
  description: z.string(),
  amountCents: z.number().int(),
  // Drift note: the Prisma `SettlementDeduction` model has NO `createdAt`
  // or `updatedAt` columns (see schema.prisma line 3247) — unique among
  // settlements-domain rows. See finding #22 for rationale.
});

/**
 * SettlementLineItem row — the include on list + detail projections is:
 *   `{ load: { select: { loadNumber, loadId } }, leg: { select: { legId,
 *     sequence } } }` on findOne; list adds the bare `lineItems: true`
 *   (no load/leg nested) — hand both as optional.
 */
const SettlementLineItemSchema = z.object({
  id: dbId,
  settlementId: dbId,
  loadId: dbId,
  legId: z.number().int().nullable(),
  tripId: z.number().int().nullable(),
  description: z.string(),
  miles: z.number().nullable(),
  loadRevenueCents: z.number().int().nullable(),
  payAmountCents: z.number().int(),
  payStructureType: PayStructureTypeSchema,
  rateSnapshot: z.record(z.unknown()).nullable(),
  // Drift note: `createdAt` is emitted for lineItems on findOne's nested
  // include, but NOT on the state-mutation envelopes (approve/pay/void)
  // which re-query with the simpler `{ lineItems: true }` shape. Hand
  // `.optional()` so the schema parses both.
  createdAt: isoDateString.optional(),
  load: z
    .object({
      loadNumber: z.string(),
      loadId: stringId,
    })
    .optional(),
  leg: z
    .object({
      legId: stringId,
      sequence: z.number().int(),
    })
    .nullable()
    .optional(),
});

// ── Settlement record — the canonical shape ─────────────────────────────────
//
// Used by calculate (201), findOne (200), findAll rows (200), approve,
// markPaid, voidSettlement. `serializeDateFields` emits periodStart /
// periodEnd as YYYY-MM-DD.

export const SettlementResponseSchema = z.object({
  id: dbId,
  settlementId: stringId,
  settlementNumber: z.string(),
  status: SettlementStatusSchema,
  driverId: dbId,
  periodStart: dateOnlyString,
  periodEnd: dateOnlyString,
  grossPayCents: z.number().int(),
  deductionsCents: z.number().int(),
  netPayCents: z.number().int(),
  notes: z.string().nullable(),
  approvedBy: z.number().int().nullable(),
  approvedAt: nullableIsoDate,
  paidAt: nullableIsoDate,
  tenantId: dbId,
  externalBillId: z.string().nullable(),
  // Drift note: `externalSyncVersion` is on the Prisma model but not on the
  // `@sally/shared-types` Settlement schema. Hand-wire it here.
  externalSyncVersion: z.string().nullable(),
  externalSyncedAt: nullableIsoDate,
  externalSyncError: z.string().nullable(),
  // `createdBy` (numeric user id) is on the Prisma model. Null for
  // settlements created by the calculate worker — only populated when the
  // service is extended to stamp the originating user.
  createdBy: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  driver: SettlementDriverSchema.optional(),
  lineItems: z.array(SettlementLineItemSchema).optional(),
  deductions: z.array(SettlementDeductionResponseSchema).optional(),
});

/** `findAll` returns a flat array (no envelope). */
export const SettlementListResponseSchema = z.array(SettlementResponseSchema);

// ── Summary — distinct aggregate shape ──────────────────────────────────────

export const SettlementSummaryResponseSchema = z.object({
  pendingApproval: z.number().int(),
  pendingApprovalCents: z.number().int(),
  readyToPay: z.number().int(),
  readyToPayCents: z.number().int(),
  paidThisMonthCents: z.number().int(),
  activeDrivers: z.number().int(),
  avgSettlementCents: z.number().int(),
});

// ── Notes update response ──────────────────────────────────────────────────
//
// `updateNotes` returns the raw `prisma.update` row. That row has NO
// relation includes (no `driver`, no `lineItems`, no `deductions`) — the
// service intentionally returns it bare. It also does NOT pass through
// `serializeDateFields`, so `periodStart` + `periodEnd` arrive as ISO
// strings (not date-only). Hand-writing that divergence so the contract
// test catches the day the service starts passing the row through the
// serializer.

export const SettlementNotesUpdateResponseSchema = z.object({
  id: dbId,
  settlementId: stringId,
  settlementNumber: z.string(),
  status: SettlementStatusSchema,
  driverId: dbId,
  periodStart: isoDateString,
  periodEnd: isoDateString,
  grossPayCents: z.number().int(),
  deductionsCents: z.number().int(),
  netPayCents: z.number().int(),
  notes: z.string().nullable(),
  approvedBy: z.number().int().nullable(),
  approvedAt: nullableIsoDate,
  paidAt: nullableIsoDate,
  tenantId: dbId,
  externalBillId: z.string().nullable(),
  externalSyncVersion: z.string().nullable(),
  externalSyncedAt: nullableIsoDate,
  externalSyncError: z.string().nullable(),
  createdBy: z.number().int().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ── Pay-structure response (used by setup helper, not a test under this group)

/**
 * PUT /pay-structures/:driverId response — DriverPayStructure row from
 * `PayStructureService.upsert` via `serializeDateFields`. `effectiveFrom`
 * emits as YYYY-MM-DD; `effectiveTo` nullable YYYY-MM-DD. `effectiveDate`
 * alias.
 */
export const DriverPayStructureResponseSchema = z.object({
  id: dbId,
  driverId: dbId,
  type: PayStructureTypeSchema,
  ratePerMileCents: z.number().int().nullable(),
  percentage: z.number().nullable(),
  flatRateCents: z.number().int().nullable(),
  hybridBaseCents: z.number().int().nullable(),
  hybridPercent: z.number().nullable(),
  effectiveFrom: dateOnlyString,
  effectiveTo: dateOnlyString.nullable(),
  isActive: z.boolean(),
  notes: z.string().nullable(),
  tenantId: dbId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
  effectiveDate: dateOnlyString,
});

// ── Batch response schemas (Phase 2 Group 2f) ───────────────────────────────
//
// Reconciled against `apps/backend/.../settlements/services/settlements.service.ts`:
//   - previewBatch   → `{ drivers: PreviewRow[] }`
//   - batchCalculate → `{ settlements: Settlement[], errors: [{driverId,error}],
//                         total, successCount }`
//   - batchApprove   → `{ approved, skipped }`
//   - batchPay       → `{ paid, skipped }`
//   - batchVoid      → `{ voided, skipped }`
//   - batchPdf       → application/zip (no JSON — asserted via Content-Type)
//
// `PreviewRow` is hand-written because the preview response does NOT overlap
// cleanly with any Prisma row — `payType` / `rate` are synthesised by
// `formatRate`. Rows for ineligible drivers omit some fields (`payType: null,
// rate: null`) and add `warning` text — the schema models both branches.

/**
 * One row in the `drivers` array returned by POST /settlements/preview-batch.
 *
 * Eligible row: `payType: PayStructureType`, `rate: string`, `loadCount >= 1`,
 *   `eligible: true`, `warning: null`.
 * Ineligible row: `payType: null`, `rate: null`, `loadCount: 0`,
 *   `eligible: false`, `warning: string` (e.g. "No pay structure configured"
 *   or "No delivered loads in period").
 */
const PreviewBatchDriverRowSchema = z.object({
  driverId: stringId,
  name: z.string(),
  payType: PayStructureTypeSchema.nullable(),
  rate: z.string().nullable(),
  loadCount: z.number().int().nonnegative(),
  estimatedPayCents: z.number().int(),
  eligible: z.boolean(),
  warning: z.string().nullable(),
});

export const PreviewBatchResponseSchema = z.object({
  drivers: z.array(PreviewBatchDriverRowSchema),
});

/**
 * POST /settlements/batch-calculate response.
 *
 * `settlements[]` entries are the mutation-flavor Settlement shape — same
 * `SettlementResponseSchema` used elsewhere, but the service returns
 * `serializeDateFields(settlement)` from the single-driver calculate path so
 * every field is present. Declared as `z.unknown()` here to avoid a circular
 * dependency across the line-item `.load` / `.leg` nested includes; callers
 * re-validate each row with `SettlementResponseSchema.strict()` via a
 * follow-up GET /settlements/:id in the test body (same pattern as
 * `BatchGenerateResponseSchema.generated[]` in factoring.ts).
 *
 * `errors[]` entries are `{ driverId: <public id>, error: <message> }`.
 */
export const BatchCalculateResponseSchema = z.object({
  settlements: z.array(z.unknown()),
  errors: z.array(
    z.object({
      driverId: z.string(),
      error: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
});

/** POST /settlements/batch-approve — `{ approved, skipped }`. */
export const BatchApproveResponseSchema = z.object({
  approved: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** POST /settlements/batch-pay — `{ paid, skipped }`. */
export const BatchPayResponseSchema = z.object({
  paid: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** POST /settlements/batch-void — `{ voided, skipped }`. */
export const BatchVoidResponseSchema = z.object({
  voided: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

// ── Legacy exports (kept for backward-compat with other specs) ──────────────
//
// Pre-Phase-2 the module exported thin list/detail/summary schemas. No
// other spec in the repo imports them today (Phase 2 Group 2e is the
// first settlements spec set), but keeping the prior names as aliases
// avoids breaking downstream imports if any appear mid-phase.

export const SettlementListItemSchema = SettlementResponseSchema;
export const SettlementDetailSchema = SettlementResponseSchema;
export const SettlementSummarySchema = SettlementSummaryResponseSchema;
export const PayStructureSchema = DriverPayStructureResponseSchema;
