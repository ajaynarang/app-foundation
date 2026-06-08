import { z } from 'zod';
import { VehicleStatus, VehicleStatusSchema } from '../generated/prisma-enums';
import { EquipmentTypeSchema, OwnershipTypeSchema } from './common.schema';

// `VehicleStatus` re-exported from the codegen mirror.
export { VehicleStatus, VehicleStatusSchema };

export const VehicleTelematicsSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  speed: z.number(),
  heading: z.number(),
  fuelLevel: z.number().nullable(),
  engineRunning: z.boolean(),
  odometer: z.number(),
  timestamp: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const VehicleSchema = z.object({
  id: z.number(),
  vehicleId: z.string(),
  unitNumber: z.string(),
  vin: z.string(),
  equipmentType: EquipmentTypeSchema,
  ownershipType: OwnershipTypeSchema.nullable().optional(),
  status: VehicleStatusSchema,
  lifecycleStatus: z.enum(['ACTIVE', 'INACTIVE', 'DECOMMISSIONED']).optional(),
  previousStatus: VehicleStatusSchema.nullable().optional(),
  deactivatedAt: z.string().nullable().optional(),
  deactivatedBy: z.number().nullable().optional(),
  deactivationReason: z.string().nullable().optional(),
  reactivatedAt: z.string().nullable().optional(),
  reactivatedBy: z.number().nullable().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 2)
    .optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().optional(),
  hasSleeperBerth: z.boolean().optional(),
  grossWeightLbs: z.number().int().min(0).max(200000).optional(),
  fuelCapacityGallons: z.number().min(1).max(500),
  currentFuelGallons: z.number().min(0).max(500).optional(),
  mpg: z.number().min(1).max(20).optional(),
  notes: z.string().nullable().optional(),
  externalVehicleId: z.string().optional(),
  externalSource: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  telematics: VehicleTelematicsSchema.nullable().optional(),
  eldTelematicsMetadata: z
    .object({
      eldId: z.string().optional(),
      eldVendor: z.string().optional(),
      lastSyncAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  assignedDriverId: z.number().nullable().optional(),
  assignedDriver: z
    .object({
      id: z.number(),
      driverId: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  currentTrailer: z
    .object({
      id: z.number(),
      trailerId: z.string(),
      unitNumber: z.string(),
      equipmentType: EquipmentTypeSchema,
    })
    .nullable()
    .optional(),
  registrationExpiry: z.string().datetime().nullable().optional(),
  insuranceExpiry: z.string().datetime().nullable().optional(),
  annualInspectionDate: z.string().datetime().nullable().optional(),
  nextMaintenanceDate: z.string().datetime().nullable().optional(),
});

export const CreateVehicleSchema = z.object({
  unitNumber: z.string().min(1),
  vin: z
    .string()
    .length(17)
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/i),
  equipmentType: EquipmentTypeSchema,
  ownershipType: OwnershipTypeSchema.optional(),
  fuelCapacityGallons: z.number().min(1).max(500),
  mpg: z.number().min(1).max(20).optional(),
  status: z.enum(['AVAILABLE', 'IN_SHOP', 'OUT_OF_SERVICE']).optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  year: z
    .number()
    .int()
    .min(1990)
    .max(new Date().getFullYear() + 2)
    .optional(),
  licensePlate: z.string().optional(),
  licensePlateState: z.string().length(2).optional(),
  hasSleeperBerth: z.boolean().optional(),
  grossWeightLbs: z.number().int().min(0).max(200000).optional(),
  currentFuelGallons: z.number().min(0).max(500).optional(),
  notes: z.string().optional(),
  assignedDriverId: z.number().nullable().optional(),
  registrationExpiry: z.string().datetime().optional(),
  insuranceExpiry: z.string().datetime().optional(),
  annualInspectionDate: z.string().datetime().optional(),
  nextMaintenanceDate: z.string().datetime().optional(),
});

export const UpdateVehicleSchema = CreateVehicleSchema.partial().extend({
  status: VehicleStatusSchema.optional(),
});

export const DeactivateVehicleSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type Vehicle = z.infer<typeof VehicleSchema>;
// `VehicleStatus` type comes from codegen mirror via re-export at the top.
export type VehicleTelematics = z.infer<typeof VehicleTelematicsSchema>;
export type CreateVehicleInput = z.infer<typeof CreateVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof UpdateVehicleSchema>;
export type DeactivateVehicleInput = z.infer<typeof DeactivateVehicleSchema>;
