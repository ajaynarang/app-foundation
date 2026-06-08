import { unique } from './common.js';

// ── Close-out factories (Phase 2 Group 2a) ────────────────────────────────────

/**
 * Build the body for POST /close-out/:loadId/approve.
 *
 * `overrideReason` is optional but, when present, must be 10..2000 chars per
 * `ApproveForBillingDto`. Omit to approve without override (only valid when
 * readiness score is 100). Provide a reason to approve despite a sub-100
 * readiness score — requires the tenant's `allowBillingOverride` flag to be
 * true (see FleetOperationsSettings).
 */
export function buildApproveForBilling(overrides: Partial<{ overrideReason: string }> = {}): {
  overrideReason?: string;
} {
  return { ...overrides };
}

/**
 * Build the body for POST /close-out/:loadId/send-back.
 *
 * `reason` is required and must be 5..2000 chars per `SendBackDto`. Default
 * is a QA-labelled sentence well within range.
 */
export function buildSendBackPayload(overrides: Partial<{ reason: string }> = {}): { reason: string } {
  return {
    reason: `QA send-back: returning load for charge review (${unique('sb')})`,
    ...overrides,
  };
}

// ── Invoicing factories (Phase 2 Group 2b) ────────────────────────────────────
//
// Reconciled against `apps/backend/src/domains/financials/invoicing/dto/`:
//   - create-invoice.dto.ts → CreateInvoiceDto, CreateInvoiceLineItemDto,
//                             RecordPaymentDto, UpdateInvoiceDto
//   - invoice-settings.dto.ts → UpdateInvoiceSettingsDto
//   - submit-to-factor.dto.ts → SubmitToFactorDto
//
// Backend enforces `whitelist: true, forbidNonWhitelisted: true` — factories
// must NOT emit unknown keys.

/** One `CreateInvoiceLineItemDto` row — the unit that makes up `lineItems[]`. */
export type InvoiceLineItemType =
  | 'LINEHAUL'
  | 'FUEL_SURCHARGE'
  | 'DETENTION_PICKUP'
  | 'DETENTION_DELIVERY'
  | 'LAYOVER'
  | 'LUMPER'
  | 'TONU'
  | 'ACCESSORIAL'
  | 'ADJUSTMENT';

