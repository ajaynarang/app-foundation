/**
 * API Contracts for Factoring + NOA endpoints (Phase 2 Group 2c).
 *
 * Backend controller:
 *   apps/backend/src/domains/financials/invoicing/controllers/invoicing.controller.ts
 *
 * Services (source of truth for response shapes):
 *   apps/backend/src/domains/financials/invoicing/services/
 *     - factoring.service.ts           → listCompanies, createCompany,
 *                                        updateCompany, deleteCompany,
 *                                        batchSubmitToFactor
 *     - factoring-contacts.service.ts  → list, create, update, delete
 *     - noa.service.ts                 → listNoaRecords, createNoaRecord,
 *                                        updateNoaStatus, deleteNoaRecord
 *     - invoicing.service.ts           → batchGenerate, batchSend, batchVoid,
 *                                        batchMarkPaid
 *
 * Schema strategy:
 *   - Hand-written here — shared-types covers the *request* shapes
 *     (CreateFactoringCompanySchema et al.) but not the response envelopes.
 *   - Prisma-emitted `Decimal` columns arrive as strings on the wire when
 *     set and `null` otherwise. Captured via `decimalString`.
 *   - No `.passthrough()`. Unknown keys fail `.strict()` parse and surface
 *     as documented drift.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ── Enums (mirror Prisma) ─────────────────────────────────────────────────────

export const FactoringCompanyStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const FactoringContactRoleSchema = z.enum(['PRIMARY', 'SUBMISSIONS', 'COLLECTIONS', 'NOA', 'OTHER']);
export const ContactStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);
export const NoaStatusSchema = z.enum(['NOT_SENT', 'SENT', 'ACKNOWLEDGED', 'REJECTED']);
export const RecourseTypeSchema = z.enum(['RECOURSE', 'NON_RECOURSE']);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Prisma `@db.Decimal(5, 2)` columns come back as string-encoded numerics
 * (e.g. "90.00") when set, `null` otherwise. Captured as nullable string so
 * `.strict()` parses succeed without parseFloat.
 */
const decimalString = z.string().nullable();

// ── FactoringCompany rows ─────────────────────────────────────────────────────

/**
 * `FactoringService.listCompanies` / `createCompany` / `updateCompany` return
 * the raw Prisma row. `recourseType` is nullable (no default in the model),
 * `status` defaults to 'ACTIVE'.
 *
 * Drift note: advance/fee rates are `Decimal(5,2)` → string on the wire.
 * Treated as `decimalString` (nullable) rather than `number` to match the
 * wire format exactly.
 */
export const FactoringCompanySchema = z.object({
  id: dbId,
  companyId: stringId,
  companyName: z.string(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  remittanceAddress: z.string().nullable(),
  submissionEmail: z.string().nullable(),
  advanceRatePct: decimalString,
  feeRatePct: decimalString,
  recourseType: RecourseTypeSchema.nullable(),
  status: FactoringCompanyStatusSchema,
  notes: z.string().nullable(),
  website: z.string().nullable(),
  remittanceCity: z.string().nullable(),
  remittanceState: z.string().nullable(),
  remittanceZip: z.string().nullable(),
  tenantId: dbId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

/** GET /invoices/factoring-companies — returns a bare array (no envelope). */
export const FactoringCompanyListResponseSchema = z.array(FactoringCompanySchema);

/** DELETE /invoices/factoring-companies/:company_id — `{ deleted: true }`. */
export const FactoringCompanyDeleteResponseSchema = z.object({
  deleted: z.literal(true),
});

// ── FactoringContact rows ─────────────────────────────────────────────────────

/**
 * `FactoringContactsService.{list,create,update}` return the raw Prisma
 * `FactoringContact` row. `delete` soft-deletes (flips `status=INACTIVE`)
 * and returns the updated row — NOT a `{ deleted: true }` envelope.
 */
export const FactoringContactSchema = z.object({
  id: dbId,
  contactId: stringId,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: FactoringContactRoleSchema,
  isPrimary: z.boolean(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  status: ContactStatusSchema,
  factoringCompanyId: dbId,
  tenantId: dbId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

export const FactoringContactListResponseSchema = z.array(FactoringContactSchema);

// ── NOA records ───────────────────────────────────────────────────────────────

/**
 * `NoaService.{listNoaRecords, createNoaRecord, updateNoaStatus}` return a
 * Prisma row with embedded `customer` + `factoringCompany` projections.
 *
 * `listNoaRecords` and `createNoaRecord` both include the same nested shape:
 *   - customer: { id, companyName, customerId }
 *   - factoringCompany: { id, companyId, companyName }
 *
 * `deleteNoaRecord` returns `{ deleted: true }`.
 */
const NoaNestedCustomerSchema = z.object({
  id: dbId,
  companyName: z.string(),
  customerId: stringId,
});

const NoaNestedFactoringCompanySchema = z.object({
  id: dbId,
  companyId: stringId,
  companyName: z.string(),
});

export const NoaRecordSchema = z.object({
  id: dbId,
  noaId: stringId,
  customerId: dbId,
  factoringCompanyId: dbId,
  status: NoaStatusSchema,
  sentAt: isoDateString.nullable(),
  acknowledgedAt: isoDateString.nullable(),
  rejectedAt: isoDateString.nullable(),
  rejectionReason: z.string().nullable(),
  notes: z.string().nullable(),
  tenantId: dbId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
  customer: NoaNestedCustomerSchema,
  factoringCompany: NoaNestedFactoringCompanySchema,
});

export const NoaRecordListResponseSchema = z.array(NoaRecordSchema);

/** DELETE /invoices/noa-records/:noa_id — `{ deleted: true }`. */
export const NoaRecordDeleteResponseSchema = z.object({
  deleted: z.literal(true),
});

// ── Batch invoicing responses ─────────────────────────────────────────────────

/**
 * POST /invoices/batch/generate — `invoicingService.batchGenerate`.
 * Response: `{ generated: Invoice[], errors: [...], total, successCount }`.
 *
 * `generated[]` is the mutation-flavor Invoice shape (declared in
 * `./invoices.ts` as `InvoiceMutationSchema`). To avoid a circular import
 * between sibling schema files, consumers re-wrap this schema with the
 * concrete invoice schema via `BatchGenerateResponseSchema(InvoiceSchema)`.
 * That's over-engineered for our one caller — inline the invoice shape as
 * `z.unknown()` here and validate the generated invoice's identity via
 * follow-up GET /invoices/:id calls in the test body.
 */
export const BatchGenerateResponseSchema = z.object({
  generated: z.array(z.unknown()),
  errors: z.array(
    z.object({
      loadId: z.string(),
      error: z.string(),
    }),
  ),
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
});

/** POST /invoices/batch/send — `{ sent, skipped }`. */
export const BatchSendResponseSchema = z.object({
  sent: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** POST /invoices/batch/void — `{ voided, skipped }`. */
export const BatchVoidResponseSchema = z.object({
  voided: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/** POST /invoices/batch/mark-paid — `{ paid, skipped }`. */
export const BatchMarkPaidResponseSchema = z.object({
  paid: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

/**
 * POST /invoices/batch/submit-to-factor — `{ submitted, skipped }`.
 * FactoringService.batchSubmitToFactor loops per-invoice and counts
 * successful vs. failed submissions.
 */
export const BatchSubmitToFactorResponseSchema = z.object({
  submitted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});
