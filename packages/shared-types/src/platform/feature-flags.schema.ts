import { z } from 'zod';

export const FeatureFlagSchema = z.object({
  key: z.string(),
  name: z.string(),
  description: z.string().optional(),
  enabled: z.boolean(),
  category: z.string(),
});

export const FeatureFlagsResponseSchema = z.object({
  flags: z.array(FeatureFlagSchema),
});

export const FeatureFlagEnabledResponseSchema = z.object({
  key: z.string(),
  enabled: z.boolean(),
});

// Inferred types
export type FeatureFlag = z.infer<typeof FeatureFlagSchema>;
export type FeatureFlagsResponse = z.infer<typeof FeatureFlagsResponseSchema>;
export type FeatureFlagEnabledResponse = z.infer<typeof FeatureFlagEnabledResponseSchema>;