export interface InvoiceLineItemPayload {
  type: InvoiceLineItemType;
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function buildInvoiceLineItem(overrides: Partial<InvoiceLineItemPayload> = {}): InvoiceLineItemPayload {
  return {
    type: 'LINEHAUL',
    description: `QA line item ${unique('LI')}`,
    quantity: 1,
    unitPriceCents: 250000,
    ...overrides,
  };
}

/**
 * POST /invoices body — CreateInvoiceDto. Note: the controller currently
 * forwards to `invoicingService.generateFromLoad(loadId, …)`, so most
 * CreateInvoiceDto fields beyond `loadId`, `paymentTermsDays`, `notes`,
 * `internalNotes` are inert server-side today. Factory emits the DTO shape
 * verbatim so future controller changes to honour `lineItems` don't require
 * a factory update.
 */
export interface CreateInvoicePayload {
  loadId: string;
  paymentTermsDays?: number;
  notes?: string;
  internalNotes?: string;
  lineItems?: InvoiceLineItemPayload[];
}

export function buildInvoicePayload(
  loadId: string,
  overrides: Partial<Omit<CreateInvoicePayload, 'loadId'>> = {},
): CreateInvoicePayload {
  return {
    loadId,
    paymentTermsDays: 30,
    notes: `QA invoice ${unique('INV')}`,
    ...overrides,
  };
}

/** PATCH /invoices/:id body — UpdateInvoiceDto. All fields optional. */
export interface UpdateInvoicePayload {
  paymentTermsDays?: number;
  notes?: string;
  internalNotes?: string;
  adjustmentCents?: number;
  lineItems?: InvoiceLineItemPayload[];
}

export function buildInvoiceUpdate(overrides: UpdateInvoicePayload = {}): UpdateInvoicePayload {
  return { ...overrides };
}

/**
 * POST /invoices/:id/payments body — RecordPaymentDto.
 *
 * NOTE: the live backend DTO uses `amountCents` (not `amount`),
 * `paymentMethod` (not `method`), and requires `paymentDate` (ISO date
 * YYYY-MM-DD). This rewrites the pre-Phase-2 `buildPayment` stub. The old
 * shape (dollars + `method`) is gone — no callers in-repo reference it
 * after Phase 2 Group 2b.
 */
export interface RecordPaymentPayload {
  amountCents: number;
  paymentMethod?: string;
  referenceNumber?: string;
  paymentDate: string;
  notes?: string;
}

export function buildPayment(overrides: Partial<RecordPaymentPayload> = {}): RecordPaymentPayload {
  return {
    amountCents: 250000,
    paymentMethod: 'ACH',
    referenceNumber: unique('PAY'),
    paymentDate: new Date().toISOString().split('T')[0],
    ...overrides,
  };
}

/**
 * PATCH /invoices/settings body — UpdateInvoiceSettingsDto. All fields
 * optional (partial update; backend upserts).
 */
export interface InvoiceSettingsUpdatePayload {
  companyLegalName?: string;
  logoUrl?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  email?: string;
  mcNumber?: string;
  dotNumber?: string;
  defaultPaymentTermsDays?: number;
  remittanceInstructions?: string;
  acceptedPaymentMethods?: string;
  defaultNotes?: string;
  termsAndConditions?: string;
  invoicePrefix?: string;
  replyToEmail?: string;
  emailSubjectTemplate?: string;
  emailBodyTemplate?: string;
}

export function buildInvoiceSettingsUpdate(overrides: InvoiceSettingsUpdatePayload = {}): InvoiceSettingsUpdatePayload {
  return { ...overrides };
}

/**
 * POST /invoices/:id/send body. Controller accepts `{ sendEmail?: boolean }`
 * — when true the email service is invoked in addition to the status
 * transition. Factory emits nothing by default (transition only).
 */
export interface SendInvoicePayload {
  sendEmail?: boolean;
}

export function buildSendInvoicePayload(overrides: SendInvoicePayload = {}): SendInvoicePayload {
  return { ...overrides };
}

/**
 * POST /invoices/:id/share body. Backend's `InvoiceShareService.createShareLink`
 * takes no input — the entire body is ignored. Factory emits an empty object
 * for symmetry with other POST factories.
 */
export function buildShareLinkRequest(overrides: Record<string, never> = {}): Record<string, never> {
  return { ...overrides };
}

/**
 * POST /invoices/:id/submit-to-factor body — SubmitToFactorDto.
 * `factoringCompanyId` is the string public id of a FactoringCompany row.
 * `sendEmail` defaults to `true` server-side when omitted.
 */
export interface SubmitToFactorPayload {
  factoringCompanyId: string;
  factoringReference?: string;
  sendEmail?: boolean;
}

export function buildSubmitToFactorPayload(
  factoringCompanyId: string,
  overrides: Partial<Omit<SubmitToFactorPayload, 'factoringCompanyId'>> = {},
): SubmitToFactorPayload {
  return {
    factoringCompanyId,
    ...overrides,
  };
}

// ── Batch invoicing factories (Phase 2 Group 2c) ──────────────────────────────
//
// Reconciled against `apps/backend/.../invoicing/dto/batch-invoice.dto.ts` and
// the controller signatures on `InvoicingController` (lines 180-260 +
// 403-438). Backend enforces `whitelist + forbidNonWhitelisted`, so factories
// emit exactly the DTO shape — no extra keys.
//
// Every request is a straight object assembly; no randomness is injected
// because the caller already owns the (freshly created) invoiceIds/loadIds
// it passes in. Factories exist so the spec never embeds inline JSON.

/**
 * POST /invoices/batch/generate body — BatchGenerateDto.
 * Max 50 loadIds per request (backend `@ArrayMaxSize(50)`).
 */
export interface BatchGenerateRequest {
  loadIds: string[];
  paymentTermsDays?: number;
}

export function buildBatchGenerateRequest(
  loadIds: string[],
  overrides: Partial<Omit<BatchGenerateRequest, 'loadIds'>> = {},
): BatchGenerateRequest {
  return { loadIds, ...overrides };
}

/**
 * POST /invoices/batch/send body — BatchActionDto plus an optional
 * `sendEmail` flag. The controller destructures `sendEmail` but the service
 * ignores it today; factory still allows overriding so a future service
 * change is covered without a factory update.
 */
export interface BatchSendRequest {
  invoiceIds: string[];
  sendEmail?: boolean;
}

export function buildBatchSendRequest(
  invoiceIds: string[],
  overrides: Partial<Omit<BatchSendRequest, 'invoiceIds'>> = {},
): BatchSendRequest {
  return { invoiceIds, ...overrides };
}

/** POST /invoices/batch/void body — bare BatchActionDto. */
export interface BatchVoidRequest {
  invoiceIds: string[];
}

export function buildBatchVoidRequest(invoiceIds: string[]): BatchVoidRequest {
  return { invoiceIds };
}

/**
 * POST /invoices/batch/mark-paid body — BatchMarkPaidDto.
 *
 * DTO note: the spec document calls the date field `paidAt`, but the live
 * DTO (see `batch-invoice.dto.ts`) uses `paymentDate` (@IsDateString) plus
 * an optional `paymentMethod`. Factory emits what the backend accepts;
 * caller-visible name stays `paymentDate` to avoid a translation layer.
 */
export interface BatchMarkPaidRequest {
  invoiceIds: string[];
  paymentDate: string;
  paymentMethod?: string;
}

export function buildBatchMarkPaidRequest(
  invoiceIds: string[],
  overrides: Partial<Omit<BatchMarkPaidRequest, 'invoiceIds'>> = {},
): BatchMarkPaidRequest {
  return {
    invoiceIds,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: 'ACH',
    ...overrides,
  };
}

/** POST /invoices/batch/download body — bare BatchActionDto. Response is ZIP. */
export interface BatchDownloadRequest {
  invoiceIds: string[];
}

export function buildBatchDownloadRequest(invoiceIds: string[]): BatchDownloadRequest {
  return { invoiceIds };
}

/**
 * POST /invoices/batch/submit-to-factor body — the controller inlines the
 * body type (no dedicated DTO class); shape mirrors `SubmitToFactorDto` with
 * an `invoiceIds[]` prefix.
 */
export interface BatchSubmitToFactorRequest {
  invoiceIds: string[];
  factoringCompanyId: string;
  factoringReference?: string;
  sendEmail?: boolean;
}

export function buildBatchSubmitToFactorRequest(
  invoiceIds: string[],
  factoringCompanyId: string,
  overrides: Partial<Omit<BatchSubmitToFactorRequest, 'invoiceIds' | 'factoringCompanyId'>> = {},
): BatchSubmitToFactorRequest {
  return { invoiceIds, factoringCompanyId, ...overrides };
}

// ── Factoring CRUD factories (Phase 2 Group 2c) ───────────────────────────────

/**
 * POST /invoices/factoring-companies body — `CreateFactoringCompanyDto`.
 *
 * Required: `companyName`. Every other field is optional; the factory emits
 * a small-but-realistic set so the create response exercises non-null
 * branches (advance rate, fee rate, recourse type, remittance address).
 *
 * Tenant-default pin/unpin lives on a separate endpoint —
 * `PATCH /tenants/me/factoring-default`. Factoring company create/update
 * payloads no longer carry an isDefault flag (Phase 1 overhaul, 2026-04-28).
 */
export interface FactoringCompanyPayload {
  companyName: string;
  contactEmail?: string;
  contactPhone?: string;
  remittanceAddress?: string;
  submissionEmail?: string;
  advanceRatePct?: number;
  feeRatePct?: number;
  recourseType?: 'RECOURSE' | 'NON_RECOURSE';
  notes?: string;
  website?: string;
  remittanceCity?: string;
  remittanceState?: string;
  remittanceZip?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export function buildFactoringCompany(overrides: Partial<FactoringCompanyPayload> = {}): FactoringCompanyPayload {
  const suffix = unique('FC');
  return {
    companyName: `QA Factoring ${suffix}`,
    contactEmail: `billing+${suffix.toLowerCase()}@qa.example.com`,
    contactPhone: '+15555550100',
    remittanceAddress: '123 QA Remit Lane',
    submissionEmail: `submissions+${suffix.toLowerCase()}@qa.example.com`,
    advanceRatePct: 90,
    feeRatePct: 3,
    recourseType: 'RECOURSE',
    notes: `QA-seeded factoring row ${suffix}`,
    ...overrides,
  };
}

/** Partial update body for PATCH /invoices/factoring-companies/:company_id. */
export interface FactoringCompanyUpdatePayload {
  companyName?: string;
  contactEmail?: string;
  contactPhone?: string;
  remittanceAddress?: string;
  submissionEmail?: string;
  advanceRatePct?: number;
  feeRatePct?: number;
  recourseType?: 'RECOURSE' | 'NON_RECOURSE';
  notes?: string;
  website?: string;
  remittanceCity?: string;
  remittanceState?: string;
  remittanceZip?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}

export function buildFactoringCompanyUpdate(
  overrides: FactoringCompanyUpdatePayload = {},
): FactoringCompanyUpdatePayload {
  return { ...overrides };
}

/**
 * POST /invoices/factoring-companies/:companyId/contacts body —
 * `CreateFactoringContactDto`. First/last name required; role enum values
 * live on the Prisma `FactoringContactRole` enum.
 */
export type FactoringContactRoleName = 'PRIMARY' | 'SUBMISSIONS' | 'COLLECTIONS' | 'NOA' | 'OTHER';

export interface FactoringContactPayload {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: FactoringContactRoleName;
  isPrimary?: boolean;
  title?: string;
  notes?: string;
}

export function buildFactoringContact(overrides: Partial<FactoringContactPayload> = {}): FactoringContactPayload {
  const suffix = unique('FCT');
  return {
    firstName: 'QA',
    lastName: `Contact-${suffix}`,
    email: `contact+${suffix.toLowerCase()}@qa.example.com`,
    phone: '+15555550101',
    role: 'SUBMISSIONS',
    isPrimary: false,
    title: 'Accounts Receivable',
    ...overrides,
  };
}

/** POST /invoices/noa-records body — `CreateNoaRecordDto`. */
export interface NoaRecordPayload {
  customerId: number;
  factoringCompanyId: number;
  notes?: string;
}

export function buildNoaRecord(
  customerId: number,
  factoringCompanyId: number,
  overrides: Partial<Omit<NoaRecordPayload, 'customerId' | 'factoringCompanyId'>> = {},
): NoaRecordPayload {
  return {
    customerId,
    factoringCompanyId,
    notes: `QA NOA ${unique('NOA')}`,
    ...overrides,
  };
}

/**
 * PATCH /invoices/noa-records/:noa_id/status body — `UpdateNoaStatusDto`.
 * The service enforces a state machine (NOT_SENT → SENT → ACKNOWLEDGED
 * or REJECTED; REJECTED → SENT). Factory emits the requested status
 * verbatim so tests can drive each leg.
 */
export interface NoaStatusUpdatePayload {
  status: 'NOT_SENT' | 'SENT' | 'ACKNOWLEDGED' | 'REJECTED';
  rejectionReason?: string;
}

export function buildNoaStatusUpdate(
  status: NoaStatusUpdatePayload['status'],
  overrides: Partial<Omit<NoaStatusUpdatePayload, 'status'>> = {},
): NoaStatusUpdatePayload {
  return { status, ...overrides };
}

// ── Settlement factories (Phase 2 Group 2e) ───────────────────────────────────
//
// Reconciled against:
//   - apps/backend/src/domains/financials/settlements/dto/create-settlement.dto.ts
//     → CalculateSettlementDto, AddDeductionDto
//   - apps/backend/src/domains/financials/settlements/dto/batch-settlement.dto.ts
//     → UpdateNotesDto
//   - apps/backend/src/domains/financials/settlements/dto/pay-structure.dto.ts
//     → UpsertPayStructureDto (setup-only, used by helpers)
//
// Backend enforces `whitelist + forbidNonWhitelisted` — factories must NOT
// emit unknown keys. The controller's @Body() DTOs are the contract.

/**
 * POST /settlements/calculate body — `CalculateSettlementDto`.
 *
 * `driverId` is the STRING public id (`DRV-<suffix>`), not the numeric DB
 * id. `periodStart` / `periodEnd` are YYYY-MM-DD date strings (class-validator
 * `@IsDateString` accepts either date-only or full ISO; date-only is what
 * the UI sends and what the service stores via `@db.Date`).
 *
 * Factory defaults: the current Monday..Sunday week. Callers pass explicit
 * period bounds when they need to match a pre-existing DELIVERED load's
 * `deliveredAt` timestamp.
 */
export interface SettlementCalcRequestPayload {
  driverId: string;
  periodStart: string;
  periodEnd: string;
  preview?: boolean;
}

export function buildSettlementCalcRequest(
  driverId: string,
  overrides: Partial<Omit<SettlementCalcRequestPayload, 'driverId'>> = {},
): SettlementCalcRequestPayload {
  // Default to a broad window spanning the last 14 days through tomorrow.
  //
  // Why tomorrow (not today) as the end: the service filters loads via
  // `deliveredAt: { gte: new Date(periodStart), lte: new Date(periodEnd) }`.
  // `new Date('YYYY-MM-DD')` parses as midnight UTC. A load that was
  // DELIVERED seconds before the calc call has `deliveredAt: <now>`, which
  // is AFTER today's midnight UTC — so `lte: today` excludes it. Using
  // `periodEnd = tomorrow` ensures any same-day DELIVERED load lands
  // comfortably inside the window across all timezones.
  //
  // Settlements are date-only entities (`@db.Date`) so widening by one
  // day is harmless — the row persists as YYYY-MM-DD regardless.
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 1);
  const end = endDate.toISOString().split('T')[0];
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 14);
  const start = startDate.toISOString().split('T')[0];

