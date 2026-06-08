import { z } from 'zod/v4';

export const DriverHOSStateSchema = z.object({
  driveHoursRemaining: z.number(),
  shiftHoursRemaining: z.number(),
  cycleHoursRemaining: z.number(),
  breakHoursRemaining: z.number(),
  nextResetAt: z.string().nullable(),
});

export const DriverProximitySchema = z.object({
  distanceMilesFromPickup: z.number(),
  lastKnownLocation: z.string(),
});

export const DriverAvailabilitySchema = z.object({
  status: z.enum(['available', 'on_load', 'resting']),
  currentLoadNumber: z.string().nullable(),
  currentLoadEta: z.string().nullable(),
  availableAt: z.string(),
});

export const DriverVehicleInfoSchema = z
  .object({
    vehicleId: z.string(),
    unitNumber: z.string(),
    equipmentType: z.string(),
  })
  .nullable();

export const DriverRecommendationSchema = z.object({
  driverId: z.string(),
  name: z.string(),
  initials: z.string(),
  matchScore: z.number(),
  matchRationale: z.string(),
  isBestMatch: z.boolean(),
  equipmentMatch: z.boolean(),
  equipmentType: z.string().nullable(),
  hos: DriverHOSStateSchema,
  proximity: DriverProximitySchema,
  availability: DriverAvailabilitySchema,
  vehicle: DriverVehicleInfoSchema,
  activeLoadCount: z.number(),
});

export const DriverRecommendationsResponseSchema = z.object({
  recommendations: z.array(DriverRecommendationSchema),
});

export type DriverRecommendation = z.infer<typeof DriverRecommendationSchema>;
export type DriverRecommendationsResponse = z.infer<typeof DriverRecommendationsResponseSchema>;
