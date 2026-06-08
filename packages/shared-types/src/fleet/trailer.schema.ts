import { z } from 'zod';
import {
  TrailerLifecycleStatus,
  TrailerLifecycleStatusSchema,
  TrailerStatus,
  TrailerStatusSchema,
} from '../generated/prisma-enums';
import { EquipmentTypeSchema, OwnershipTypeSchema, TrailerEquipmentTypeSchema } from './common.schema';

// `TrailerStatus` and `TrailerLifecycleStatus` re-exported from the codegen mirror.
export { TrailerLifecycleStatus, TrailerLifecycleStatusSchema, TrailerStatus, TrailerStatusSchema };

export const TrailerSchema = z.object({
  id: z.number(),
  trailerId: z.string(),
  unitNumber: z.string(),
  equipmentType: EquipmentTypeSchema,
  status: TrailerStatusSchema,
  lifecycleStatus: TrailerLifecycleStatusSchema,
  vin: z.string().nullable().optional(),
  licensePlate: z.string().nullable().optional(),
  licensePlateState: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  lengthFeet: z.number().nullable().optional(),
  maxPayloadLbs: z.number().nullable().optional(),
  ownershipType: OwnershipTypeSchema.nullable().optional(),
  reeferMake: z.string().nullable().optional(),
  reeferModel: z.string().nullable().optional(),
  reeferSerial: z.string().nullable().optional(),
  registrationExpiry: z.string().nullable().optional(),
  insuranceExpiry: z.string().nullable().optional(),
  annualInspectionDate: z.string().nullable().optional(),
  nextMaintenanceDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  assignedVehicleId: z.number().nullable().optional(),
  assignedVehicle: z
    .object({
      id: z.number(),
      vehicleId: z.string(),
      unitNumber: z.string(),
    })
    .nullable()
    .optional(),
  externalTrailerId: z.string().nullable().optional(),
  externalSource: z.string().nullable().optional(),
  lastSyncedAt: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type Trailer = z.infer<typeof TrailerSchema>;

export const CreateTrailerInputSchema = z.object({
  unitNumber: z.string().min(1),
  equipmentType: TrailerEquipmentTypeSchema,
  vin: z.string().length(17).optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().max(2).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z.number().int().min(1900).max(2100).optional(),
  lengthFeet: z.number().int().min(20).max(60).optional(),
  maxPayloadLbs: z.number().positive().optional(),
  ownershipType: OwnershipTypeSchema.optional(),
  reeferMake: z.string().optional(),
  reeferModel: z.string().optional(),
  reeferSerial: z.string().optional(),
  registrationExpiry: z.string().optional(),
  insuranceExpiry: z.string().optional(),
  annualInspectionDate: z.string().optional(),
  nextMaintenanceDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  assignedVehicleId: z.number().optional(),
});
export type CreateTrailerInput = z.infer<typeof CreateTrailerInputSchema>;

export const UpdateTrailerInputSchema = CreateTrailerInputSchema.partial();
export type UpdateTrailerInput = z.infer<typeof UpdateTrailerInputSchema>;

export const AssignTrailerVehicleInputSchema = z.object({
  vehicleId: z.number(),
});
export type AssignTrailerVehicleInput = z.infer<typeof AssignTrailerVehicleInputSchema>;

export const DeactivateTrailerInputSchema = z.object({
  reason: z.string().min(1).max(500),
});
export type DeactivateTrailerInput = z.infer<typeof DeactivateTrailerInputSchema>;
