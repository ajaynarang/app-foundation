import { z } from 'zod';

export const ReversalCategorySchema = z.enum([
  'wrong_load',
  'driver_error',
  'customer_reinstatement',
  'dispatcher_correction',
  'system_error',
  'shipper_change',
  'other',
]);

export const REVERSAL_CATEGORY_LABELS: Record<string, string> = {
  wrong_load: 'Wrong Load',
  driver_error: 'Driver Error',
  customer_reinstatement: 'Customer Reinstatement',
  dispatcher_correction: 'Dispatcher Correction',
  system_error: 'System Error',
  shipper_change: 'Shipper Change',
  other: 'Other',
};

export const RevertLoadInputSchema = z.object({
  targetStatus: z.string(),
  category: ReversalCategorySchema,
  reason: z.string().min(5).max(2000),
});

export const RevertPreviewResponseSchema = z.object({
  from: z.string(),
  to: z.string(),
  affectedInvoices: z.array(
    z.object({
      id: z.number(),
      invoiceNumber: z.string(),
      status: z.string(),
      totalCents: z.number(),
    }),
  ),
  affectedSettlementLines: z.array(
    z.object({
      id: z.number(),
      settlementNumber: z.string(),
      settlementStatus: z.string(),
      payAmountCents: z.number(),
    }),
  ),
  affectedStops: z.array(
    z.object({
      id: z.number(),
      sequenceOrder: z.number(),
      currentStatus: z.string(),
    }),
  ),
  warnings: z.array(z.string()),
  blocked: z.boolean(),
  blockReason: z.string().optional(),
});

export type ReversalCategory = z.infer<typeof ReversalCategorySchema>;
export type RevertLoadInput = z.infer<typeof RevertLoadInputSchema>;
export type RevertPreviewResponse = z.infer<typeof RevertPreviewResponseSchema>;
