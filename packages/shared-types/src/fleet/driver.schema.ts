import { z } from 'zod';

export const DriverHOSSchema = z.object({
  driverId: z.string(),
  hoursDriven: z.number(),
  onDutyTime: z.number(),
  hoursSinceBreak: z.number(),
  dutyStatus: z.string(),
  lastUpdated: z.string(),
  dataSource: z.string(),
  cached: z.boolean().optional(),
  stale: z.boolean().optional(),
  cacheAgeSeconds: z.number().optional(),
});

export const DriverSchema = z.object({
  id: z.number(),
  driverId: z.string(),
  name: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  cdlClass: z.string().optional(),
  licenseNumber: z.string().optional(),
  licenseState: z.string().optional(),
  endorsements: z.array(z.string()).optional(),
  status: z.string().optional(),
  hireDate: z.string().optional(),
  medicalCardExpiry: z.string().optional(),
  homeTerminalCity: z.string().optional(),
  homeTerminalState: z.string().optional(),
  homeTerminalTimezone: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  currentHoursDriven: z.number().optional(),
  currentOnDutyTime: z.number().optional(),
  currentHoursSinceBreak: z.number().optional(),
  cycleHoursUsed: z.number().optional(),
  currentHos: z
    .object({
      driveRemaining: z.number(),
      shiftRemaining: z.number(),
      cycleRemaining: z.number(),
      breakRequired: z.boolean(),
    })
    .optional(),
  externalDriverId: z.string().optional(),
  externalSource: z.string().optional(),
  syncStatus: z.string().optional(),
  hosDataSource: z.string().optional(),
  hosDataSyncedAt: z.string().optional(),
  lastSyncedAt: z.string().optional(),
  currentLoad: z
    .object({
      loadId: z.string(),
      loadNumber: z.string().optional(),
      referenceNumber: z.string().optional(),
      status: z.string(),
      customerName: z.string().optional(),
      originCity: z.string().nullable().optional(),
      originState: z.string().nullable().optional(),
      destinationCity: z.string().nullable().optional(),
      destinationState: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  upcomingLoads: z
    .array(
      z.object({
        loadId: z.string(),
        loadNumber: z.string().optional(),
        referenceNumber: z.string().optional(),
        status: z.string(),
        customerName: z.string().optional(),
        originCity: z.string().nullable().optional(),
        originState: z.string().nullable().optional(),
        destinationCity: z.string().nullable().optional(),
        destinationState: z.string().nullable().optional(),
      }),
    )
    .optional(),
  deactivatedAt: z.string().nullable().optional(),
  deactivatedBy: z.number().nullable().optional(),
  deactivationReason: z.string().nullable().optional(),
  reactivatedAt: z.string().nullable().optional(),
  reactivatedBy: z.number().nullable().optional(),
  eldMetadata: z
    .object({
      eldId: z.string().optional(),
      eldVendor: z.string().optional(),
      username: z.string().optional(),
      lastSyncAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  assignedVehicleId: z.number().nullable().optional(),
  assignedVehicle: z
    .object({
      id: z.number(),
      vehicleId: z.string(),
      unitNumber: z.string(),
      make: z.string().optional(),
      model: z.string().optional(),
    })
    .nullable()
    .optional(),
  sallyAccessStatus: z.enum(['ACTIVE', 'INVITED', 'NO_ACCESS', 'DEACTIVATED']).optional(),
  linkedUserId: z.string().nullable().optional(),
  pendingInvitationId: z.string().nullable().optional(),
  cdlExpiry: z.string().datetime().nullable().optional(),
  mvrDate: z.string().datetime().nullable().optional(),
  drugTestDate: z.string().datetime().nullable().optional(),
  annualReviewDate: z.string().datetime().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const CreateDriverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  cdlClass: z.enum(['A', 'B', 'C']),
  licenseNumber: z.string().min(1),
  licenseState: z.string().length(2).optional(),
  endorsements: z.array(z.string()).optional(),
  hireDate: z.string().optional(),
  medicalCardExpiry: z.string().optional(),
  homeTerminalCity: z.string().optional(),
  homeTerminalState: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  notes: z.string().optional(),
  assignedVehicleId: z.number().nullable().optional(),
  cdlExpiry: z.string().datetime().optional(),
  mvrDate: z.string().datetime().optional(),
  drugTestDate: z.string().datetime().optional(),
  annualReviewDate: z.string().datetime().optional(),
});

export const UpdateDriverSchema = CreateDriverSchema.partial()
  .omit({ cdlClass: true })
  .extend({
    cdlClass: z.enum(['A', 'B', 'C']).optional(),
  });

export const DeactivateDriverSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const ActivateAndInviteSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const ActivateAndInviteResponseSchema = z.object({
  driver: DriverSchema,
  invitation: z.object({
    invitationId: z.string(),
    email: z.string(),
    status: z.string(),
  }),
});

export type Driver = z.infer<typeof DriverSchema>;
export type DriverHOS = z.infer<typeof DriverHOSSchema>;
export type CreateDriverInput = z.infer<typeof CreateDriverSchema>;
export type UpdateDriverInput = z.infer<typeof UpdateDriverSchema>;
export type DeactivateDriverInput = z.infer<typeof DeactivateDriverSchema>;
export type ActivateAndInviteInput = z.infer<typeof ActivateAndInviteSchema>;
export type ActivateAndInviteResponse = z.infer<typeof ActivateAndInviteResponseSchema>;
