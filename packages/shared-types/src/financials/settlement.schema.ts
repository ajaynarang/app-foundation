import { z } from 'zod';
import {
  DeductionType,
  DeductionTypeSchema,
  PayStructureType,
  PayStructureTypeSchema,
  SettlementStatus,
  SettlementStatusSchema,
} from '../generated/prisma-enums';

// ─── Enums ────────────────────────────────────────────────────────────────────

// All settlement-side enums re-exported from the codegen mirror.
export {
  DeductionType,
  DeductionTypeSchema,
  PayStructureType,
  PayStructureTypeSchema,
  SettlementStatus,
  SettlementStatusSchema,
};

// ─── Calculate Settlement ─────────────────────────────────────────────────────

export const CalculateSettlementSchema = z.object({
  driverId: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  preview: z.boolean().optional(),
});
export type CalculateSettlementInput = z.infer<typeof CalculateSettlementSchema>;

// ─── Add Deduction ────────────────────────────────────────────────────────────

export const AddDeductionSchema = z.object({
  type: DeductionTypeSchema,
  description: z.string(),
  amountCents: z.number().int().min(1),
});
export type AddDeductionInput = z.infer<typeof AddDeductionSchema>;

// ─── Batch Settlement ─────────────────────────────────────────────────────────

export const BatchCalculateSchema = z.object({
  driverIds: z.array(z.string()).min(1).max(50),
  periodStart: z.string(),
  periodEnd: z.string(),
});
export type BatchCalculateInput = z.infer<typeof BatchCalculateSchema>;

export const BatchSettlementActionSchema = z.object({
  settlementIds: z.array(z.string()).min(1).max(50),
});
export type BatchSettlementActionInput = z.infer<typeof BatchSettlementActionSchema>;

export const PreviewBatchSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
});
export type PreviewBatchInput = z.infer<typeof PreviewBatchSchema>;

export const UpdateNotesSchema = z.object({
  notes: z.string(),
});
export type UpdateNotesInput = z.infer<typeof UpdateNotesSchema>;

// ─── Pay Structure ────────────────────────────────────────────────────────────

export const UpsertPayStructureSchema = z.object({
  type: PayStructureTypeSchema,
  ratePerMileCents: z.number().int().min(1).optional(),
  percentage: z.number().min(0.1).optional(),
  flatRateCents: z.number().int().min(1).optional(),
  hybridBaseCents: z.number().int().min(0).optional(),
  hybridPercent: z.number().min(0.1).optional(),
  effectiveDate: z.string(),
  notes: z.string().optional(),
});
export type UpsertPayStructureInput = z.infer<typeof UpsertPayStructureSchema>;

// ─── Response Shapes ─────────────────────────────────────────────────────────

export const DriverPayStructureSchema = z.object({
  id: z.number(),
  driverId: z.number(),
  type: PayStructureTypeSchema,
  ratePerMileCents: z.number().nullable(),
  percentage: z.number().nullable(),
  flatRateCents: z.number().nullable(),
  hybridBaseCents: z.number().nullable(),
  hybridPercent: z.number().nullable(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  effectiveDate: z.string(), // backward compat alias for effectiveFrom
  notes: z.string().nullable(),
});
export type DriverPayStructure = z.infer<typeof DriverPayStructureSchema>;

export const SettlementLineItemSchema = z.object({
  id: z.number(),
  loadId: z.number(),
  load: z
    .object({
      loadNumber: z.string(),
      referenceNumber: z.string().nullable(),
      loadId: z.string(),
      stops: z
        .array(
          z.object({
            stop: z.object({ city: z.string(), state: z.string() }).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  description: z.string(),
  miles: z.number().nullable(),
  loadRevenueCents: z.number().nullable(),
  payAmountCents: z.number(),
  payStructureType: PayStructureTypeSchema,
  rateSnapshot: z.record(z.any()).nullable().optional(),
  legId: z.number().nullable().optional(),
  legSequence: z.number().nullable().optional(),
});
export type SettlementLineItem = z.infer<typeof SettlementLineItemSchema>;

export const SettlementDeductionSchema = z.object({
  id: z.number(),
  type: DeductionTypeSchema,
  description: z.string(),
  amountCents: z.number(),
});
export type SettlementDeduction = z.infer<typeof SettlementDeductionSchema>;

export const SettlementSchema = z.object({
  id: z.number(),
  settlementId: z.string(),
  settlementNumber: z.string(),
  status: SettlementStatusSchema,
  driverId: z.number(),
  driver: z.object({
    driverId: z.string(),
    name: z.string(),
    payStructures: z.array(DriverPayStructureSchema).optional(),
  }),
  periodStart: z.string(),
  periodEnd: z.string(),
  grossPayCents: z.number(),
  deductionsCents: z.number(),
  netPayCents: z.number(),
  notes: z.string().nullable(),
  approvedBy: z.number().nullable(),
  approvedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  lineItems: z.array(SettlementLineItemSchema),
  deductions: z.array(SettlementDeductionSchema),
  externalBillId: z.string().nullable(),
  externalSyncedAt: z.string().nullable(),
  externalSyncError: z.string().nullable(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

export const SettlementSummarySchema = z.object({
  pendingApproval: z.number(),
  pendingApprovalCents: z.number(),
  readyToPay: z.number(),
  readyToPayCents: z.number(),
  paidThisMonthCents: z.number(),
  activeDrivers: z.number(),
  avgSettlementCents: z.number(),
});
export type SettlementSummary = z.infer<typeof SettlementSummarySchema>;

export const SettlementListParamsSchema = z.object({
  status: z.string().optional(),
  driverId: z.string().optional(),
  search: z.string().optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});
export type SettlementListParams = z.infer<typeof SettlementListParamsSchema>;
