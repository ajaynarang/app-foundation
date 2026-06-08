/**
 * API contracts for the Horizon domain (weekly fleet planning grid + driver
 * and vehicle unavailability CRUD).
 *
 * No shared-types coverage exists for these endpoints as of 2026-04-17, so
 * every schema here is hand-written. Reconciled against
 * `apps/backend/src/domains/operations/horizon/horizon.service.ts` and
 * `horizon.types.ts`.
 */
import { z } from 'zod';
import { dbId, dateOnlyString, isoDateString, nullableIsoDate } from './helpers.js';

// ── Grid building blocks ──────────────────────────────────────────────────────

const HorizonLoadBlockSchema = z
  .object({
    loadId: z.string(),
    loadNumber: z.string(),
    referenceNumber: z.string().nullable(),
    status: z.string(),
    pickupDate: dateOnlyString,
    deliveryDate: dateOnlyString,
    originCity: z.string(),
    originState: z.string(),
    destinationCity: z.string(),
    destinationState: z.string(),
    route: z.string(),
    customerName: z.string().nullable(),
    requiredEquipmentType: z.string().nullable(),
  })
  .strict();

const HorizonUnavailBlockSchema = z
  .object({
    id: dbId,
    type: z.string(),
    startDate: dateOnlyString,
    endDate: dateOnlyString,
    note: z.string().nullable(),
    createdById: z.number().int(),
  })
  .strict();

const HorizonDayDataSchema = z
  .object({
    loads: z.array(HorizonLoadBlockSchema),
    driverUnavailability: HorizonUnavailBlockSchema.nullable(),
    vehicleUnavailability: HorizonUnavailBlockSchema.nullable(),
  })
  .strict();

const HorizonDriverRowSchema = z
  .object({
    driverId: dbId,
    driverStringId: z.string(),
    name: z.string(),
    initials: z.string(),
    equipmentType: z.string().nullable(),
    vehicleNumber: z.string().nullable(),
    vehicleId: z.number().int().nullable(),
    vehicleStringId: z.string().nullable(),
    days: z.record(z.string(), HorizonDayDataSchema),
  })
  .strict();

const HorizonStatsSchema = z
  .object({
    driversLoaded: z.number().int(),
    totalDrivers: z.number().int(),
    openDriverDays: z.number().int(),
    sallySuggestions: z.number().int(),
  })
  .strict();

const SallySuggestionSchema = z
  .object({
    suggestionId: z.string(),
    driverId: z.number().int(),
    loadId: z.string(),
    loadNumber: z.string(),
    route: z.string(),
    matchScore: z.number(),
    date: dateOnlyString,
    reason: z.string(),
  })
  .strict();

const AppInsightSchema = z
  .object({
    message: z.string(),
    suggestions: z.array(SallySuggestionSchema),
  })
  .strict();

// ── Public schemas ────────────────────────────────────────────────────────────

/** GET /horizon response. */
export const HorizonGridSchema = z
  .object({
    weekStart: dateOnlyString,
    weekEnd: dateOnlyString,
    drivers: z.array(HorizonDriverRowSchema),
    stats: HorizonStatsSchema,
    sallyInsight: AppInsightSchema.nullable(),
  })
  .strict();
export type HorizonGrid = z.infer<typeof HorizonGridSchema>;

/**
 * POST/PATCH /driver-unavailability response row.
 *
 * The service returns the Prisma row unchanged. Timestamp fields come through
 * as ISO strings from JSON serialization; date-only fields are coerced at
 * read time by `format(date, 'yyyy-MM-dd')` on the grid path but the CRUD
 * path emits them as full timestamps — TODO(phase-3-verify) decide
 * authoritative representation after live run.
 */
export const DriverUnavailabilitySchema = z
  .object({
    id: dbId,
    tenantId: z.number().int(),
    driverId: z.number().int(),
    type: z.string(),
    startDate: isoDateString,
    endDate: isoDateString,
    note: z.string().nullable(),
    createdById: z.number().int(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    deletedAt: nullableIsoDate.optional(),
  })
  .strict();
export type DriverUnavailability = z.infer<typeof DriverUnavailabilitySchema>;

/** POST/PATCH /vehicle-unavailability response row. */
export const VehicleUnavailabilitySchema = z
  .object({
    id: dbId,
    tenantId: z.number().int(),
    vehicleId: z.number().int(),
    type: z.string(),
    startDate: isoDateString,
    endDate: isoDateString,
    note: z.string().nullable(),
    createdById: z.number().int(),
    createdAt: isoDateString,
    updatedAt: isoDateString,
    deletedAt: nullableIsoDate.optional(),
  })
  .strict();
export type VehicleUnavailability = z.infer<typeof VehicleUnavailabilitySchema>;
