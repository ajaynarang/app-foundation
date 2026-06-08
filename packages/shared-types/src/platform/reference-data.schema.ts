import { z } from 'zod';

export const ReferenceItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  sortOrder: z.number(),
  metadata: z.record(z.string(), z.any()),
});

export const ReferenceDataMapSchema = z.record(z.string(), z.array(ReferenceItemSchema));

// Inferred types
export type ReferenceItem = z.infer<typeof ReferenceItemSchema>;
export type ReferenceDataMap = z.infer<typeof ReferenceDataMapSchema>;
