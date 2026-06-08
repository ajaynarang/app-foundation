/**
 * API contracts for IFTA endpoints (quarters, mileage, fuel, tax rates,
 * calculate).
 *
 * No shared-types coverage exists for these endpoints as of 2026-04-17, so
 * every schema here is hand-written. Reconciled against
 * `apps/backend/.../ifta/services/*` + `ifta.types.ts`.
 */
import { z } from 'zod';
import { isoDateString, nullableIsoDate } from './helpers.js';

// ── Filing sub-record ─────────────────────────────────────────────────────────

const IftaFilingSchema = z
  .object({
    id: z.string(),
    quarterId: z.string(),
    tenantId: z.number().int(),
    status: z.string(),
    confirmationNumber: z.string().nullable(),
    filingMethod: z.string().nullable(),
    filedAt: nullableIsoDate,
    notes: z.string().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

// ── Quarter list / detail ────────────────────────────────────────────────────

/**
 * GET /ifta/quarters[*] list item shape. The service returns the Prisma row
 * with `include: { filing: true }`; all other associations are omitted on
 * the list path.
 */
export const IftaQuarterSchema = z
  .object({
    id: z.string(),
    tenantId: z.number().int(),
    year: z.number().int(),
    quarter: z.number().int(),
    status: z.string(),
    periodStart: isoDateString,
    periodEnd: isoDateString,
    fleetAvgMpg: z.number().nullable(),
    totalMiles: z.number().nullable(),
    totalGallons: z.number().nullable(),
    totalTaxOwedCents: z.number().int().nullable(),
    totalTaxPaidCents: z.number().int().nullable(),
    netTaxDueCents: z.number().int().nullable(),
    calculatedAt: nullableIsoDate,
    filingId: z.string().nullable(),
    filing: IftaFilingSchema.nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();
export type IftaQuarter = z.infer<typeof IftaQuarterSchema>;

// ── Quarter detail sub-rows ───────────────────────────────────────────────────

const IftaStateMileageSchema = z
  .object({
    id: z.string(),
    quarterId: z.string(),
    tenantId: z.number().int(),
    jurisdiction: z.string(),
    totalMiles: z.number(),
    taxableGallons: z.number().nullable(),
    taxRate: z.number().nullable(),
    surchargeRate: z.number().nullable(),
    taxOwedCents: z.number().int().nullable(),
    surchargeOwedCents: z.number().int().nullable(),
    taxPaidCents: z.number().int().nullable(),
    netTaxCents: z.number().int().nullable(),
    source: z.string(),
    vehicleId: z.number().int().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();

const IftaFuelPurchaseRowSchema = z
  .object({
    id: z.string(),
    quarterId: z.string(),
    tenantId: z.number().int(),
    purchaseDate: isoDateString,
    jurisdiction: z.string(),
    gallons: z.number(),
    pricePerGallon: z.number().nullable(),
    totalCostCents: z.number().int().nullable(),
    vehicleId: z.number().int().nullable(),
    driverId: z.number().int().nullable(),
    stationName: z.string().nullable(),
    vendorName: z.string().nullable(),
    notes: z.string().nullable(),
    source: z.string(),
    createdById: z.number().int().nullable(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    vehicle: z.object({ unitNumber: z.string().nullable() }).strict().nullable().optional(),
  })
  .strict();

/**
 * GET /ifta/quarters/:quarterId detail shape — adds stateMileage, fuelPurchases,
 * filedByUser to the list-item quarter.
 */
export const IftaQuarterDetailSchema = IftaQuarterSchema.extend({
  stateMileage: z.array(IftaStateMileageSchema),
  fuelPurchases: z.array(IftaFuelPurchaseRowSchema),
  filedByUser: z.object({ firstName: z.string(), lastName: z.string() }).strict().nullable(),
}).strict();
export type IftaQuarterDetail = z.infer<typeof IftaQuarterDetailSchema>;

/**
 * GET /ifta/quarters/:quarterId/summary — `IftaQuarterSummary` (hand-rolled
 * in `ifta.types.ts`, returned by `IftaService.getQuarterSummary`).
 * `filingDeadline` is a Date instance in memory; JSON serializes as ISO.
 */
export const IftaQuarterSummarySchema = z
  .object({
    year: z.number().int(),
    quarter: z.number().int(),
    status: z.string(),
    totalMiles: z.number(),
    totalGallons: z.number(),
    fleetAvgMpg: z.number(),
    totalTaxOwedCents: z.number().int(),
    totalTaxPaidCents: z.number().int(),
    netTaxDueCents: z.number().int(),
    stateCount: z.number().int(),
    anomalyCount: z.number().int(),
    filingDeadline: isoDateString,
    daysUntilDeadline: z.number().int(),
  })
  .strict();
export type IftaQuarterSummary = z.infer<typeof IftaQuarterSummarySchema>;

// ── Mileage / fuel / tax rate ────────────────────────────────────────────────

/** GET /ifta/quarters/:quarterId/mileage row. */
export const IftaMileageEntrySchema = IftaStateMileageSchema;
export type IftaMileageEntry = z.infer<typeof IftaMileageEntrySchema>;

/** POST /ifta/fuel + GET /ifta/quarters/:quarterId/fuel row. */
export const IftaFuelPurchaseSchema = IftaFuelPurchaseRowSchema;
export type IftaFuelPurchase = z.infer<typeof IftaFuelPurchaseSchema>;

/** GET /ifta/tax-rates row. */
export const IftaTaxRateSchema = z
  .object({
    id: z.string(),
    year: z.number().int(),
    quarter: z.number().int(),
    jurisdiction: z.string(),
    jurisdictionName: z.string(),
    taxRatePerGallon: z.number(),
    surchargeRate: z.number(),
    effectiveDate: isoDateString,
    createdAt: isoDateString,
    updatedAt: isoDateString,
  })
  .strict();
export type IftaTaxRate = z.infer<typeof IftaTaxRateSchema>;

// ── Calculate response ────────────────────────────────────────────────────────

/**
 * POST /ifta/quarters/:quarterId/calculate response — the IftaService's
 * synthesized summary after saving per-state rows. Exact shape is derived
 * from `ifta.service.ts::calculateQuarter` return value (updated quarter
 * row plus per-state breakdown in `stateCalculations`). TODO(phase-3-verify)
 * once the first live test run confirms the envelope.
 */
export const IftaCalculateResponseSchema = z
  .object({
    quarter: IftaQuarterSchema,
    stateCalculations: z.array(
      z
        .object({
          jurisdiction: z.string(),
          jurisdictionName: z.string(),
          totalMiles: z.number(),
          taxableGallons: z.number(),
          fuelPurchasedGallons: z.number(),
          taxRate: z.number(),
          surchargeRate: z.number(),
          taxOwedCents: z.number().int(),
          surchargeOwedCents: z.number().int(),
          taxPaidCents: z.number().int(),
          netTaxCents: z.number().int(),
        })
        .strict(),
    ),
    anomalies: z.array(z.unknown()).optional(),
  })
  .strict();
export type IftaCalculateResponse = z.infer<typeof IftaCalculateResponseSchema>;