  return {
    driverId,
    periodStart: start,
    periodEnd: end,
    ...overrides,
  };
}

/**
 * POST /settlements/:id/deductions body — `AddDeductionDto`.
 *
 * `type` is a closed enum (see DTO). `amountCents >= 1` required. The
 * service rejects `settlement.status !== 'DRAFT'` so this is only valid on
 * freshly calculated settlements.
 */
export type SettlementDeductionType =
  | 'FUEL_ADVANCE'
  | 'CASH_ADVANCE'
  | 'INSURANCE'
  | 'EQUIPMENT_LEASE'
  | 'ESCROW'
  | 'OTHER';

export interface SettlementDeductionPayload {
  type: SettlementDeductionType;
  description: string;
  amountCents: number;
}

export function buildSettlementDeduction(
  overrides: Partial<SettlementDeductionPayload> = {},
): SettlementDeductionPayload {
  return {
    type: 'FUEL_ADVANCE',
    description: `QA deduction ${unique('DED')}`,
    amountCents: 5000,
    ...overrides,
  };
}

/**
 * PUT /settlements/:id/notes body — `UpdateNotesDto`. Single field, required.
 */
export interface SettlementNotesPayload {
  notes: string;
}

export function buildSettlementNotes(notes?: string): SettlementNotesPayload {
  return {
    notes: notes ?? `QA notes ${unique('NOTE')} — updated settlement memo`,
  };
}

