import { z } from 'zod';
import {
  BillingPath,
  BillingPathSchema,
  InvoiceStatus,
  InvoiceStatusSchema,
  LineItemType,
  LineItemTypeSchema,
  NoaStatus,
  NoaStatusSchema,
  RecourseType,
  RecourseTypeSchema,
} from '../generated/prisma-enums';

// ─── Enums ────────────────────────────────────────────────────────────────────

// All invoice-side enums re-exported from the codegen mirror — Prisma enums
// are the single source of truth.
export {
  BillingPath,
  BillingPathSchema,
  InvoiceStatus,
  InvoiceStatusSchema,
  LineItemType,
  LineItemTypeSchema,
  NoaStatus,
  NoaStatusSchema,
  RecourseType,
  RecourseTypeSchema,
};

// ─── Create Invoice ───────────────────────────────────────────────────────────

export const CreateInvoiceLineItemSchema = z.object({
  type: LineItemTypeSchema,
  description: z.string(),
  quantity: z.number().min(0),
  unitPriceCents: z.number().int().min(0),
});
export type CreateInvoiceLineItemInput = z.infer<typeof CreateInvoiceLineItemSchema>;

export const CreateInvoiceSchema = z.object({
  loadId: z.string(),
  paymentTermsDays: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  lineItems: z.array(CreateInvoiceLineItemSchema).optional(),
});
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

export const RecordPaymentSchema = z.object({
  amountCents: z.number().int().min(1),
  paymentMethod: z.string().optional(),
  referenceNumber: z.string().optional(),
  paymentDate: z.string(),
  notes: z.string().optional(),
});
export type RecordPaymentInput = z.infer<typeof RecordPaymentSchema>;

export const UpdateInvoiceSchema = z.object({
  paymentTermsDays: z.number().int().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
  adjustmentCents: z.number().int().optional(),
  lineItems: z.array(CreateInvoiceLineItemSchema).optional(),
});
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

// ─── Batch Invoice ────────────────────────────────────────────────────────────

export const BatchGenerateSchema = z.object({
  loadIds: z.array(z.string()).max(50),
  paymentTermsDays: z.number().int().min(0).optional(),
});
export type BatchGenerateInput = z.infer<typeof BatchGenerateSchema>;

export const BatchInvoiceActionSchema = z.object({
  invoiceIds: z.array(z.string()).max(50),
});
export type BatchInvoiceActionInput = z.infer<typeof BatchInvoiceActionSchema>;

export const BatchMarkPaidSchema = BatchInvoiceActionSchema.extend({
  paymentDate: z.string(),
  paymentMethod: z.string().optional(),
});
export type BatchMarkPaidInput = z.infer<typeof BatchMarkPaidSchema>;

// ─── Factoring ────────────────────────────────────────────────────────────────

