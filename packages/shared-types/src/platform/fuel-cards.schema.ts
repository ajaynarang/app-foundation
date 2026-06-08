import { z } from 'zod';

export const FuelCardTypeSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FuelCardType = z.infer<typeof FuelCardTypeSchema>;

export const BrandAcceptanceEntrySchema = z.object({
  fuelCardTypeId: z.string(),
  displayName: z.string(),
});

export const BrandAcceptanceSchema = z.object({
  brand: z.string(),
  cards: z.array(BrandAcceptanceEntrySchema),
});
export type BrandAcceptance = z.infer<typeof BrandAcceptanceSchema>;
