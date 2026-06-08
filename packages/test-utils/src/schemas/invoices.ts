/**
 * API Contracts for Invoice endpoints (Phase 2 Group 2b).
 *
 * Backend controller:
 *   apps/backend/src/domains/financials/invoicing/controllers/invoicing.controller.ts
 *
 * Services (source of truth for response shapes):
 *   apps/backend/src/domains/financials/invoicing/services/
 *     - invoicing.service.ts            → list, findOne, generate, update,
 *                                         markSent, voidInvoice, reInvoice,
 *                                         getSummary, getCustomerPaymentStats
 *     - invoice-settings.service.ts     → getSettings, updateSettings
 *     - invoice-share.service.ts        → createShareLink
 *     - invoice-email.service.ts        → buildEmailContent, sendInvoice
 *     - doc-bundle.service.ts           → getDocumentList
 *     - factoring.service.ts            → submitToFactor
 *
 * Schema strategy:
 *   - `InvoiceListItemSchema`, `InvoiceDetailSchema`, `InvoiceMutationSchema`
 *     are hand-written here because the backend emits three distinct shapes
 *     depending on endpoint (different Prisma `include` blocks per call
 *     site). Shared-types `InvoiceSchema` covers only the list-item flavor
 *     and over-specifies the `customer` nested object (Phase 2 SCHEMA-AUDIT
 *     documented this drift).
 *   - `customer` and `load` nested objects are modelled as `z.unknown()` —
 *     the relation shape is not what we're validating here; the invoice's
 *     own field set is.
 *   - No `.passthrough()` anywhere. Every top-level key is declared; unknown
 *     top-level keys fail strict parse and surface as documented schema
 *     drift.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ─── Enums (mirror Prisma) ────────────────────────────────────────────────────

export const InvoiceStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIAL',
  'PAID',
  'OVERDUE',
  'VOID',
  'FACTORED',
  'RECOURSED',
]);

export const LineItemTypeSchema = z.enum([
  'LINEHAUL',
  'FUEL_SURCHARGE',
  'DETENTION_PICKUP',
  'DETENTION_DELIVERY',
  'LAYOVER',
  'LUMPER',
  'TONU',
  'ACCESSORIAL',
  'ADJUSTMENT',
]);

export const BillingPathSchema = z.enum(['FACTORED', 'DIRECT', 'AMAZON']);

// ─── Line items + payments (embedded) ─────────────────────────────────────────

/**
 * Prisma `InvoiceLineItem` row shape as emitted by InvoicingService includes.
 *
 * Drift note: the Prisma model has NO `createdAt`/`updatedAt` timestamps
 * (verified against `schema.prisma` lines 2958-2972). Every other row does,
 * but line items are audit-silent.
 */
export const InvoiceLineItemRowSchema = z.object({
  id: dbId,
  invoiceId: dbId,
  type: LineItemTypeSchema,
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
  sequenceOrder: z.number().int(),
});

/**
 * Prisma `Payment` row shape emitted under `invoice.payments` in findOne.
 *
 * Drift note: `paymentDate` is @db.Date → YYYY-MM-DD after
 * `serializeDateFields` on the findOne path. The Prisma model has
 * `createdAt` but NOT `updatedAt` (verified against schema.prisma lines
 * 2974-2999). `createdBy` is a nullable FK.
 */
export const InvoicePaymentRowSchema = z.object({
  id: dbId,
  paymentId: stringId,
  invoiceId: dbId,
  tenantId: dbId,
  amountCents: z.number().int(),
  paymentMethod: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(), // YYYY-MM-DD after serializeDateFields
  notes: z.string().nullable(),
  externalPaymentId: z.string().nullable(),
  externalSyncedAt: isoDateString.nullable(),
  createdBy: dbId.nullable(),
  createdAt: isoDateString,
});

// ─── Invoice core ─────────────────────────────────────────────────────────────

/**
 * The superset of fields that every Prisma `Invoice` row carries on the wire
 * after `serializeDateFields`. Used as the base for the three flavor-schemas
 * below.
 *
 * Drift note: `externalSyncedAt`, `externalSyncError`, `externalSyncVersion`,
 * `submittedToFactorAt` are nullable timestamps emitted verbatim from Prisma
 * (verified against `schema.prisma` lines 2898-2956). `paidDate` is @db.Date
 * — YYYY-MM-DD string when set, null otherwise. `createdBy` is a nullable
 * FK to User. There are NO `quickbooks*` columns on Invoice today.
 */
