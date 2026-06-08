import { z } from 'zod';
import { NoaStatusSchema } from './invoice.schema';

export const NoaInboxAgeBucketSchema = z.enum(['all', 'pending_gt_14', 'rejected']);
export type NoaInboxAgeBucket = z.infer<typeof NoaInboxAgeBucketSchema>;

export const NoaInboxRowSchema = z.object({
  id: z.number().int(),
  noaId: z.string(),
  customerId: z.number().int(),
  customerName: z.string(),
  factoringCompanyId: z.number().int(),
  factoringCompanyName: z.string(),
  status: NoaStatusSchema,
  sentAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  ageDays: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoaInboxRow = z.infer<typeof NoaInboxRowSchema>;

export const NoaInboxFiltersSchema = z.object({
  status: NoaStatusSchema.optional(),
  factorId: z.number().int().optional(),
  customerId: z.number().int().optional(),
  ageBucket: NoaInboxAgeBucketSchema.optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});
export type NoaInboxFilters = z.infer<typeof NoaInboxFiltersSchema>;

export const NoaInboxResponseSchema = z.object({
  items: z.array(NoaInboxRowSchema),
  total: z.number().int(),
});
export type NoaInboxResponse = z.infer<typeof NoaInboxResponseSchema>;

export const BulkCreateNoaForFactorChangeSchema = z.object({
  newFactoringCompanyId: z.number().int().positive(),
});
export type BulkCreateNoaForFactorChangeInput = z.infer<typeof BulkCreateNoaForFactorChangeSchema>;

export const BulkCreateNoaForFactorChangeResultSchema = z.object({
  created: z.number().int(),
  skipped: z.number().int(),
  customerIds: z.array(z.number().int()),
});
export type BulkCreateNoaForFactorChangeResult = z.infer<typeof BulkCreateNoaForFactorChangeResultSchema>;

export const SendNoaResultSchema = z.object({
  sent: z.boolean(),
  to: z.string(),
});
export type SendNoaResult = z.infer<typeof SendNoaResultSchema>;
