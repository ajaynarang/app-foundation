import { z } from 'zod';
import { LoadChargeSchema } from '../fleet/load.schema';

// ─── Close-Out Response Shapes ───────────────────────────────────────────────

export const CloseOutLoadSchema = z.object({
  id: z.number(),
  loadId: z.string(),
  loadNumber: z.string(),
  referenceNumber: z.string().nullable(),
  status: z.string(),
  billingStatus: z.string(),
  customerName: z.string(),
  customerId: z.number().nullable(),
  rateCents: z.number().nullable(),
  chargeTotalCents: z.number(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  driverName: z.string().nullable(),
  driverId: z.number().nullable(),
  vehicleNumber: z.string().nullable(),
  stops: z.array(
    z.object({
      id: z.number(),
      sequenceOrder: z.number(),
      actionType: z.string(),
      status: z.string(),
      completedAt: z.string().nullable(),
    }),
  ),
  charges: z.array(LoadChargeSchema),
});
export type CloseOutLoad = z.infer<typeof CloseOutLoadSchema>;

export const CloseOutSummarySchema = z.object({
  needsDocs: z.number(),
  readyForReview: z.number(),
  readyToBill: z.number(),
  readyToBillTotalCents: z.number(),
  overduePods: z.number(),
  total: z.number(),
});
export type CloseOutSummary = z.infer<typeof CloseOutSummarySchema>;

export const BillingReadinessItemSchema = z.object({
  category: z.enum(['document', 'charge']),
  type: z.string(),
  label: z.string(),
  enforcement: z.enum(['required', 'recommended', 'when_applicable']),
  status: z.enum(['satisfied', 'missing', 'overdue', 'not_applicable']),
  reason: z.string(),
  relatedStopId: z.number().optional(),
  relatedStopName: z.string().optional(),
  dueBy: z.string().optional(),
  satisfiedBy: z
    .object({
      documentId: z.number(),
      fileName: z.string(),
      uploadedAt: z.string(),
    })
    .optional(),
  amountCents: z.number().optional(),
});
export type BillingReadinessItem = z.infer<typeof BillingReadinessItemSchema>;

export const BillingReadinessResultSchema = z.object({
  score: z.number(),
  totalRequired: z.number(),
  totalSatisfied: z.number(),
  readyToApprove: z.boolean(),
  hasBlockers: z.boolean(),
  items: z.array(BillingReadinessItemSchema),
  overrideAllowed: z.boolean(),
  overrideExists: z
    .object({
      overriddenBy: z.string(),
      reason: z.string(),
      createdAt: z.string(),
    })
    .optional(),
});
export type BillingReadinessResult = z.infer<typeof BillingReadinessResultSchema>;
