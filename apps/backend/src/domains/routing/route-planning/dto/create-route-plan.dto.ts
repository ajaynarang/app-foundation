import { z } from 'zod';

export const CreateRoutePlanSchema = z.object({
  driverId: z.string().min(1),
  vehicleId: z.string().min(1),
  loadIds: z.array(z.string().min(1)).min(1),
  departureTime: z.string().datetime(),
  optimizationPriority: z.enum(['minimize_time', 'minimize_cost', 'balance']).optional().default('minimize_time'),
  includePricing: z.boolean().optional().default(true),
  startFromCurrentLocation: z.boolean().optional().default(false),
  excludeCompletedStops: z.array(z.string()).optional(),
  estimatedDieselPrice: z.number().min(1.0).max(10.0).optional(),
  dispatcherParams: z
    .object({
      dockRestStops: z
        .array(
          z.object({
            stopId: z.string(),
            truckParkedHours: z.number().positive(),
            convertToRest: z.boolean(),
          }),
        )
        .optional()
        .default([]),
      preferredRestType: z.enum(['auto', 'full', 'split_8_2', 'split_7_3']).optional().default('auto'),
      avoidTollRoads: z.boolean().optional().default(false),
      maxDetourMilesForFuel: z.number().optional().default(15),
    })
    .optional()
    .default({
      dockRestStops: [],
      preferredRestType: 'auto',
      avoidTollRoads: false,
      maxDetourMilesForFuel: 15,
    }),
});

export type CreateRoutePlanDto = z.infer<typeof CreateRoutePlanSchema>;
