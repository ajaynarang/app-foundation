import { z } from 'zod';

export const LoadProfitabilitySchema = z.object({
  loadNumber: z.string(),
  revenueCents: z.number(),
  driverCostCents: z.number(),
  fuelCostCents: z.number(),
  marginCents: z.number(),
  marginPercent: z.number(),
});
export type LoadProfitability = z.infer<typeof LoadProfitabilitySchema>;