const InvoiceBaseShape = {
  id: dbId,
  invoiceNumber: z.string(),
  status: InvoiceStatusSchema,
  billingPath: BillingPathSchema,
  customerId: dbId,
  loadId: dbId,
  tenantId: dbId,
  subtotalCents: z.number().int(),
  adjustmentCents: z.number().int(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceCents: z.number().int(),
  issueDate: z.string(), // YYYY-MM-DD after serializeDateFields
  dueDate: z.string(), // YYYY-MM-DD after serializeDateFields
  paidDate: z.string().nullable(), // YYYY-MM-DD | null
  paymentTermsDays: z.number().int(),
  notes: z.string().nullable(),
  internalNotes: z.string().nullable(),
  externalInvoiceId: z.string().nullable(),
  externalSyncVersion: z.string().nullable(),
  externalSyncedAt: isoDateString.nullable(),
  externalSyncError: z.string().nullable(),
  factoringCompanyId: dbId.nullable(),
  factoringReference: z.string().nullable(),
  submittedToFactorAt: isoDateString.nullable(),
  createdBy: dbId.nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
} as const;

/**
 * GET /invoices — list-item flavor. Service `findAll` include:
 *   `{ customer: true, load: { loadNumber, loadId }, lineItems: true,
 *      factoringCompanyRel: true }`
 *
 * Nested `customer` / `load` / `factoringCompanyRel` are modelled as
 * `z.unknown()` — the list endpoint is not the contract for those relations.
 */
export const InvoiceListItemSchema = z.object({
  ...InvoiceBaseShape,
  customer: z.unknown().nullable(),
  load: z.unknown().nullable(),
  lineItems: z.array(InvoiceLineItemRowSchema),
  factoringCompanyRel: z.unknown().nullable(),
});

/**
 * GET /invoices — list response. Service returns a raw array (no envelope).
 */
export const InvoiceListResponseSchema = z.array(InvoiceListItemSchema);

/**
 * GET /invoices/:id — detail flavor. Service `findOne` include:
 *   `{ customer: true, load: { stops: { stop: true } }, lineItems, payments }`
 */
export const InvoiceDetailSchema = z.object({
  ...InvoiceBaseShape,
  customer: z.unknown().nullable(),
  load: z.unknown().nullable(),
  lineItems: z.array(InvoiceLineItemRowSchema),
  payments: z.array(InvoicePaymentRowSchema),
});

/**
 * POST /invoices/generate/:load_id, POST /invoices, POST /invoices/:id/reinvoice,
 * PATCH /invoices/:id, POST /invoices/:id/send, POST /invoices/:id/void —
 * mutation flavor. Service includes:
 *   `{ lineItems, customer, load }` (no payments).
 *
 * Shape is the base invoice fields + lineItems + nested customer + nested load.
 */
export const InvoiceMutationSchema = z.object({
  ...InvoiceBaseShape,
  customer: z.unknown().nullable(),
  load: z.unknown().nullable(),
  lineItems: z.array(InvoiceLineItemRowSchema),
});

// ─── Summary / stats ──────────────────────────────────────────────────────────

export const AgingBucketSchema = z.object({
  amountCents: z.number(),
  count: z.number().int().nonnegative(),
});

/**
 * GET /invoices/summary — AR aging envelope. Service returns:
 *   { outstandingCents, overdueCents, dueThisWeekCents, dueThisWeekCount,
 *     paidThisMonthCents, draftCount, readyToInvoiceCount, factoredCents,
 *     factoredCount, factoredInvoicesCents, factoredInvoicesCount,
 *     directInvoicesCents, directInvoicesCount,
 *     aging: { current, days1_30, days31_60, days61_90, daysOver90 } }
 *
 * Drift note: shared-types `InvoiceSummarySchema` uses camelCase bucket keys
 * (`days1To30`) — the actual backend emits snake_case-style (`days1_30`).
 * Hand-written here to match the live service, not the drifted spec.
 */
export const InvoiceSummaryResponseSchema = z.object({
  outstandingCents: z.number(),
  overdueCents: z.number(),
  dueThisWeekCents: z.number(),
  dueThisWeekCount: z.number().int().nonnegative(),
  paidThisMonthCents: z.number(),
  draftCount: z.number().int().nonnegative(),
  readyToInvoiceCount: z.number().int().nonnegative(),
  factoredCents: z.number(),
  factoredCount: z.number().int().nonnegative(),
  factoredInvoicesCents: z.number(),
  factoredInvoicesCount: z.number().int().nonnegative(),
  directInvoicesCents: z.number(),
  directInvoicesCount: z.number().int().nonnegative(),
  aging: z.object({
    current: AgingBucketSchema,
    days1_30: AgingBucketSchema,
    days31_60: AgingBucketSchema,
    days61_90: AgingBucketSchema,
    daysOver90: AgingBucketSchema,
  }),
});

/**
 * GET /invoices/customers/:customer_id/payment-stats — two shapes depending
 * on whether the customer has paid any invoices. The service returns either
 *
 *   `{ hasHistory: false }`
 *
 * or
 *
 *   `{ hasHistory: true, avgDaysToPay, reliability, reliabilityLabel,
 *      totalInvoicesPaid, outstandingCents, outstandingCount }`
 *
 * Modelled as a discriminated union on `hasHistory`.
 */
export const PaymentStatsResponseSchema = z.discriminatedUnion('hasHistory', [
  z.object({ hasHistory: z.literal(false) }),
  z.object({
    hasHistory: z.literal(true),
    avgDaysToPay: z.number().int(),
    reliability: z.enum(['Excellent', 'Good', 'Average', 'Slow']),
    reliabilityLabel: z.string(),
    totalInvoicesPaid: z.number().int().nonnegative(),
    outstandingCents: z.number(),
    outstandingCount: z.number().int().nonnegative(),
  }),
]);

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * GET/PATCH /invoices/settings — InvoiceSettingsService.formatResponse shape.
 * Every field nullable because first-fetch auto-creates a row with mostly
 * nulls derived from the Tenant record.
 */
export const InvoiceSettingsResponseSchema = z.object({
  companyLegalName: z.string().nullable(),
  logoUrl: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  mcNumber: z.string().nullable(),
  dotNumber: z.string().nullable(),
  defaultPaymentTermsDays: z.number().int().nullable(),
  remittanceInstructions: z.string().nullable(),
  acceptedPaymentMethods: z.string().nullable(),
  defaultNotes: z.string().nullable(),
  termsAndConditions: z.string().nullable(),
  invoicePrefix: z.string().nullable(),
  replyToEmail: z.string().nullable(),
  emailSubjectTemplate: z.string().nullable(),
  emailBodyTemplate: z.string().nullable(),
});

// ─── Payment recording ────────────────────────────────────────────────────────

/**
 * POST /invoices/:id/payments — Payment row. PaymentsService returns the raw
 * Payment Prisma row. Hand-written — shared-types has no schema for this
 * endpoint's response envelope.
 *
 * Drift note: `paymentDate` is @db.Date and arrives as an ISO datetime string
 * (not date-only like the findOne projection) because `PaymentsService` does
 * not apply `serializeDateFields`. No `updatedAt` on the Prisma model.
 */
export const RecordPaymentResponseSchema = z.object({
  id: dbId,
  paymentId: stringId,
  invoiceId: dbId,
  tenantId: dbId,
  amountCents: z.number().int(),
  paymentMethod: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  paymentDate: z.string(),
  notes: z.string().nullable(),
  externalPaymentId: z.string().nullable(),
  externalSyncedAt: isoDateString.nullable(),
  createdBy: dbId.nullable(),
  createdAt: isoDateString,
});

// ─── Email preview / send ─────────────────────────────────────────────────────

/**
 * GET /invoices/:id/email-preview — `InvoiceEmailService.buildEmailContent`
 * envelope. Drift from shared-types: `replyTo` added (was missing).
 */
export const EmailPreviewResponseSchema = z.object({
  to: z.string().nullable(),
  replyTo: z.string().nullable(),
  subject: z.string(),
  bodyHtml: z.string(),
  hasPdfAttachment: z.boolean(),
  invoiceNumber: z.string(),
});

/**
 * POST /invoices/:id/resend — `InvoiceEmailService.sendInvoice` response.
 * Shape: `{ sent: true, to: string, invoiceNumber: string }`.
 */
export const SendInvoiceResponseSchema = z.object({
  sent: z.literal(true),
  to: z.string(),
  invoiceNumber: z.string(),
});

// ─── Share link ───────────────────────────────────────────────────────────────

/**
 * POST /invoices/:id/share — `InvoiceShareService.createShareLink`.
 * Service returns `{ url, token, expiresAt }` (NOT `shareUrl` — drift from
 * the plan doc; the service method literally names the field `url`).
 */
export const ShareLinkResponseSchema = z.object({
  url: z.string().url(),
  token: z.string().min(16),
  expiresAt: isoDateString,
});

// ─── Public invoice view ──────────────────────────────────────────────────────

/**
 * Embedded line-item row in the public invoice envelope. `InvoiceShareService.
 * getInvoiceByToken` projects only the customer-safe subset of fields (no
 * `id`, no `invoiceId`, no `sequenceOrder`) — the public contract deliberately
 * hides primary keys.
 */
export const PublicInvoiceLineItemSchema = z.object({
  type: LineItemTypeSchema,
  description: z.string(),
  quantity: z.number(),
  unitPriceCents: z.number().int(),
  totalCents: z.number().int(),
});

/**
 * GET /invoices/public/:token — `InvoiceShareService.getInvoiceByToken`.
 *
 * Response shape (camelCase — the prompt suggesting snake_case was
 * incorrect; verified against `invoice-share.service.ts` lines 96-115). The
 * service hand-builds the envelope with explicit keys, so the set is closed
 * and `strict()` mode is safe.
 *
 * Drift note: unlike the authenticated `findOne` path, the public service
 * does NOT call `serializeDateFields`. `issueDate` / `dueDate` are Prisma
 * `@db.Date` values emitted by `res.json()` as full ISO datetime strings
 * (e.g. `"2026-04-18T00:00:00.000Z"`), not YYYY-MM-DD. Both formats pass
 * `isoDateString` parsing (`Date.parse` accepts both) — using `isoDateString`
 * here to tolerate a future `serializeDateFields` migration without a
 * schema churn.
 */
export const PublicInvoiceSchema = z.object({
  invoiceNumber: z.string(),
  status: InvoiceStatusSchema,
  customerName: z.string(),
  issueDate: isoDateString,
  dueDate: isoDateString,
  subtotalCents: z.number().int(),
  adjustmentCents: z.number().int(),
  totalCents: z.number().int(),
  paidCents: z.number().int(),
  balanceCents: z.number().int(),
  paymentTermsDays: z.number().int(),
  lineItems: z.array(PublicInvoiceLineItemSchema),
});

// ─── Doc bundle ───────────────────────────────────────────────────────────────

/**
 * One document row from `Document` table, as emitted by DocBundleService.
 * Projection is the raw Prisma row (no formatter) — narrow to the subset
 * used in test assertions.
 */
const DocBundleDocumentSchema = z.object({
  id: dbId,
  documentId: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  documentType: z.string(),
  fileName: z.string(),
  status: z.string(),
  tenantId: dbId,
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

/**
 * GET /invoices/:id/doc-bundle — document list envelope.
 *   `{ documents: Document[], missing: string[], invoiceNumber, loadId }`
 *
 * `documents[]` may be empty on a fresh tenant (no BOL/POD/RATE_CON uploads).
 * Use `z.unknown()` for the element so we tolerate any shape the Prisma
 * `Document` row emits — we verify the envelope, not the per-doc contract.
 */
export const DocBundleListResponseSchema = z.object({
  documents: z.array(DocBundleDocumentSchema.or(z.unknown())),
  missing: z.array(z.string()),
  invoiceNumber: z.string(),
  loadId: dbId,
});

// ─── Submit to factor / factor (legacy) ───────────────────────────────────────

/**
 * POST /invoices/:id/submit-to-factor — `FactoringService.submitToFactor`.
 * Response: `{ invoice: InvoiceWithRels, noaWarning: string | null }`.
 * `invoice` matches the mutation flavor (lineItems + customer + load).
 */
export const SubmitToFactorResponseSchema = z.object({
  invoice: InvoiceMutationSchema,
  noaWarning: z.string().nullable(),
});
