import { z } from 'zod';
import { TripStatus, TripStatusSchema } from '../generated/prisma-enums';

// `TripStatus` re-exported from the codegen mirror.
export { TripStatus, TripStatusSchema };

// Full trip object (API response)
export const TripSchema = z.object({
  id: z.number(),
  tripId: z.string(),
  tenantId: z.number(),
  driverId: z.number().nullable(),
  vehicleId: z.number().nullable(),
  status: TripStatusSchema,
  loadCount: z.number().int().min(0),
  totalMiles: z.number().nullable(),
  totalRevenueCents: z.number().int().nullable(),
  createdAt: z.string(),
  createdBy: z.number(),
  updatedAt: z.string(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
});
export type Trip = z.infer<typeof TripSchema>;

// Trip list item (optimized for list views)
export const TripListItemSchema = z.object({
  id: z.number(),
  tripId: z.string(),
  status: TripStatusSchema,
  loadCount: z.number().int(),
  totalMiles: z.number().nullable(),
  totalRevenueCents: z.number().int().nullable(),
  driverName: z.string().nullable(),
  driverStringId: z.string().nullable(),
  vehicleUnitNumber: z.string().nullable(),
  createdAt: z.string(),
  assignedAt: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
});
export type TripListItem = z.infer<typeof TripListItemSchema>;

// Trip detail (with nested loads)
export const TripDetailSchema = TripSchema.extend({
  driverName: z.string().nullable(),
  driverStringId: z.string().nullable(),
  vehicleUnitNumber: z.string().nullable(),
  loads: z.array(
    z.object({
      id: z.number(),
      loadId: z.string(),
      loadNumber: z.string(),
      referenceNumber: z.string().nullable(),
      status: z.string(),
      tripOrder: z.number().nullable(),
      customerName: z.string().nullable(),
      originCity: z.string().nullable(),
      originState: z.string().nullable(),
      destinationCity: z.string().nullable(),
      destinationState: z.string().nullable(),
      rateCents: z.number().int().nullable(),
      estimatedMiles: z.number().nullable(),
      pickupDate: z.string().nullable(),
      deliveryDate: z.string().nullable(),
    }),
  ),
  routePlanId: z.string().nullable(),
});
export type TripDetail = z.infer<typeof TripDetailSchema>;

// Create trip input
export const CreateTripSchema = z.object({
  loadIds: z.array(z.string()).min(2).max(10),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  generateRoute: z.boolean().optional(),
});
export type CreateTripInput = z.infer<typeof CreateTripSchema>;

// Update trip input (reorder loads)
export const UpdateTripSchema = z.object({
  loadOrder: z
    .array(
      z.object({
        loadId: z.string(),
        tripOrder: z.number().int().min(1),
      }),
    )
    .optional(),
});
export type UpdateTripInput = z.infer<typeof UpdateTripSchema>;

// Assign trip input
export const AssignTripSchema = z.object({
  driverId: z.string(),
  vehicleId: z.string(),
  generateRoute: z.boolean().optional(),
});
export type AssignTripInput = z.infer<typeof AssignTripSchema>;

// Add load to trip input
export const AddLoadToTripSchema = z.object({
  loadId: z.string(),
});
export type AddLoadToTripInput = z.infer<typeof AddLoadToTripSchema>;

// Trip list filters
export const TripListFiltersSchema = z.object({
  // Single status or a comma-separated set (e.g. 'DRAFT,ASSIGNED,IN_PROGRESS').
  // Each part is validated against TripStatus by the backend DTO.
  status: z.string().optional(),
  driverId: z.string().optional(),
  vehicleId: z.string().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(['createdAt', 'assignedAt', 'totalRevenueCents', 'loadCount']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});
export type TripListFilters = z.infer<typeof TripListFiltersSchema>;
