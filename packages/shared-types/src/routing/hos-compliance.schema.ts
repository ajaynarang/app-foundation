import { z } from 'zod';

export const HOSValidationRequestSchema = z.object({
  driverId: z.string(),
  hoursDriven: z.number(),
  onDutyTime: z.number(),
  hoursSinceBreak: z.number(),
});

export const HOSValidationResponseSchema = z.object({
  isCompliant: z.boolean(),
  violations: z.array(z.string()),
  warnings: z.array(z.string()),
  driveTimeRemaining: z.number(),
  dutyTimeRemaining: z.number(),
  timeUntilBreakRequired: z.number(),
});

// Inferred types
export type HOSValidationRequest = z.infer<typeof HOSValidationRequestSchema>;
export type HOSValidationResponse = z.infer<typeof HOSValidationResponseSchema>;
