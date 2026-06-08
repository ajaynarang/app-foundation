import { z } from 'zod';
import {
  StopEntryPolicy,
  StopEntryPolicySchema,
  DriverDutyStatus,
  DriverDutyStatusSchema,
} from '../generated/prisma-enums';

/**
 * Provenance of an externally-sourced value in a route plan.
 *
 * The Smart Route engine must never present an estimate or a missing value as if
 * it were a confirmed measurement. Every value that comes from (or should come
 * from) an external provider carries its source so the UI can label it honestly:
 *
 *  - LIVE          — a real, current reading from a connected provider
 *                    (e.g. HERE Tolls subscription, OpenWeather forecast, ELD HOS).
 *  - ESTIMATED     — a reasonable model/fallback value, NOT a live reading
 *                    (e.g. national-average diesel minus a card discount).
 *  - NOT_AVAILABLE — no value could be produced and we will not fabricate one
 *                    (e.g. tolls when no toll provider is connected — show
 *                    "not included", never "$0.00").
 */
export const DataSourceSchema = z.enum(['LIVE', 'ESTIMATED', 'NOT_AVAILABLE']);
export type DataSource = z.infer<typeof DataSourceSchema>;

/**
 * A value tagged with its provenance. `value` is null when source is
 * NOT_AVAILABLE. `asOf` is the instant the value was read/computed (ISO string);
 * `note` is optional human-facing context ("connect HERE Tolls for live tolls").
 */
export const SourcedValueSchema = z.object({
  value: z.number().nullable(),
  source: DataSourceSchema,
  asOf: z.string().datetime().optional(),
  note: z.string().optional(),
});
export type SourcedValue = z.infer<typeof SourcedValueSchema>;

/** Convenience constructors — keep call sites terse and consistent. */
export const liveValue = (value: number, asOf?: Date, note?: string): SourcedValue => ({
  value,
  source: 'LIVE',
  asOf: asOf?.toISOString(),
  note,
});

export const estimatedValue = (value: number, note?: string): SourcedValue => ({
  value,
  source: 'ESTIMATED',
  note,
});

export const notAvailable = (note?: string): SourcedValue => ({
  value: null,
  source: 'NOT_AVAILABLE',
  note,
});

// `StopEntryPolicy` (how a facility admits trucks relative to its appointment
// window) and `DriverDutyStatus` (FMCSA duty status for stateful HOS clocks) are
// Prisma enums — re-exported from the generated mirror so schema.prisma stays the
// single source of truth. Surfaced here because the Smart Route engine consumes
// them alongside the DataSource provenance primitives above.
export { StopEntryPolicy, StopEntryPolicySchema, DriverDutyStatus, DriverDutyStatusSchema };
