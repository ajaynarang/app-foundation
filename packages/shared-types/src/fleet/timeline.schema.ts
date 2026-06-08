import { z } from 'zod';

export const TimelineEntryTypeSchema = z.enum(['sally', 'operations', 'alert', 'driver', 'system']);
export type TimelineEntryType = z.infer<typeof TimelineEntryTypeSchema>;

export const TimelineEntrySchema = z.object({
  id: z.string(),
  type: TimelineEntryTypeSchema,
  content: z.string(),
  timestamp: z.string(), // ISO 8601
  metadata: z
    .object({
      // sally
      card: z.any().optional(),
      speakText: z.string().optional(),
      // operations
      loadId: z.string().optional(),
      messageId: z.string().optional(),
      deliveredAt: z.string().optional(),
      acknowledged: z.boolean().optional(),
      // alert
      alertId: z.string().optional(),
      severity: z.enum(['critical', 'high', 'medium', 'low']).optional(),
      category: z.string().optional(),
      acknowledgedAt: z.string().optional(),
      recommendedAction: z.string().optional(),
      title: z.string().optional(),
      // driver
      sentToOperations: z.boolean().optional(),
    })
    .optional(),
});
export type TimelineEntry = z.infer<typeof TimelineEntrySchema>;

export const LoadContextSchema = z
  .object({
    loadId: z.string(),
    loadNumber: z.string(),
    status: z.string(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    customerName: z.string().optional(),
    currentStop: z
      .object({
        name: z.string(),
        location: z.string(),
        eta: z.string().optional(),
      })
      .optional(),
  })
  .nullable();
export type LoadContext = z.infer<typeof LoadContextSchema>;

export const TimelineResponseSchema = z.object({
  entries: z.array(TimelineEntrySchema),
  cursor: z.string().nullable(),
  loadContext: LoadContextSchema,
});
export type TimelineResponse = z.infer<typeof TimelineResponseSchema>;
