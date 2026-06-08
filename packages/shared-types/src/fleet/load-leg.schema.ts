import { z } from 'zod';
import { LoadLegStatus, LoadLegStatusSchema } from '../generated/prisma-enums';

// ─── Enums ────────────────────────────────────────────────────────────────────

// `LoadLegStatus` re-exported from the codegen mirror.
export { LoadLegStatus, LoadLegStatusSchema };

/**
 * Allowed forward/backward transitions for a leg status. Single source of
 * truth — backend service and (if needed) client-side validation both consume
 * this. Keys must match LoadLegStatusSchema.options exactly.
 */
export const LEG_STATUS_TRANSITIONS: Record<LoadLegStatus, readonly LoadLegStatus[]> = {
  PENDING: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['IN_TRANSIT', 'PENDING', 'ON_HOLD', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'ASSIGNED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: ['ASSIGNED', 'PENDING', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

// ─── Response Shapes ─────────────────────────────────────────────────────────

export const LoadLegSchema = z.object({
  id: z.number(),
  legId: z.string(),
  sequence: z.number(),
  status: LoadLegStatusSchema,
  driverId: z.number().nullable(),
  vehicleId: z.number().nullable(),
  trailerId: z.number().nullable().optional(),
  driverName: z.string().nullable(),
  vehicleUnitNumber: z.string().nullable(),
  trailerUnitNumber: z.string().nullable().optional(),
  originStopId: z.number(),
  destStopId: z.number(),
  actualMiles: z.number().nullable(),
  assignedAt: z.string().nullable(),
  pickedUpAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  routePlanId: z.number().nullable(),
});
export type LoadLeg = z.infer<typeof LoadLegSchema>;

export const LoadLegListItemSchema = z.object({
  legId: z.string(),
  sequence: z.number(),
  status: LoadLegStatusSchema,
  driverId: z.number().nullable().optional(),
  vehicleId: z.number().nullable().optional(),
  driverName: z.string().nullable(),
  driverStringId: z.string().nullable().optional(),
  vehicleUnitNumber: z.string().nullable(),
  vehicleStringId: z.string().nullable().optional(),
  actualMiles: z.number().nullable(),
  originStopId: z.number().optional(),
  destStopId: z.number().optional(),
  assignedAt: z.string().nullable().optional(),
  pickedUpAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
});
export type LoadLegListItem = z.infer<typeof LoadLegListItemSchema>;

// ─── Input Schemas ───────────────────────────────────────────────────────────

export const CreateLoadLegsInputSchema = z.object({
  exchangeStopIds: z.array(z.number()).min(1),
});
export type CreateLoadLegsInput = z.infer<typeof CreateLoadLegsInputSchema>;

/**
 * How an exchange-point removal should resolve when the system can infer it,
 * or what the caller explicitly chose when the inference was ambiguous (409).
 *
 * - `delete` — the stop was added solely as an exchange (truck stop, rest area).
 *   Remove the LoadStop row from the load; hard-delete the Stop row if it has
 *   no other references.
 * - `revert` — the stop is a real customer location that was promoted to an
 *   exchange. Keep the LoadStop, flip actionType back to delivery.
 */
export const ExchangeRemovalResolutionSchema = z.enum(['delete', 'revert']);
export type ExchangeRemovalResolution = z.infer<typeof ExchangeRemovalResolutionSchema>;

export const ExchangeRemovalPreviewSchema = z.object({
  resolution: ExchangeRemovalResolutionSchema.nullable(),
  ambiguous: z.boolean(),
  /** LoadStop.id — the join row PK, matching the URL param. */
  stopId: z.number(),
  stopName: z.string(),
  reasonCode: z.enum([
    'pattern_a_clear',
    'pattern_b_clear_location_type',
    'pattern_b_clear_freight',
    'pattern_b_clear_sibling_use',
    'ambiguous',
  ]),
});
export type ExchangeRemovalPreview = z.infer<typeof ExchangeRemovalPreviewSchema>;

export const ExchangeRemovalResultSchema = z.object({
  resolution: ExchangeRemovalResolutionSchema,
  /** LoadStop.id — the join row PK, matching the URL param. */
  stopId: z.number(),
  loadId: z.number(),
  isRelay: z.boolean(),
  legCount: z.number(),
});
export type ExchangeRemovalResult = z.infer<typeof ExchangeRemovalResultSchema>;

export const AssignLegInputSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().optional(),
  trailerId: z.string().optional(),
});
export type AssignLegInput = z.infer<typeof AssignLegInputSchema>;

export const UpdateLegStatusInputSchema = z.object({
  status: LoadLegStatusSchema,
});
export type UpdateLegStatusInput = z.infer<typeof UpdateLegStatusInputSchema>;

export const AssignAllLegsInputSchema = z.object({
  assignments: z
    .array(
      z.object({
        legId: z.string().min(1),
        driverId: z.string().min(1),
        vehicleId: z.string().optional(),
        trailerId: z.string().optional(),
      }),
    )
    .min(1),
});
export type AssignAllLegsInput = z.infer<typeof AssignAllLegsInputSchema>;
