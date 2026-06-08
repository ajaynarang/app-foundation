import { z } from 'zod';
import { RecurringLaneStatus, RecurringLaneStatusSchema } from '../generated/prisma-enums';

// `RecurringLaneStatus` re-exported from the codegen mirror.
export { RecurringLaneStatus, RecurringLaneStatusSchema };

export const RecurringLaneStopSchema = z.object({
  id: z.number().optional(),
  laneId: z.number().optional(),
  stopId: z.number(),
  sequenceOrder: z.number(),
  actionType: z.enum(['pickup', 'delivery', 'both']),
  earliestArrival: z.string().nullable().optional(),
  latestArrival: z.string().nullable().optional(),
  estimatedDockHours: z.number().min(0).max(72).default(2),
  dayOffset: z.number().int().min(0).max(30).default(0),
  facilityNotes: z.string().nullable().optional(),
  stopName: z.string().nullable().optional(),
  stopCity: z.string().nullable().optional(),
  stopState: z.string().nullable().optional(),
  stopAddress: z.string().nullable().optional(),
});

export const RecurringLaneSchema = z.object({
  id: z.number(),
  laneId: z.string(),
  name: z.string(),
  customerId: z.number().nullable().optional(),
  customerName: z.string(),
  requiredEquipmentType: z.string().nullable().optional(),
  commodityType: z.string(),
  weightLbs: z.number().int().min(0).max(200000),
  rateCents: z.number().int().min(0).max(99999999).nullable().optional(),
  pieces: z.number().int().min(0).max(99999).nullable().optional(),
  specialRequirements: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  scheduleType: z.string(),
  scheduleDays: z.array(z.number()).nullable().optional(),
  scheduleCustomCron: z.string().nullable().optional(),
  autoCreate: z.boolean(),
  autoAssignDriverId: z.number().nullable().optional(),
  autoAssignVehicleId: z.number().nullable().optional(),
  originCity: z.string().nullable().optional(),
  originState: z.string().nullable().optional(),
  destinationCity: z.string().nullable().optional(),
  destinationState: z.string().nullable().optional(),
  estimatedMiles: z.number().nullable().optional(),
  status: RecurringLaneStatusSchema,
  effectiveFrom: z.string().nullable().optional(),
  effectiveUntil: z.string().nullable().optional(),
  lastGeneratedAt: z.string().nullable().optional(),
  nextGenerationDate: z.string().nullable().optional(),
  nextScheduledRunDate: z.string().nullable().optional(),
  skipNextGeneration: z.boolean(),
  totalLoadsGenerated: z.number(),
  deletedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stops: z.array(RecurringLaneStopSchema),
});

export const CreateRecurringLaneStopInputSchema = z.object({
  stopId: z.number(),
  sequenceOrder: z.number().int().min(0),
  actionType: z.enum(['pickup', 'delivery', 'both']),
  earliestArrival: z.string().optional(),
  latestArrival: z.string().optional(),
  estimatedDockHours: z.number().min(0).max(72).default(2),
  dayOffset: z.number().int().min(0).max(30).default(0),
  facilityNotes: z.string().optional(),
});

export const CreateRecurringLaneSchema = z.object({
  name: z.string().min(1),
  customerId: z.number().optional(),
  customerName: z.string(),
  requiredEquipmentType: z.string().optional(),
  commodityType: z.string(),
  weightLbs: z.number().int().min(0).max(200000),
  rateCents: z.number().int().min(0).max(99999999).optional(),
  pieces: z.number().int().min(0).max(99999).optional(),
  specialRequirements: z.string().optional(),
  referenceNumber: z.string().optional(),
  scheduleType: z.string(),
  scheduleDays: z.array(z.number()).optional(),
  scheduleCustomCron: z.string().optional(),
  autoCreate: z.boolean().optional(),
  autoAssignDriverId: z.number().optional(),
  autoAssignVehicleId: z.number().optional(),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().optional(),
  stops: z.array(CreateRecurringLaneStopInputSchema),
});

export const UpdateRecurringLaneSchema = CreateRecurringLaneSchema.partial();

export type RecurringLane = z.infer<typeof RecurringLaneSchema>;
export type RecurringLaneStop = z.infer<typeof RecurringLaneStopSchema>;
export type CreateRecurringLaneStopInput = z.infer<typeof CreateRecurringLaneStopInputSchema>;
export type CreateRecurringLaneInput = z.infer<typeof CreateRecurringLaneSchema>;
export type UpdateRecurringLaneInput = z.infer<typeof UpdateRecurringLaneSchema>;

export const LanePreviewStopSchema = z.object({
  stopId: z.number(),
  stopName: z.string(),
  stopCity: z.string(),
  stopState: z.string(),
  sequenceOrder: z.number(),
  actionType: z.string(),
  earliestArrival: z.string().nullable(),
  latestArrival: z.string().nullable(),
  estimatedDockHours: z.number().min(0).max(72),
  dayOffset: z.number().int().min(0).max(30),
});

export const LanePreviewSchema = z.object({
  laneId: z.string(),
  laneName: z.string(),
  customerName: z.string(),
  requiredEquipmentType: z.string().nullable().optional(),
  commodityType: z.string(),
  weightLbs: z.number().int().min(0).max(200000),
  rateCents: z.number().int().min(0).max(99999999).nullable(),
  pieces: z.number().int().min(0).max(99999).nullable(),
  specialRequirements: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  stops: z.array(LanePreviewStopSchema),
  autoAssignDriverId: z.number().nullable(),
  autoAssignVehicleId: z.number().nullable(),
  nextGenerationDate: z.string().nullable(),
});

export const PaginatedRecurringLanesSchema = z.object({
  data: z.array(RecurringLaneSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
});

export type LanePreview = z.infer<typeof LanePreviewSchema>;
export type PaginatedRecurringLanes = z.infer<typeof PaginatedRecurringLanesSchema>;
