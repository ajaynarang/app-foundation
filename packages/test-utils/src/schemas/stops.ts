/**
 * API Contracts for Stops endpoints.
 *
 * Hand-written because `@sally/shared-types/fleet/stop.schema.ts` only exports
 * `StopSearchResultSchema` + `StopSearchResponseSchema` — neither covers the
 * `/stops` list endpoint (paginated `{ items, total, page, limit, totalPages }`)
 * nor the detail endpoint (raw Prisma-ish row + `loadCount` + `isEditable`).
 *
 * Schemas match the real responses from `StopsService` (see
 * `apps/backend/src/domains/fleet/stops/stops.service.ts`):
 *   - `list`       → paginated envelope; items use the Prisma Stop row shape
 *                    extended with `loadCount` + `isEditable`.
 *   - `getById`    → same as a list item (single, or 404).
 *   - `search`     → `{ recent: StopSearchResult[], results: StopSearchResult[] }`
 *                    (StopSearchResult is the trimmed search-result shape).
 *   - `findOrCreate` (POST /stops) → the raw Prisma Stop row with `isNew` added.
 *   - `update`     → the StopSearchResult-like shape (formatted via controller),
 *                    with `useCount: 0` and `avgDockHours: undefined` (omitted).
 *
 * Fields emitted via `?.toISOString()` that are `null` are OMITTED (not null);
 * model them as `.nullable().optional()`. No `.strict()` on list/detail because
 * the underlying Prisma row has many optional DB columns (`fuelBrand`,
 * `amenities`, `timezone`, `parkingSpaces`, ...) we don't want to enumerate.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ── Operating-hours shape used in create/update DTO ──────────────────

const OperatingHoursSchema = z
  .record(z.object({ open: z.string(), close: z.string() }))
  .nullable()
  .optional();

// ── Prisma Stop row (list item + detail shape) ───────────────────────
//
// Matches columns on the `stops` table as returned by `StopsService.list`
// and `StopsService.getById`. Intentionally permissive on optional fields.

export const StopListItemSchema = z.object({
  id: dbId,
  stopId: stringId,
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  locationType: z.string(),
  isActive: z.boolean(),
  timezone: z.string().nullable().optional(),
  fuelPricePerGallon: z.number().nullable().optional(),
  fuelPriceUpdatedAt: z.string().nullable().optional(),
  fuelBrand: z.string().nullable().optional(),
  amenities: z.unknown().nullable().optional(),
  parkingSpaces: z.number().nullable().optional(),
  tenantId: z.number().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  operatingHours: z.unknown().nullable().optional(),
  appointmentRequired: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString.nullable().optional(),
  loadCount: z.number().int(),
  isEditable: z.boolean(),
});

export const StopDetailSchema = StopListItemSchema;

// ── GET /stops — Paginated list envelope ─────────────────────────────

export const StopListResponseSchema = z.object({
  items: z.array(StopListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});

// ── GET /stops/search — recent + results ─────────────────────────────
//
// Each item is the StopSearchResult shape from `StopsService.search` /
// `StopsService.getRecent` — a subset of the Prisma row + usage metadata.

export const StopSearchItemSchema = z.object({
  id: dbId,
  stopId: stringId,
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  locationType: z.string(),
  useCount: z.number().int().nonnegative(),
  avgDockHours: z.number().nullable().optional(),
});

export const StopSearchResponseSchema = z.object({
  recent: z.array(StopSearchItemSchema),
  results: z.array(StopSearchItemSchema),
});

// ── POST /stops — Create / dedup response ────────────────────────────
//
// Controller spreads the raw Prisma Stop row and appends `isNew`. No
// `loadCount` or `isEditable` here because `findOrCreate` returns the raw
// record, not the list-formatted shape.

export const CreateStopResponseSchema = z.object({
  id: dbId,
  stopId: stringId,
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  locationType: z.string(),
  isActive: z.boolean(),
  timezone: z.string().nullable().optional(),
  fuelPricePerGallon: z.number().nullable().optional(),
  fuelPriceUpdatedAt: z.string().nullable().optional(),
  fuelBrand: z.string().nullable().optional(),
  amenities: z.unknown().nullable().optional(),
  parkingSpaces: z.number().nullable().optional(),
  tenantId: z.number().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  operatingHours: OperatingHoursSchema,
  appointmentRequired: z.boolean(),
  notes: z.string().nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString.nullable().optional(),
  isNew: z.boolean(),
});

// ── PATCH /stops/:id — Update response (StopSearchResult-like) ────────
//
// Controller explicitly formats the response to match the search-result
// shape. `useCount` is hardcoded to 0, `avgDockHours` is `undefined` and
// therefore omitted by JSON serialization.

export const UpdateStopResponseSchema = z.object({
  id: dbId,
  stopId: stringId,
  name: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
  locationType: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  operatingHours: z.unknown().nullable().optional(),
  appointmentRequired: z.boolean(),
  notes: z.string().nullable(),
  useCount: z.number().int().nonnegative(),
  avgDockHours: z.number().nullable().optional(),
});
