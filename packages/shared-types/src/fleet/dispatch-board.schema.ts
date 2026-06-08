import { z } from 'zod';

export const DispatchDriverStatusSchema = z.enum(['AVAILABLE', 'ON_LOAD']);

export const DispatchBoardDriverSchema = z.object({
  driverId: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  status: DispatchDriverStatusSchema,
  vehicle: z
    .object({
      unitNumber: z.string(),
      equipmentType: z.string(),
    })
    .nullable(),
  currentLoad: z
    .object({
      loadId: z.string(),
      loadNumber: z.string(),
      customerName: z.string(),
      status: z.string(),
      origin: z.string(),
      destination: z.string(),
    })
    .nullable(),
  hos: z
    .object({
      driveRemainingHours: z.number().nullable(),
      dutyRemainingHours: z.number().nullable(),
      cycleRemainingHours: z.number().nullable(),
      breakRemainingHours: z.number().nullable(),
      isCritical: z.boolean(),
      dataAgeMinutes: z.number().nullable(),
    })
    .nullable(),
  location: z
    .object({
      city: z.string(),
      state: z.string(),
    })
    .nullable(),
});

export const DispatchBoardSummarySchema = z.object({
  total: z.number(),
  onLoad: z.number(),
  available: z.number(),
  hosCritical: z.number(),
});

export const DispatchBoardResponseSchema = z.object({
  drivers: z.array(DispatchBoardDriverSchema),
  summary: DispatchBoardSummarySchema,
});

export const DispatchBoardFiltersSchema = z.object({
  filter: z.enum(['all', 'available', 'onLoad', 'hosCritical']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'hosRemaining', 'status']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// Inferred types
export type DispatchDriverStatus = z.infer<typeof DispatchDriverStatusSchema>;
export type DispatchBoardDriver = z.infer<typeof DispatchBoardDriverSchema>;
export type DispatchBoardSummary = z.infer<typeof DispatchBoardSummarySchema>;
export type DispatchBoardResponse = z.infer<typeof DispatchBoardResponseSchema>;
export type DispatchBoardFilters = z.infer<typeof DispatchBoardFiltersSchema>;