/**
 * POST /settlements/:id/approve body — EMPTY object. The controller takes
 * no DTO (service derives `approvedBy` from `user.userId`). Factory exists
 * for symmetry so tests never inline `{}`.
 */
export function buildApproveSettlement(): Record<string, never> {
  return {};
}

/**
 * POST /settlements/:id/pay body — EMPTY object. Controller has no DTO;
 * service stamps `paidAt: new Date()` server-side. Factory exists for
 * symmetry.
 */
export function buildPaySettlement(): Record<string, never> {
  return {};
}

/**
 * POST /settlements/:id/void body — EMPTY object. Controller has no DTO.
 * Factory exists for symmetry.
 */
export function buildVoidSettlement(): Record<string, never> {
  return {};
}

/**
 * PUT /pay-structures/:driverId body — `UpsertPayStructureDto`.
 *
 * `type` drives which rate field is required (via `@ValidateIf`):
 *   - PER_MILE → ratePerMileCents
 *   - PERCENTAGE → percentage
 *   - FLAT_RATE → flatRateCents
 *   - HYBRID → hybridBaseCents + hybridPercent
 *
 * Settlement setup uses PER_MILE as the default — it's the simplest to
 * reason about (miles × rate = pay) and doesn't require route-plan
 * metadata. Tests override when they need a different branch.
 */
