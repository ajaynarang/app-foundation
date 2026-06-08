import { z } from 'zod';
import { LoadStopStatus, LoadStopStatusSchema } from '../generated/prisma-enums';

/**
 * Status of a stop within a load's lifecycle. Re-exported from the codegen
 * mirror — Prisma `LoadStopStatus` enum is the single source of truth.
 *
 * Forward progression: PENDING → ARRIVED → IN_PROGRESS → COMPLETED.
 * Revert: COMPLETED → ARRIVED (driver was at the dock; IN_TRANSIT is a
 * load-level state, never a stop-level one).
 */
export { LoadStopStatus, LoadStopStatusSchema };

/** Allowed forward transitions for stop status. Single source of truth. */
export const STOP_STATUS_TRANSITIONS: Record<LoadStopStatus, readonly LoadStopStatus[]> = {
  PENDING: ['ARRIVED'],
  ARRIVED: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
};

export const StopSearchResultSchema = z.object({
  id: z.number(),
  stopId: z.string(),
  name: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  locationType: z.string(),
  useCount: z.number(),
  avgDockHours: z.number().optional(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().optional(),
  operatingHours: z.record(z.object({ open: z.string(), close: z.string() })).optional(),
  appointmentRequired: z.boolean().optional(),
  notes: z.string().optional(),
  loadCount: z.number().optional(),
  isEditable: z.boolean().optional(),
  updatedAt: z.string().optional(),
});

export const StopSearchResponseSchema = z.object({
  recent: z.array(StopSearchResultSchema),
  results: z.array(StopSearchResultSchema),
});

export type StopSearchResult = z.infer<typeof StopSearchResultSchema>;
export type StopSearchResponse = z.infer<typeof StopSearchResponseSchema>;
