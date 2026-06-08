import { z } from 'zod';
import { FactoringTxnType, FactoringTxnTypeSchema } from '../generated/prisma-enums';

// ─── Enum ────────────────────────────────────────────────────────────────────

// `FactoringTxnType` re-exported from the codegen mirror.
export { FactoringTxnType, FactoringTxnTypeSchema };

// ─── Full ledger row (response shape) ────────────────────────────────────────

export const FactoringTransactionSchema = z.object({
  id: z.number().int(),
  transactionId: z.string(),
  invoiceId: z.number().int(),
  invoiceNumber: z.string().optional(),
  factoringCompanyId: z.number().int(),
  factoringCompanyName: z.string().optional(),
  type: FactoringTxnTypeSchema,
  amountCents: z.number().int(),
  // Calendar-date string (YYYY-MM-DD). Never timezone-converted.
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  referenceNumber: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  // Prisma serializes Decimal as string by default.
  advanceRatePctSnapshot: z.string().nullable().optional(),
  feeRatePctSnapshot: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string(),
  createdBy: z.number().int().nullable().optional(),
  deletedAt: z.string().nullable().optional(),
  tenantId: z.number().int(),
});
export type FactoringTransaction = z.infer<typeof FactoringTransactionSchema>;

// ─── Record-transaction inputs ───────────────────────────────────────────────
//
// One discriminated-union schema per transaction type so the API self-documents
// in Swagger and the controller switch is exhaustive. amountCents is always a
// positive integer; the type discriminator carries direction.

const baseRecordFields = {
  amountCents: z.number().int().min(1),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'transactionDate must be YYYY-MM-DD calendar date'),
  referenceNumber: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
};

export const RecordAdvanceSchema = z.object({
  type: z.literal(FactoringTxnTypeSchema.enum.ADVANCE),
  ...baseRecordFields,
  // When true or omitted (default true), the service also creates the matching
  // FEE ledger row from FactoringCompany.feeRatePct. Set false to record
  // advance only.
  autoRecordFee: z.boolean().optional(),
});

export const RecordReserveReleaseSchema = z.object({
  type: z.literal(FactoringTxnTypeSchema.enum.RESERVE_RELEASE),
  ...baseRecordFields,
});

export const RecordFeeSchema = z.object({
  type: z.literal(FactoringTxnTypeSchema.enum.FEE),
  ...baseRecordFields,
});

export const RecordChargebackSchema = z.object({
  type: z.literal(FactoringTxnTypeSchema.enum.CHARGEBACK),
  ...baseRecordFields,
});

export const RecordChargebackReversalSchema = z.object({
  type: z.literal(FactoringTxnTypeSchema.enum.CHARGEBACK_REVERSAL),
  ...baseRecordFields,
});

export const RecordFactoringTransactionSchema = z.discriminatedUnion('type', [
  RecordAdvanceSchema,
  RecordReserveReleaseSchema,
  RecordFeeSchema,
  RecordChargebackSchema,
  RecordChargebackReversalSchema,
]);
export type RecordFactoringTransactionInput = z.infer<typeof RecordFactoringTransactionSchema>;

// ─── Dashboard summary (4C consumes; 4A returns a stub of this shape) ────────

export const FactoringSummarySchema = z.object({
  totalSubmittedCents: z.number().int(),
  totalSubmittedCount: z.number().int(),
  totalFundedCents: z.number().int(),
  totalFundedCount: z.number().int(),
  totalFeeCents: z.number().int(),
  reservesOutstandingCents: z.number().int(),
  averageDaysToFund: z.number().nullable(),
  recourseRatePct: z.number(),
});
export type FactoringSummary = z.infer<typeof FactoringSummarySchema>;