export type PayStructurePayloadType = 'PER_MILE' | 'PERCENTAGE' | 'FLAT_RATE' | 'HYBRID';

export interface PayStructureUpsertPayload {
  type: PayStructurePayloadType;
  ratePerMileCents?: number;
  percentage?: number;
  flatRateCents?: number;
  hybridBaseCents?: number;
  hybridPercent?: number;
  effectiveDate: string;
  notes?: string;
}

export function buildPayStructureUpsert(overrides: Partial<PayStructureUpsertPayload> = {}): PayStructureUpsertPayload {
  const today = new Date();
  // Effective date is in the past so it applies to any DELIVERED load the
  // settlement calc picks up. 30 days ago is comfortably wider than the
  // calc window and also gives the `isActive` + `effectiveFrom` filter
  // something to match.
  today.setDate(today.getDate() - 30);
  const effectiveDate = today.toISOString().split('T')[0];

  const base: PayStructureUpsertPayload = {
    type: 'FLAT_RATE',
    flatRateCents: 50000,
    effectiveDate,
  };
  return { ...base, ...overrides };
}

// ── Settlement batch factories (Phase 2 Group 2f) ─────────────────────────────
//
// Reconciled against `apps/backend/.../settlements/dto/batch-settlement.dto.ts`:
//   - PreviewBatchDto            → { periodStart, periodEnd }
//   - BatchCalculateDto          → { driverIds[1..50], periodStart, periodEnd }
//   - BatchSettlementActionDto   → { settlementIds[1..50] }  (approve/pay/void/pdf)
//
// Backend enforces `whitelist + forbidNonWhitelisted` so factories must NOT
// emit unknown keys. The `BatchSettlementActionDto` shape is intentionally
// a single-field envelope even though the backend later reads
// paymentMethod / paidAt / reason from the *spec document* — the DTO has NO
// such fields. We keep the factory signatures permissive (allow overrides)
// but the default payload is just `{ settlementIds }` so the request passes
// the strict `forbidNonWhitelisted` gate.

