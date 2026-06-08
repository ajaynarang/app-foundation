import { z } from 'zod';

export const MileageProviderSchema = z.enum(['here', 'pcmiler', 'osrm']);
export type MileageProvider = z.infer<typeof MileageProviderSchema>;

export const MileageRateBasisSchema = z.enum(['practical', 'shortest', 'rated']);
export type MileageRateBasis = z.infer<typeof MileageRateBasisSchema>;

/**
 * Wire shape for a single mileage computation (HERE Routing v8 truck mode etc.)
 * returned by the platform-services places + routing layer to the load-mileage queue.
 *
 * NOT to be confused with the backend `MileageResult` interface in
 * apps/backend/src/domains/platform-services/mileage/mileage-provider.interface.ts —
 * that one models multi-basis IFTA/PC*Miler output. This one is the truck-routing
 * result we cache on Load + LoadStop.
 */
export const TruckMileageResultSchema = z.object({
  miles: z.number().nonnegative(),
  driveHours: z.number().nonnegative(),
  polyline: z.string().nullable().optional(),
  provider: MileageProviderSchema,
  rateBasis: MileageRateBasisSchema,
});
export type TruckMileageResult = z.infer<typeof TruckMileageResultSchema>;

export const LoadMileageSummarySchema = z.object({
  loadId: z.string().min(1),
  totalMiles: z.number().nonnegative(),
  estimatedDriveHours: z.number().nonnegative(),
  provider: MileageProviderSchema,
  calculatedAt: z.string().datetime(),
});
export type LoadMileageSummary = z.infer<typeof LoadMileageSummarySchema>;