export const CreateFactoringCompanySchema = z.object({
  companyName: z.string(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  remittanceAddress: z.string().optional(),
  submissionEmail: z.string().email().optional(),
  advanceRatePct: z.number().min(0).max(100).optional(),
  feeRatePct: z.number().min(0).max(100).optional(),
  recourseType: RecourseTypeSchema.optional(),
  notes: z.string().optional(),
  website: z.string().optional(),
  remittanceCity: z.string().optional(),
  remittanceState: z.string().optional(),
  remittanceZip: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type CreateFactoringCompanyInput = z.infer<typeof CreateFactoringCompanySchema>;

export const UpdateFactoringCompanySchema = z.object({
  companyName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  remittanceAddress: z.string().optional(),
  submissionEmail: z.string().email().optional(),
  advanceRatePct: z.number().min(0).max(100).optional(),
  feeRatePct: z.number().min(0).max(100).optional(),
  recourseType: RecourseTypeSchema.optional(),
  notes: z.string().optional(),
  website: z.string().optional(),
  remittanceCity: z.string().optional(),
  remittanceState: z.string().optional(),
  remittanceZip: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});
export type UpdateFactoringCompanyInput = z.infer<typeof UpdateFactoringCompanySchema>;

export const SubmitToFactorSchema = z.object({
  factoringCompanyId: z.string(),
  factoringReference: z.string().optional(),
  sendEmail: z.boolean().optional(),
});
export type SubmitToFactorInput = z.infer<typeof SubmitToFactorSchema>;

export const CreateNoaRecordSchema = z.object({
  customerId: z.number(),
  factoringCompanyId: z.number(),
  notes: z.string().optional(),
});
export type CreateNoaRecordInput = z.infer<typeof CreateNoaRecordSchema>;

export const UpdateNoaStatusSchema = z.object({
  status: NoaStatusSchema,
  rejectionReason: z.string().optional(),
});
export type UpdateNoaStatusInput = z.infer<typeof UpdateNoaStatusSchema>;

// ─── Invoice Settings ─────────────────────────────────────────────────────────

export const UpdateInvoiceSettingsSchema = z.object({
  companyLegalName: z.string().optional(),
  logoUrl: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  defaultPaymentTermsDays: z.number().int().min(1).max(120).optional(),
  remittanceInstructions: z.string().optional(),
  acceptedPaymentMethods: z.string().optional(),
  defaultNotes: z.string().optional(),
  termsAndConditions: z.string().optional(),
  invoicePrefix: z.string().optional(),
  replyToEmail: z.string().optional(),
  emailSubjectTemplate: z.string().optional(),
  emailBodyTemplate: z.string().optional(),
});
export type UpdateInvoiceSettingsInput = z.infer<typeof UpdateInvoiceSettingsSchema>;

// ─── Response Shapes ─────────────────────────────────────────────────────────

export const InvoiceLineItemSchema = z.object({
  id: z.number(),
  type: LineItemTypeSchema,
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number(),
  totalCents: z.number(),
  sequenceOrder: z.number(),
});
export type InvoiceLineItem = z.infer<typeof InvoiceLineItemSchema>;

export const InvoicePaymentSchema = z.object({
  id: z.number(),
  paymentId: z.string(),
  amountCents: z.number(),
  paymentMethod: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(),
  notes: z.string().nullable(),
});
export type InvoicePayment = z.infer<typeof InvoicePaymentSchema>;

export const InvoiceSchema = z.object({
  id: z.number(),
  invoiceNumber: z.string(),
  status: InvoiceStatusSchema,
  customerId: z.number(),
  customer: z.object({
    companyName: z.string(),
    billingEmail: z.string().optional(),
    contactEmail: z.string().optional(),
    billingAddress: z.string().optional(),
    address: z.string().optional(),
    customerId: z.string().optional(),
    // Per-customer factoring overrides (used by FactorSourceChip on invoice detail).
    defaultFactoringCompanyId: z.number().nullable().optional(),
    defaultBillingPath: BillingPathSchema.nullable().optional(),
  }),
  loadId: z.number(),
  load: z.object({
    loadNumber: z.string(),
    loadId: z.string(),
    // Customer reference / PO number — surfaced on the invoice table & sheet via
    // `formatLoadLabel`. Optional because some loads (drafts, EDI tenders without
    // a customer PO) genuinely have no reference; missing values render as
    // `⚠ no PO` via the shared helper.
    referenceNumber: z.string().nullable().optional(),
  }),
  subtotalCents: z.number(),
  adjustmentCents: z.number(),
  totalCents: z.number(),
  paidCents: z.number(),
  balanceCents: z.number(),
  issueDate: z.string(),
  dueDate: z.string(),
  paidDate: z.string().nullable(),
  paymentTermsDays: z.number(),
  notes: z.string().nullable(),
  internalNotes: z.string().nullable(),
  externalInvoiceId: z.string().nullable(),
  externalSyncedAt: z.string().nullable(),
  externalSyncError: z.string().nullable(),
  billingPath: BillingPathSchema.optional(),
  factoringCompanyId: z.number().nullable().optional(),
  factoringReference: z.string().nullable().optional(),
  submittedToFactorAt: z.string().nullable().optional(),
  // Phase 4 — denormalized money cache (populated from factoring_transactions ledger).
  advanceAmountCents: z.number().int().nullable().optional(),
  advanceReceivedAt: z.string().nullable().optional(),
  reserveAmountCents: z.number().int().nullable().optional(),
  reserveReleasedAt: z.string().nullable().optional(),
  factoringFeeCents: z.number().int().nullable().optional(),
  createdAt: z.string(),
  lineItems: z.array(InvoiceLineItemSchema),
  payments: z.array(InvoicePaymentSchema).optional(),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const AgingBucketSchema = z.object({
  amountCents: z.number(),
  count: z.number(),
});
export type AgingBucket = z.infer<typeof AgingBucketSchema>;

export const InvoiceSummarySchema = z.object({
  outstandingCents: z.number(),
  overdueCents: z.number(),
  dueThisWeekCents: z.number(),
  dueThisWeekCount: z.number(),
  paidThisMonthCents: z.number(),
  draftCount: z.number(),
  readyToInvoiceCount: z.number(),
  factoredCents: z.number(),
  factoredCount: z.number(),
  factoredInvoicesCents: z.number(),
  factoredInvoicesCount: z.number(),
  directInvoicesCents: z.number(),
  directInvoicesCount: z.number(),
  aging: z.object({
    current: AgingBucketSchema,
    days1To30: AgingBucketSchema,
    days31To60: AgingBucketSchema,
    days61To90: AgingBucketSchema,
    daysOver90: AgingBucketSchema,
  }),
  // Phase 4C — separate Factored column. FACTORED + RECOURSED invoices
  // bucket here using totalCents (full broker exposure) instead of balanceCents.
  factoredAging: z
    .object({
      current: AgingBucketSchema,
      days1To30: AgingBucketSchema,
      days31To60: AgingBucketSchema,
      days61To90: AgingBucketSchema,
      daysOver90: AgingBucketSchema,
    })
    .optional(),
  /**
   * Average days from invoice issue to payment over the last 90 days.
   * Omitted when the sample size is below the statistically meaningful
   * floor (currently 5 invoices) — surface "—" or hide the tile rather
   * than mislead with a noisy figure. Surfaced on the AR Health report
   * in Insights.
   */
  dsoDays: z.number().int().min(0).optional(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const EmailPreviewSchema = z.object({
  to: z.string().nullable(),
  subject: z.string(),
  bodyHtml: z.string(),
  hasPdfAttachment: z.boolean(),
  invoiceNumber: z.string(),
});
export type EmailPreview = z.infer<typeof EmailPreviewSchema>;
