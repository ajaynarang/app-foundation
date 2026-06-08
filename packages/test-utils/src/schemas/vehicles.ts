/**
 * API Contracts for Vehicle endpoints.
 *
 * These schemas intentionally do not use `.strict()` everywhere because the
 * shared-types `VehicleSchema` does not match the backend list response
 * (which adds `activeLoadCounts` + `upcomingUnavailability`). When the
 * backend formatResponse drifts, update here.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

const AssignedDriverSchema = z
  .object({
    id: dbId,
    driverId: stringId,
    name: z.string(),
  })
  .nullable();

const ActiveLoadCountsSchema = z.object({
  inTransit: z.number().int(),
  assigned: z.number().int(),
  onHold: z.number().int().optional(),
});

const TelematicsSchema = z
  .object({
    latitude: z.number(),
    longitude: z.number(),
    speed: z.number(),
    heading: z.number(),
    fuelLevel: z.number().nullable(),
    engineRunning: z.boolean(),
    odometer: z.number(),
    timestamp: z.string().optional().nullable(),
    updatedAt: z.string().optional().nullable(),
  })
  .nullable();

// ── GET /vehicles — List item (adds activeLoadCounts + upcomingUnavailability) ──

export const VehicleListItemSchema = z.object({
  id: dbId,
  vehicleId: stringId,
  unitNumber: z.string(),
  vin: z.string().nullable(),
  equipmentType: z.string(),
  status: z.string(),
  lifecycleStatus: z.string(),
  previousStatus: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().nullable(),
  licensePlate: z.string().nullable(),
  licensePlateState: z.string().nullable(),
  hasSleeperBerth: z.boolean().nullable(),
  grossWeightLbs: z.number().nullable(),
  fuelCapacityGallons: z.number().nullable(),
  currentFuelGallons: z.number().nullable(),
  mpg: z.number().nullable(),
  eldTelematicsMetadata: z.unknown().nullable(),
  assignedDriverId: z.number().nullable(),
  assignedDriver: AssignedDriverSchema,
  activeLoadCounts: ActiveLoadCountsSchema,
  externalVehicleId: z.string().nullable(),
  externalSource: z.string().nullable(),
  lastSyncedAt: z.string().nullable().optional(),
  deactivatedAt: z.string().nullable(),
  deactivatedBy: z.union([z.string(), z.number()]).nullable(),
  deactivationReason: z.string().nullable(),
  reactivatedAt: z.string().nullable(),
  reactivatedBy: z.union([z.string(), z.number()]).nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
  telematics: TelematicsSchema.optional(),
  upcomingUnavailability: z.unknown().nullable().optional(),
});

// ── POST /vehicles — Create response (subset of list item, no activeLoadCounts) ──

export const CreateVehicleResponseSchema = z.object({
  id: dbId,
  vehicleId: stringId,
  unitNumber: z.string(),
  vin: z.string().nullable(),
  equipmentType: z.string(),
  status: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().nullable(),
  licensePlate: z.string().nullable(),
  licensePlateState: z.string().nullable(),
  hasSleeperBerth: z.boolean().nullable(),
  grossWeightLbs: z.number().nullable(),
  fuelCapacityGallons: z.number().nullable(),
  currentFuelGallons: z.number().nullable(),
  mpg: z.number().nullable(),
  externalVehicleId: z.string().nullable(),
  externalSource: z.string().nullable(),
  lastSyncedAt: z.string().nullable().optional(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ── PUT /vehicles/:id — Update response (identical to create) ─────

export const UpdateVehicleResponseSchema = CreateVehicleResponseSchema;

// ── Detail / lifecycle / inactive response (formatResponse) ──────
//
// GET /vehicles/:id, POST /deactivate|reactivate|decommission, GET /inactive/list
// all pass through VehiclesService.formatResponse — richer than create.

export const VehicleDetailSchema = z.object({
  id: dbId,
  vehicleId: stringId,
  unitNumber: z.string(),
  vin: z.string().nullable(),
  equipmentType: z.string(),
  status: z.string(),
  lifecycleStatus: z.string(),
  previousStatus: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().nullable(),
  licensePlate: z.string().nullable(),
  licensePlateState: z.string().nullable(),
  hasSleeperBerth: z.boolean().nullable(),
  grossWeightLbs: z.number().nullable(),
  fuelCapacityGallons: z.number().nullable(),
  currentFuelGallons: z.number().nullable(),
  mpg: z.number().nullable(),
  eldTelematicsMetadata: z.unknown().nullable(),
  assignedDriverId: z.number().nullable(),
  assignedDriver: AssignedDriverSchema,
  telematics: TelematicsSchema,
  externalVehicleId: z.string().nullable(),
  externalSource: z.string().nullable(),
  lastSyncedAt: z.string().nullable().optional(),
  deactivatedAt: z.string().nullable(),
  deactivatedBy: z.union([z.string(), z.number()]).nullable(),
  deactivationReason: z.string().nullable(),
  reactivatedAt: z.string().nullable(),
  reactivatedBy: z.union([z.string(), z.number()]).nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});
