import { z } from 'zod';
import { LoadBillingStatus, LoadBillingStatusSchema, LoadStatus, LoadStatusSchema } from '../generated/prisma-enums';
import { LoadLegListItemSchema } from './load-leg.schema';
import { LoadStopStatusSchema } from './stop.schema';

// `LoadStatus` and `LoadBillingStatus` re-exported from the codegen mirror.
export { LoadBillingStatus, LoadBillingStatusSchema, LoadStatus, LoadStatusSchema };

/**
 * Statuses considered "active" by the dispatcher loads board.
 * Excludes terminal states (DELIVERED, CANCELLED, TONU) and EDI-only TENDER.
 * Single source of truth — backend `/loads/board` returns this set,
 * frontend table view filters chips against this set.
 */
export const ACTIVE_LOAD_STATUSES = ['DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] as const;
export type ActiveLoadStatus = (typeof ACTIVE_LOAD_STATUSES)[number];

/**
 * Domain-aware error codes returned by `PATCH /loads/:id`.
 * Frontend maps these to friendly toasts + CTAs.
 */
export const LoadUpdateErrorCode = {
  NO_CHANGES: 'NO_CHANGES',
  FIELD_NOT_EDITABLE_IN_STATUS: 'FIELD_NOT_EDITABLE_IN_STATUS',
  LEGS_BLOCK_ROUTE_CHANGE: 'LEGS_BLOCK_ROUTE_CHANGE',
} as const;
export type LoadUpdateErrorCode = (typeof LoadUpdateErrorCode)[keyof typeof LoadUpdateErrorCode];

// `LoadBillingStatus` re-exported from codegen mirror at the top of this file.

export const LoadStopSchema = z.object({
  id: z.number(),
  stopId: z.number(),
  sequenceOrder: z.number(),
  actionType: z.enum(['pickup', 'delivery', 'both', 'exchange']),
  earliestArrival: z.string().optional(),
  latestArrival: z.string().optional(),
  estimatedDockHours: z.number().min(0).max(72),
  actualDockHours: z.number().min(0).max(72).optional(),
  appointmentDate: z.string().optional(),
  // Set on import when the location is known but the dock isn't (no street or
  // no facility name) — drives the "Verify facility" review chip.
  facilityUnverified: z.boolean().optional(),
  // Non-binding "looks like a known facility" merge offer (StopMatchService).
  suggestedMergeStopId: z.number().nullable().optional(),
  status: LoadStopStatusSchema.optional(),
  arrivedAt: z.string().optional(),
  loadingStartedAt: z.string().optional(),
  completedAt: z.string().optional(),
  bolNumber: z.string().optional(),
  podSignedBy: z.string().optional(),
  driverNotes: z.string().optional(),
  dispatcherNotes: z.string().optional(),
  actualWeight: z.number().int().min(0).max(200000).optional(),
  actualPieces: z.number().int().min(0).max(99999).optional(),
  detentionMinutes: z.number().int().min(0).optional(),
  stopName: z.string().optional(),
  stopCity: z.string().optional(),
  stopState: z.string().optional(),
  stopAddress: z.string().optional(),
  stopZipCode: z.string().optional(),
  stopLat: z.number().optional(),
  stopLon: z.number().optional(),
  stopStopId: z.string().optional(),
  uploadedDocuments: z
    .array(
      z.object({
        documentType: z.string(),
        id: z.number(),
      }),
    )
    .optional(),
});

export const LoadChargeSchema = z.object({
  id: z.number(),
  chargeType: z.string(),
  description: z.string(),
  quantity: z.number().int().min(1).max(999).optional(),
  unitPriceCents: z.number().int().min(0).max(9999999),
  totalCents: z.number().int(),
  isBillable: z.boolean().optional(),
  isPayable: z.boolean().optional(),
});

export const LoadSchema = z.object({
  id: z.number(),
  loadNumber: z.string(),
  status: LoadStatusSchema,
  weightLbs: z.number().int().min(0).max(200000),
  commodityType: z.string(),
  specialRequirements: z.string().optional(),
  customerName: z.string(),
  customerId: z.number(),
  requiredEquipmentType: z.string().nullable().optional(),
  trailerId: z.number().nullable().optional(),
  trailerUnitNumber: z.string().nullable().optional(),
  referenceNumber: z.string().optional(),
  rateCents: z.number().int().min(0).max(99999999).optional(),
  pieces: z.number().int().min(0).max(99999).optional(),
  billingStatus: z.string().optional(),
  driverName: z.string().nullable().optional(),
  driverId: z.number().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  stopCount: z.number().optional(),
  originCity: z.string().nullable().optional(),
  originState: z.string().nullable().optional(),
  destinationCity: z.string().nullable().optional(),
  destinationState: z.string().nullable().optional(),
  estimatedMiles: z.number().nullable().optional(),
  actualMiles: z.number().nullable().optional(),
  // System-computed mileage (HERE Routing). Distinct from estimated/actual —
  // those feed Settlements driver pay and are never auto-overwritten.
  totalMiles: z.number().nullable().optional(),
  estimatedDriveHours: z.number().nullable().optional(),
  mileageProvider: z.string().nullable().optional(),
  mileageCalculatedAt: z.string().nullable().optional(),
  pickupDate: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  assignedAt: z.string().nullable().optional(),
  inTransitAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  cancelledAt: z.string().nullable().optional(),
  onHoldAt: z.string().nullable().optional(),
  onHoldReason: z.string().nullable().optional(),
  tonuAt: z.string().nullable().optional(),
  tonuReason: z.string().nullable().optional(),
  intakeSource: z.string().nullable().optional(),
  intakeMetadata: z.any().optional(),
  externalLoadId: z.string().nullable().optional(),
  externalSource: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
  routePlan: z
    .object({
      planId: z.string(),
      status: z.enum(['draft', 'active']),
    })
    .nullable()
    .optional(),
  isActive: z.boolean().optional(),
  recurringLaneId: z.number().nullable().optional(),
  minTempF: z.number().min(-40).max(80).nullable().optional(),
  maxTempF: z.number().min(-40).max(80).nullable().optional(),
  hazmatClass: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  isRelay: z.boolean().optional(),
  legs: z.array(LoadLegListItemSchema).optional(),
  stops: z.array(LoadStopSchema).optional(),
  charges: z.array(LoadChargeSchema).optional(),
  chargeTotalCents: z.number().optional(),
  tripId: z.string().nullable().optional(),
  tripOrder: z.number().int().nullable().optional(),
  tripLoadCount: z.number().int().nullable().optional(),
});

export const CreateLoadStopSchema = z.object({
  stopId: z.string().min(1),
  sequenceOrder: z.number().int().min(0),
  actionType: z.string(),
  appointmentDate: z.string().optional(),
  earliestArrival: z.string().optional(),
  latestArrival: z.string().optional(),
  estimatedDockHours: z.number().min(0).max(72),
  name: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

export const CreateLoadSchema = z.object({
  loadNumber: z.string().optional(),
  weightLbs: z.number().int().min(0).max(200000),
  commodityType: z.string().min(1),
  specialRequirements: z.string().optional(),
  customerName: z.string().min(1),
  requiredEquipmentType: z.string().optional(),
  referenceNumber: z.string().optional(),
  rateCents: z.number().int().min(0).max(99999999).optional(),
  pieces: z.number().int().min(0).max(99999).optional(),
  intakeSource: z.string().optional(),
  intakeMetadata: z.any().optional(),
  customerId: z.number().optional(),
  status: z.string().optional(),
  minTempF: z.number().min(-40).max(80).optional(),
  maxTempF: z.number().min(-40).max(80).optional(),
  hazmatClass: z.string().optional(),
  unNumber: z.string().optional(),
  placardRequired: z.boolean().optional(),
  customFieldValues: z.record(z.unknown()).optional(),
  stops: z.array(CreateLoadStopSchema),
});

export const UpdateDraftLoadSchema = z.object({
  customerName: z.string().optional(),
  customerId: z.number().optional(),
  referenceNumber: z.string().optional(),
  rateCents: z.number().int().min(0).max(99999999).optional(),
  weightLbs: z.number().int().min(0).max(200000).optional(),
  requiredEquipmentType: z.string().optional(),
  commodityType: z.string().optional(),
  pieces: z.number().int().min(0).max(99999).optional(),
  specialRequirements: z.string().optional(),
  isRelay: z.boolean().optional(),
  customFieldValues: z.record(z.unknown()).optional(),
  stops: z.array(CreateLoadStopSchema).optional(),
});

export const CreateLoadChargeSchema = z.object({
  chargeType: z.string(),
  description: z.string(),
  quantity: z.number().int().min(1).max(999).optional(),
  unitPriceCents: z.number().int().min(0).max(9999999),
  isBillable: z.boolean().optional(),
  isPayable: z.boolean().optional(),
});

export const CreateLoadNoteSchema = z.object({
  content: z.string().min(1),
  noteType: z.string().optional(),
});

export const LoadListItemSchema = z.object({
  id: z.number(),
  loadNumber: z.string(),
  status: z.string(),
  customerName: z.string(),
  stopCount: z.number(),
  missingCoordinates: z.number().optional(),
  weightLbs: z.number(),
  commodityType: z.string(),
  requiredEquipmentType: z.string().nullable().optional(),
  referenceNumber: z.string().optional(),
  rateCents: z.number().optional(),
  billingStatus: z.string().nullable().optional(),
  pieces: z.number().optional(),
  intakeSource: z.string().optional(),
  externalLoadId: z.string().optional(),
  externalSource: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  pickupDate: z.string().nullable().optional(),
  deliveryDate: z.string().nullable().optional(),
  pickupTime: z.string().nullable().optional(),
  deliveryTime: z.string().nullable().optional(),
  originCity: z.string().nullable().optional(),
  originState: z.string().nullable().optional(),
  destinationCity: z.string().nullable().optional(),
  destinationState: z.string().nullable().optional(),
  routePlan: z
    .object({
      planId: z.string(),
      status: z.enum(['draft', 'active']),
    })
    .nullable()
    .optional(),
  assignedAt: z.string().nullable().optional(),
  inTransitAt: z.string().nullable().optional(),
  deliveredAt: z.string().nullable().optional(),
  driverName: z.string().nullable().optional(),
  vehicleUnitNumber: z.string().nullable().optional(),
  driverPayCents: z.number().nullable().optional(),
  payStatus: z.string().nullable().optional(),
  isRelay: z.boolean().optional(),
  activeLeg: LoadLegListItemSchema.optional(),
  tripId: z.string().nullable().optional(),
  tripOrder: z.number().int().nullable().optional(),
  tripLoadCount: z.number().int().nullable().optional(),
});

export const LoadListFiltersSchema = z.object({
  status: z.string().optional(),
  customerName: z.string().optional(),
  driverId: z.string().optional(),
  equipmentType: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export const LoadNoteSchema = z.object({
  id: z.number(),
  loadId: z.number(),
  userId: z.number(),
  content: z.string(),
  noteType: z.string(),
  isPinned: z.boolean(),
  createdAt: z.string(),
});

export const LoadEventSchema = z.object({
  id: z.number(),
  loadId: z.number(),
  eventType: z.string(),
  fromValue: z.string().optional(),
  toValue: z.string().optional(),
  description: z.string().optional(),
  userId: z.number().optional(),
  metadata: z.any().optional(),
  createdAt: z.string(),
});

export const ActivityItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('event'),
    id: z.number(),
    eventType: z.string().optional(),
    fromValue: z.string().optional(),
    toValue: z.string().optional(),
    description: z.string().optional(),
    metadata: z.any().optional(),
    userId: z.number().optional(),
    createdAt: z.string(),
  }),
  z.object({
    type: z.literal('note'),
    id: z.number(),
    content: z.string().optional(),
    noteType: z.string().optional(),
    isPinned: z.boolean().optional(),
    userId: z.number().optional(),
    createdAt: z.string(),
  }),
]);

export const PaginatedLoadsSchema = z.object({
  data: z.array(LoadListItemSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

/** Confidence levels from AI ratecon extraction, stored in intakeMetadata.confidence */
export const RateconConfidenceSchema = z.object({
  reference_number: z.enum(['high', 'medium', 'low']),
  broker_name: z.enum(['high', 'medium', 'low']),
  rate: z.enum(['high', 'medium', 'low']),
  stops: z.array(
    z.object({
      sequence: z.number(),
      location: z.enum(['high', 'medium', 'low']),
      date: z.enum(['high', 'medium', 'low']).nullable(),
    }),
  ),
});

export type RateconConfidence = z.infer<typeof RateconConfidenceSchema>;

// `LoadStatus` type comes from the codegen mirror via the re-export at the top.
export type LoadStop = z.infer<typeof LoadStopSchema>;
export type LoadCharge = z.infer<typeof LoadChargeSchema>;
export type Load = z.infer<typeof LoadSchema>;
export type LoadListItem = z.infer<typeof LoadListItemSchema>;
export type LoadListFilters = z.infer<typeof LoadListFiltersSchema>;
export type LoadNote = z.infer<typeof LoadNoteSchema>;
export type LoadEvent = z.infer<typeof LoadEventSchema>;
export type ActivityItem = z.infer<typeof ActivityItemSchema>;
export type PaginatedLoads = z.infer<typeof PaginatedLoadsSchema>;
export type CreateLoadInput = z.infer<typeof CreateLoadSchema>;
export type CreateLoadStopInput = z.infer<typeof CreateLoadStopSchema>;
export type UpdateDraftLoadInput = z.infer<typeof UpdateDraftLoadSchema>;
export type CreateLoadChargeInput = z.infer<typeof CreateLoadChargeSchema>;
export type CreateLoadNoteInput = z.infer<typeof CreateLoadNoteSchema>;

export {
  ReversalCategorySchema,
  REVERSAL_CATEGORY_LABELS,
  RevertLoadInputSchema,
  RevertPreviewResponseSchema,
  type ReversalCategory,
  type RevertLoadInput,
  type RevertPreviewResponse,
} from './reversal.schema';