/**
 * POST /settlements/preview-batch body — `PreviewBatchDto`. No driver
 * filtering on the DTO today (service iterates the entire ACTIVE +
 * PENDING_ACTIVATION driver pool on the tenant). We keep an `overrides`
 * bag for future DTO growth but the default is the bare period.
 */
export interface PreviewBatchRequest {
  periodStart: string;
  periodEnd: string;
}

export function buildPreviewBatchRequest(
  periodStart: string,
  periodEnd: string,
  overrides: Partial<PreviewBatchRequest> = {},
): PreviewBatchRequest {
  return { periodStart, periodEnd, ...overrides };
}

/**
 * POST /settlements/batch-calculate body — `BatchCalculateDto`. `driverIds`
 * must be 1..50 strings (class-validator `@ArrayMinSize(1) @ArrayMaxSize(50)`)
 * and each must be a public `DRV-` id.
 */
export interface BatchCalculateRequest {
  driverIds: string[];
  periodStart: string;
  periodEnd: string;
}

export function buildBatchCalculateRequest(
  periodStart: string,
  periodEnd: string,
  overrides: { driverIds?: string[] } & Partial<Omit<BatchCalculateRequest, 'periodStart' | 'periodEnd'>> = {},
): BatchCalculateRequest {
  return {
    driverIds: overrides.driverIds ?? [],
    periodStart,
    periodEnd,
  };
}

/**
 * POST /settlements/batch-approve body — `BatchSettlementActionDto`. The
 * DTO is a single `settlementIds[]` field; service fans out the approve
 * transition as a single `updateMany(where status='DRAFT')` (see
 * finding #21 — the backend currently drops `approvedBy` on the floor
 * when `user.userId` is passed as a string into an Int column, so the
 * happy path on `batch-approve` is blocked on demo until that lands).
 */
export interface BatchSettlementActionRequest {
  settlementIds: string[];
}

export function buildBatchApproveRequest(settlementIds: string[]): BatchSettlementActionRequest {
  return { settlementIds };
}

/**
 * POST /settlements/batch-pay body — `BatchSettlementActionDto`. No DTO
 * fields for `paymentMethod` / `paidAt` — the service stamps `paidAt`
 * server-side and has no paymentMethod concept on settlements (unlike
 * invoices). The options bag is accepted so callers can express intent
 * without breaking the `whitelist + forbidNonWhitelisted` contract;
 * unknown overrides are silently dropped before serialization. Keeping
 * the signature here matches the spec's call shape.
 */
export function buildBatchPayRequest(
  settlementIds: string[],
  _options: { paymentMethod?: string; paidAt?: string } = {},
): BatchSettlementActionRequest {
  // `_options` is intentionally not forwarded — the DTO rejects unknown
  // keys. See docstring.
  return { settlementIds };
}

/**
 * POST /settlements/batch-void body — `BatchSettlementActionDto`. The
 * service filters to `status NOT IN (VOID, PAID)` and hard-flips each
 * remaining row to VOID in a single `updateMany`. No `reason` column on
 * the Settlement model today — the options bag is accepted for symmetry
 * with the invoices batch APIs but the field is not forwarded.
 *
 * Name note: Invoices Group 2c already exports `buildBatchVoidRequest` on
 * this module (invoice-scoped, `{ invoiceIds }`). Settlement batch-void
 * uses a distinct name to avoid clobbering that export.
 */
export function buildBatchVoidSettlementsRequest(
  settlementIds: string[],
  _options: { reason?: string } = {},
): BatchSettlementActionRequest {
  return { settlementIds };
}

/**
 * POST /settlements/batch-pdf body — `BatchSettlementActionDto`. Response
 * is `application/zip`, not JSON (see controller `batchDownloadPdf`).
 */
export function buildBatchPdfRequest(settlementIds: string[]): BatchSettlementActionRequest {
  return { settlementIds };
}
