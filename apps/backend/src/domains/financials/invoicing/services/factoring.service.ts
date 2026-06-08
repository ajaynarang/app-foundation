import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { NoaService } from './noa.service';
import { InvoiceEmailService } from './invoice-email.service';
import { DocBundleService } from './doc-bundle.service';
import { randomUUID } from 'crypto';
import type { RecourseType } from '@prisma/client';
import type { DocBundleDocType, RecordFactoringTransactionInput } from '@sally/shared-types';

// Per-type input types extracted from the discriminated union — used to type
// each public record* method without requiring the discriminator twice.
type RecordAdvanceInput = Extract<RecordFactoringTransactionInput, { type: 'ADVANCE' }>;
type RecordFeeInput = Extract<RecordFactoringTransactionInput, { type: 'FEE' }>;
type RecordReserveReleaseInput = Extract<RecordFactoringTransactionInput, { type: 'RESERVE_RELEASE' }>;
type RecordChargebackInput = Extract<RecordFactoringTransactionInput, { type: 'CHARGEBACK' }>;
type RecordChargebackReversalInput = Extract<RecordFactoringTransactionInput, { type: 'CHARGEBACK_REVERSAL' }>;

const MISSING_DOC_LABEL: Record<DocBundleDocType, string> = {
  INVOICE: 'invoice',
  RATE_CON: 'rate confirmation',
  BOL: 'BOL',
  POD: 'POD',
};

@Injectable()
export class FactoringService {
  private readonly logger = new Logger(FactoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly noaService: NoaService,
    private readonly invoiceEmailService: InvoiceEmailService,
    private readonly docBundleService: DocBundleService,
    private readonly counterService: CounterService,
    private readonly events: DomainEventService,
  ) {}

  async listCompanies(tenantId: number) {
    return this.prisma.factoringCompany.findMany({
      where: { tenantId },
      orderBy: { companyName: 'asc' },
    });
  }

  async createCompany(
    tenantId: number,
    data: {
      companyName: string;
      contactEmail?: string;
      contactPhone?: string;
      remittanceAddress?: string;
      submissionEmail?: string;
      advanceRatePct?: number;
      feeRatePct?: number;
      recourseType?: RecourseType;
      notes?: string;
      website?: string;
      remittanceCity?: string;
      remittanceState?: string;
      remittanceZip?: string;
      status?: 'ACTIVE' | 'INACTIVE';
    },
  ) {
    return this.prisma.factoringCompany.create({
      data: {
        companyId: `fc_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        companyName: data.companyName,
        contactEmail: data.contactEmail || null,
        contactPhone: data.contactPhone || null,
        remittanceAddress: data.remittanceAddress || null,
        submissionEmail: data.submissionEmail || null,
        advanceRatePct: data.advanceRatePct ?? null,
        feeRatePct: data.feeRatePct ?? null,
        recourseType: data.recourseType || null,
        notes: data.notes || null,
        website: data.website || null,
        remittanceCity: data.remittanceCity || null,
        remittanceState: data.remittanceState || null,
        remittanceZip: data.remittanceZip || null,
        status: data.status || 'ACTIVE',
        tenantId,
      },
    });
  }

  async updateCompany(tenantId: number, companyId: string, data: Record<string, any>) {
    const company = await this.prisma.factoringCompany.findFirst({
      where: { companyId, tenantId },
    });
    if (!company) throw new NotFoundException('Factoring company not found');

    return this.prisma.factoringCompany.update({
      where: { id: company.id },
      data: {
        ...(data.companyName !== undefined && {
          companyName: data.companyName,
        }),
        ...(data.contactEmail !== undefined && {
          contactEmail: data.contactEmail,
        }),
        ...(data.contactPhone !== undefined && {
          contactPhone: data.contactPhone,
        }),
        ...(data.remittanceAddress !== undefined && {
          remittanceAddress: data.remittanceAddress,
        }),
        ...(data.submissionEmail !== undefined && {
          submissionEmail: data.submissionEmail,
        }),
        ...(data.advanceRatePct !== undefined && {
          advanceRatePct: data.advanceRatePct,
        }),
        ...(data.feeRatePct !== undefined && {
          feeRatePct: data.feeRatePct,
        }),
        ...(data.recourseType !== undefined && {
          recourseType: data.recourseType,
        }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.website !== undefined && { website: data.website }),
        ...(data.remittanceCity !== undefined && {
          remittanceCity: data.remittanceCity,
        }),
        ...(data.remittanceState !== undefined && {
          remittanceState: data.remittanceState,
        }),
        ...(data.remittanceZip !== undefined && {
          remittanceZip: data.remittanceZip,
        }),
        ...(data.status !== undefined && { status: data.status }),
      },
    });
  }

  async deleteCompany(tenantId: number, companyId: string) {
    const company = await this.prisma.factoringCompany.findFirst({
      where: { companyId, tenantId },
    });
    if (!company) throw new NotFoundException('Factoring company not found');

    // Check for referencing invoices and NOA records
    const [invoiceCount, noaCount] = await Promise.all([
      this.prisma.invoice.count({
        where: { factoringCompanyId: company.id, tenantId },
      }),
      this.prisma.noaRecord.count({
        where: { factoringCompanyId: company.id, tenantId },
      }),
    ]);

    if (invoiceCount > 0 || noaCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''} and ${noaCount} NOA record${noaCount !== 1 ? 's' : ''} reference this company`,
      );
    }

    await this.prisma.factoringCompany.delete({ where: { id: company.id } });
    return { deleted: true };
  }

  /**
   * Submit an invoice to a factoring company.
   * Validates status, billingPath, and optionally sends email.
   */
  async submitToFactor(
    tenantId: number,
    invoiceNumber: string,
    data: {
      factoringCompanyId: string;
      factoringReference?: string;
      sendEmail?: boolean;
    },
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber,
        tenantId,
      },
      include: { customer: true, load: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (!['SENT', 'PARTIAL'].includes(invoice.status)) {
      throw new BadRequestException('Invoice must be in SENT or PARTIAL status to submit to factor');
    }

    if (invoice.billingPath !== 'FACTORED') {
      throw new BadRequestException('Invoice billingPath must be FACTORED to submit to factor');
    }

    const company = await this.prisma.factoringCompany.findFirst({
      where: { companyId: data.factoringCompanyId, tenantId },
    });
    if (!company) throw new NotFoundException('Factoring company not found');

    // Hard guard: factor will reject without the full doc package.
    const bundleStatus = await this.docBundleService.validateBundleReady(tenantId, invoiceNumber);
    if (!bundleStatus.ready) {
      const friendly = bundleStatus.missing.map((m) => MISSING_DOC_LABEL[m] ?? m).join(', ');
      throw new BadRequestException(`Bundle incomplete: missing ${friendly}`);
    }

    // Generate the bundle BEFORE we mutate the invoice row. If a source doc
    // was deleted between the readiness check above and now (race), the
    // merge throws BadRequestException and we abort cleanly — no half-state
    // where submittedToFactorAt is set but no email was ever sent.
    const sendEmail = data.sendEmail !== false; // default true
    const willEmail = sendEmail && !!company.submissionEmail;
    const bundle = willEmail ? await this.docBundleService.generateBundle(tenantId, invoiceNumber) : null;

    // NOA gate (Phase 3). Submitting to a factor without an ACKNOWLEDGED NOA
    // is a hard block — the broker must be told to redirect payment before
    // the factor will fund the invoice.
    const noa = await this.noaService.checkNoaForInvoice(tenantId, invoice.customerId, company.id);
    if (!noa || noa.status !== 'ACKNOWLEDGED') {
      const customerName = invoice.customer?.companyName ?? 'this customer';
      throw new BadRequestException(`NOA must be ACKNOWLEDGED for ${customerName} before submitting to factor`);
    }
    const noaWarning: string | null = null;

    const fromStatus = invoice.status;
    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        // Phase 4: explicit status transition. Single submit flow now sets
        // FACTORED here (was SENT under the legacy two-flow design).
        status: 'FACTORED',
        factoringCompanyId: company.id,
        factoringReference: data.factoringReference || null,
        submittedToFactorAt: new Date(),
      },
      include: { customer: true, load: true, lineItems: true },
    });

    // Emit the status transition before the email so consumers (cache,
    // SSE, webhooks) see FACTORED even if email delivery fails.
    await this.events.emit(SALLY_EVENTS.INVOICE_UPDATED, tenantId, {
      invoiceNumber: updated.invoiceNumber,
      fromStatus,
      toStatus: 'FACTORED',
      factoringCompanyId: company.companyId,
    });

    // Send email to factor using the pre-generated bundle.
    // We surface email-send failures in the response (rather than swallowing)
    // so the dispatcher sees "submitted but email failed" instead of an
    // unconditional success toast hiding a delivery failure.
    let emailWarning: string | null = null;
    if (willEmail && bundle) {
      try {
        await this.invoiceEmailService.sendToFactor(tenantId, invoiceNumber, company.submissionEmail, { bundle });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to send invoice ${invoiceNumber} to factor email: ${reason}`);
        emailWarning = 'Submitted to factor, but email delivery failed. Resend the email from the invoice detail.';
      }
    }

    return { invoice: updated, noaWarning, emailWarning };
  }

  /**
   * Batch submit invoices to factor.
   */
  async batchSubmitToFactor(
    tenantId: number,
    invoiceNumbers: string[],
    data: {
      factoringCompanyId: string;
      factoringReference?: string;
      sendEmail?: boolean;
    },
  ) {
    let submitted = 0;
    let skipped = 0;

    for (const invoiceNumber of invoiceNumbers) {
      try {
        await this.submitToFactor(tenantId, invoiceNumber, data);
        submitted++;
      } catch {
        skipped++;
      }
    }

    return { submitted, skipped };
  }

  // ─── Phase 4 — money ledger ────────────────────────────────────────────
  //
  // Five entry points (recordAdvance, recordFee, recordReserveRelease,
  // recordChargeback, recordChargebackReversal) plus a soft-delete. Each
  // creates a FactoringTransaction row, rebuilds the Invoice denormalized
  // money fields from the still-active rows in the ledger, optionally flips
  // the invoice status, and emits a sally.factoring.* event.
  //
  // The ledger is the source of truth; Invoice money fields are a fast-read
  // cache. Status transitions are whitelisted in `assertInvoiceTransition`.

  private static readonly INVOICE_TRANSITIONS: Partial<Record<string, ReadonlyArray<string>>> = {
    FACTORED: ['PAID', 'RECOURSED'],
    RECOURSED: ['FACTORED'],
  };

  private assertInvoiceTransition(from: string, to: string) {
    const allowed = FactoringService.INVOICE_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(`Invoice cannot transition from ${from} to ${to}`);
    }
  }

  /**
   * Generate a transaction ID via TenantCounter so two concurrent advances in
   * the same tenant on the same day get distinct sequence numbers.
   * Format: FT-YYYYMMDD-NNN.
   */
  private async generateTransactionId(tenantId: number): Promise<string> {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const seq = await this.counterService.nextValue(tenantId, `factoring-txn:${today}`);
    return `FT-${today.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;
  }

  /**
   * Load the invoice (tenant-scoped) and its current factoring company; throws
   * NotFound on cross-tenant or missing, BadRequest if no factor wired.
   */
  private async loadFactoredInvoice(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: { factoringCompanyRel: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceNumber} not found`);
    if (!invoice.factoringCompanyRel || invoice.factoringCompanyId == null) {
      throw new BadRequestException('Invoice has no factoring company');
    }
    return invoice;
  }

  /**
   * Convert a YYYY-MM-DD calendar string to a Date suitable for Prisma @db.Date
   * storage. Uses UTC midnight so Postgres @db.Date never drifts to the prior
   * day in any timezone.
   */
  private parseCalendarDate(dateStr: string): Date {
    return new Date(`${dateStr}T00:00:00Z`);
  }

  /**
   * Recalculate Invoice denormalized money fields by aggregating the still-
   * active rows in the ledger. Single source of truth; the cache rebuilds
   * after every record/delete so denormalized state never drifts.
   */
  private async rebuildInvoiceMoneyDenormalize(tx: Prisma.TransactionClient, invoicePk: number): Promise<void> {
    const txns = await tx.factoringTransaction.findMany({
      where: { invoiceId: invoicePk, deletedAt: null },
      orderBy: { transactionDate: 'asc' },
    });

    let advanceAmount = 0;
    let advanceReceivedAt: Date | null = null;
    let feeTotal = 0;
    let reserveReleased = 0;
    let reserveReleasedAt: Date | null = null;

    for (const t of txns) {
      switch (t.type) {
        case 'ADVANCE':
          advanceAmount += t.amountCents;
          if (!advanceReceivedAt || t.transactionDate < advanceReceivedAt) {
            advanceReceivedAt = t.transactionDate;
          }
          break;
        case 'FEE':
          feeTotal += t.amountCents;
          break;
        case 'RESERVE_RELEASE':
          reserveReleased += t.amountCents;
          if (!reserveReleasedAt || t.transactionDate > reserveReleasedAt) {
            reserveReleasedAt = t.transactionDate;
          }
          break;
        // CHARGEBACK / CHARGEBACK_REVERSAL don't change money cache (status flips
        // in the dedicated record method); the chargeback ledger row is the
        // audit trail.
      }
    }

    const invoice = await tx.invoice.findUnique({ where: { id: invoicePk } });
    if (!invoice) return; // shouldn't happen; tx.find* would have thrown otherwise

    const reserveAmount = Math.max(0, invoice.totalCents - advanceAmount - feeTotal);

    await tx.invoice.update({
      where: { id: invoicePk },
      data: {
        advanceAmountCents: advanceAmount > 0 ? advanceAmount : null,
        advanceReceivedAt,
        factoringFeeCents: feeTotal > 0 ? feeTotal : null,
        reserveAmountCents: advanceAmount > 0 ? reserveAmount : null,
        reserveReleasedAt: reserveReleased > 0 ? reserveReleasedAt : null,
      },
    });
  }

  /** Map Prisma P2002 (factoring_txn_dedup unique) to a clean ConflictException. */
  private wrapDuplicateError(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictException(
        'A matching factoring transaction already exists for this invoice, type, date, and amount.',
      );
    }
    throw err as Error;
  }

  /**
   * Record a factoring advance against an invoice. Optionally auto-creates the
   * paired FEE ledger row from FactoringCompany.feeRatePct (default true).
   * Snapshots the rate-card values on the row so historical txns survive
   * mid-stream rate-card changes.
   */
  async recordAdvance(tenantId: number, invoiceNumber: string, actorUserId: number | null, input: RecordAdvanceInput) {
    const invoice = await this.loadFactoredInvoice(tenantId, invoiceNumber);
    if (invoice.status !== 'FACTORED') {
      throw new BadRequestException('Invoice must be in FACTORED status to record an advance');
    }
    const company = invoice.factoringCompanyRel;
    const feeRate = company.feeRatePct;
    const willAutoFee = (input.autoRecordFee ?? true) && feeRate != null;
    const feeCents = willAutoFee ? Math.round((Number(feeRate) / 100) * invoice.totalCents) : 0;
    const txnDate = this.parseCalendarDate(input.transactionDate);

    let advance: Awaited<ReturnType<Prisma.TransactionClient['factoringTransaction']['create']>> | null = null;
    let fee: typeof advance = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        const advanceTxnId = await this.generateTransactionId(tenantId);
        advance = await tx.factoringTransaction.create({
          data: {
            transactionId: advanceTxnId,
            invoiceId: invoice.id,
            factoringCompanyId: company.id,
            tenantId,
            type: 'ADVANCE',
            amountCents: input.amountCents,
            transactionDate: txnDate,
            referenceNumber: input.referenceNumber ?? null,
            notes: input.notes ?? null,
            advanceRatePctSnapshot: company.advanceRatePct ?? null,
            feeRatePctSnapshot: company.feeRatePct ?? null,
            createdBy: actorUserId,
          },
        });

        if (willAutoFee && feeCents > 0) {
          const feeTxnId = await this.generateTransactionId(tenantId);
          fee = await tx.factoringTransaction.create({
            data: {
              transactionId: feeTxnId,
              invoiceId: invoice.id,
              factoringCompanyId: company.id,
              tenantId,
              type: 'FEE',
              amountCents: feeCents,
              transactionDate: txnDate,
              advanceRatePctSnapshot: company.advanceRatePct ?? null,
              feeRatePctSnapshot: company.feeRatePct ?? null,
              createdBy: actorUserId,
              metadata: { autoFromRateCard: true, sourceTransactionId: advanceTxnId },
            },
          });
        }

        await this.rebuildInvoiceMoneyDenormalize(tx, invoice.id);
      });
    } catch (err) {
      this.wrapDuplicateError(err);
    }

    await this.events.emit(SALLY_EVENTS.FACTORING_ADVANCE_RECORDED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      factoringCompanyId: company.companyId,
      transactionId: advance.transactionId,
      amountCents: input.amountCents,
    });
    if (fee) {
      await this.events.emit(SALLY_EVENTS.FACTORING_FEE_RECORDED, tenantId, {
        invoiceNumber: invoice.invoiceNumber,
        factoringCompanyId: company.companyId,
        transactionId: (fee as any).transactionId,
        amountCents: feeCents,
        auto: true,
      });
    }

    const refreshed = await this.prisma.invoice.findFirst({
      where: { id: invoice.id },
      include: { factoringCompanyRel: true },
    });
    return { advance: advance, fee, invoice: refreshed };
  }

  /**
   * Record a manual fee on a factored invoice. Does NOT change status —
   * fees accumulate on top of the auto-fee written by recordAdvance.
   */
  async recordFee(tenantId: number, invoiceNumber: string, actorUserId: number | null, input: RecordFeeInput) {
    const invoice = await this.loadFactoredInvoice(tenantId, invoiceNumber);
    if (invoice.status !== 'FACTORED' && invoice.status !== 'RECOURSED') {
      throw new BadRequestException('Invoice must be in FACTORED or RECOURSED status to record a fee');
    }
    const company = invoice.factoringCompanyRel;

    let txn: any = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const txnId = await this.generateTransactionId(tenantId);
        txn = await tx.factoringTransaction.create({
          data: {
            transactionId: txnId,
            invoiceId: invoice.id,
            factoringCompanyId: company.id,
            tenantId,
            type: 'FEE',
            amountCents: input.amountCents,
            transactionDate: this.parseCalendarDate(input.transactionDate),
            referenceNumber: input.referenceNumber ?? null,
            notes: input.notes ?? null,
            feeRatePctSnapshot: company.feeRatePct ?? null,
            createdBy: actorUserId,
          },
        });
        await this.rebuildInvoiceMoneyDenormalize(tx, invoice.id);
      });
    } catch (err) {
      this.wrapDuplicateError(err);
    }

    await this.events.emit(SALLY_EVENTS.FACTORING_FEE_RECORDED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      factoringCompanyId: company.companyId,
      transactionId: txn.transactionId,
      amountCents: input.amountCents,
      auto: false,
    });

    return { transaction: txn };
  }

  /**
   * Record a reserve release. Final money event on the happy path; transitions
   * the invoice FACTORED → PAID.
   */
  async recordReserveRelease(
    tenantId: number,
    invoiceNumber: string,
    actorUserId: number | null,
    input: RecordReserveReleaseInput,
  ) {
    const invoice = await this.loadFactoredInvoice(tenantId, invoiceNumber);
    if (invoice.status !== 'FACTORED') {
      throw new BadRequestException('Invoice must be in FACTORED status to release reserve');
    }
    if (!invoice.advanceAmountCents) {
      throw new BadRequestException('No advance has been recorded yet — release reserve requires a prior advance');
    }
    this.assertInvoiceTransition(invoice.status, 'PAID');
    const company = invoice.factoringCompanyRel;
    const fromStatus = invoice.status;

    let txn: any = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const txnId = await this.generateTransactionId(tenantId);
        txn = await tx.factoringTransaction.create({
          data: {
            transactionId: txnId,
            invoiceId: invoice.id,
            factoringCompanyId: company.id,
            tenantId,
            type: 'RESERVE_RELEASE',
            amountCents: input.amountCents,
            transactionDate: this.parseCalendarDate(input.transactionDate),
            referenceNumber: input.referenceNumber ?? null,
            notes: input.notes ?? null,
            createdBy: actorUserId,
          },
        });
        await this.rebuildInvoiceMoneyDenormalize(tx, invoice.id);
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PAID', paidDate: this.parseCalendarDate(input.transactionDate) },
        });
      });
    } catch (err) {
      this.wrapDuplicateError(err);
    }

    await this.events.emit(SALLY_EVENTS.FACTORING_RESERVE_RELEASED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      factoringCompanyId: company.companyId,
      transactionId: txn.transactionId,
      amountCents: input.amountCents,
    });
    await this.events.emit(SALLY_EVENTS.INVOICE_UPDATED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      fromStatus,
      toStatus: 'PAID',
    });

    return { transaction: txn };
  }

  /**
   * Record a chargeback. Factor charged back the advance because the broker
   * disputed/non-paid. Transitions FACTORED → RECOURSED (only the FIRST
   * chargeback flips status; subsequent ones are net via aggregation).
   */
  async recordChargeback(
    tenantId: number,
    invoiceNumber: string,
    actorUserId: number | null,
    input: RecordChargebackInput,
  ) {
    const invoice = await this.loadFactoredInvoice(tenantId, invoiceNumber);
    if (invoice.status !== 'FACTORED' && invoice.status !== 'RECOURSED') {
      throw new BadRequestException('Invoice must be in FACTORED or RECOURSED status to record a chargeback');
    }
    const company = invoice.factoringCompanyRel;
    const willTransition = invoice.status === 'FACTORED';
    if (willTransition) this.assertInvoiceTransition(invoice.status, 'RECOURSED');
    const fromStatus = invoice.status;

    let txn: any = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const txnId = await this.generateTransactionId(tenantId);
        txn = await tx.factoringTransaction.create({
          data: {
            transactionId: txnId,
            invoiceId: invoice.id,
            factoringCompanyId: company.id,
            tenantId,
            type: 'CHARGEBACK',
            amountCents: input.amountCents,
            transactionDate: this.parseCalendarDate(input.transactionDate),
            referenceNumber: input.referenceNumber ?? null,
            notes: input.notes ?? null,
            createdBy: actorUserId,
          },
        });
        if (willTransition) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'RECOURSED' },
          });
        }
      });
    } catch (err) {
      this.wrapDuplicateError(err);
    }

    await this.events.emit(SALLY_EVENTS.FACTORING_CHARGEBACK_RECEIVED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      factoringCompanyId: company.companyId,
      transactionId: txn.transactionId,
      amountCents: input.amountCents,
    });
    if (willTransition) {
      await this.events.emit(SALLY_EVENTS.INVOICE_UPDATED, tenantId, {
        invoiceNumber: invoice.invoiceNumber,
        fromStatus,
        toStatus: 'RECOURSED',
      });
    }

    return { transaction: txn };
  }

  /**
   * Reverse a previously-recorded chargeback. Multiple reversals allowed; only
   * the first one flips status RECOURSED → FACTORED (subsequent are net via
   * aggregation, no status change).
   */
  async recordChargebackReversal(
    tenantId: number,
    invoiceNumber: string,
    actorUserId: number | null,
    input: RecordChargebackReversalInput,
  ) {
    const invoice = await this.loadFactoredInvoice(tenantId, invoiceNumber);
    if (invoice.status !== 'RECOURSED' && invoice.status !== 'FACTORED') {
      throw new BadRequestException('Invoice must be in RECOURSED or FACTORED status to record a chargeback reversal');
    }
    const company = invoice.factoringCompanyRel;
    const willTransition = invoice.status === 'RECOURSED';
    if (willTransition) this.assertInvoiceTransition(invoice.status, 'FACTORED');
    const fromStatus = invoice.status;

    let txn: any = null;
    try {
      await this.prisma.$transaction(async (tx) => {
        const txnId = await this.generateTransactionId(tenantId);
        txn = await tx.factoringTransaction.create({
          data: {
            transactionId: txnId,
            invoiceId: invoice.id,
            factoringCompanyId: company.id,
            tenantId,
            type: 'CHARGEBACK_REVERSAL',
            amountCents: input.amountCents,
            transactionDate: this.parseCalendarDate(input.transactionDate),
            referenceNumber: input.referenceNumber ?? null,
            notes: input.notes ?? null,
            createdBy: actorUserId,
          },
        });
        if (willTransition) {
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { status: 'FACTORED' },
          });
        }
      });
    } catch (err) {
      this.wrapDuplicateError(err);
    }

    await this.events.emit(SALLY_EVENTS.FACTORING_CHARGEBACK_REVERSED, tenantId, {
      invoiceNumber: invoice.invoiceNumber,
      factoringCompanyId: company.companyId,
      transactionId: txn.transactionId,
      amountCents: input.amountCents,
    });
    if (willTransition) {
      await this.events.emit(SALLY_EVENTS.INVOICE_UPDATED, tenantId, {
        invoiceNumber: invoice.invoiceNumber,
        fromStatus,
        toStatus: 'FACTORED',
      });
    }

    return { transaction: txn };
  }

  /**
   * Soft-delete a factoring transaction. Audit-preserving: the row stays in
   * the table with deletedAt + deletedBy set. Money fields rebuild from the
   * remaining active rows.
   */
  async deleteFactoringTransaction(tenantId: number, transactionId: string, actorUserId: number | null) {
    const txn = await this.prisma.factoringTransaction.findFirst({
      where: { transactionId, tenantId },
    });
    if (!txn) throw new NotFoundException(`Factoring transaction ${transactionId} not found`);
    if (txn.deletedAt) {
      throw new BadRequestException('Factoring transaction is already deleted');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.factoringTransaction.update({
        where: { id: txn.id },
        data: { deletedAt: new Date(), deletedBy: actorUserId },
      });
      await this.rebuildInvoiceMoneyDenormalize(tx, txn.invoiceId);
    });

    // Look up the invoice number for the event payload so cache invalidation
    // keys match the other factoring events (which key on invoiceNumber).
    const parentInvoice = await this.prisma.invoice.findUnique({
      where: { id: txn.invoiceId },
      select: { invoiceNumber: true },
    });

    await this.events.emit(SALLY_EVENTS.FACTORING_TRANSACTION_DELETED, tenantId, {
      transactionId,
      type: txn.type,
      invoiceNumber: parentInvoice?.invoiceNumber ?? null,
      amountCents: txn.amountCents,
    });

    return { deleted: true, transactionId };
  }

  /**
   * List active (non-deleted) factoring transactions for an invoice. The
   * timeline 4B will render uses this; ordered oldest first.
   */
  async listFactoringTransactions(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceNumber} not found`);

    return this.prisma.factoringTransaction.findMany({
      where: { invoiceId: invoice.id, tenantId, deletedAt: null },
      orderBy: { transactionDate: 'asc' },
      include: { factoringCompany: { select: { companyId: true, companyName: true } } },
    });
  }

  /**
   * Phase 4C — real dashboard summary aggregation. Pulls from the active
   * FactoringTransaction ledger (deletedAt IS NULL) + Invoice metadata. All
   * tenant-scoped. Optional date range narrows transaction-side fields;
   * status-based fields (recourse rate, reserves outstanding) ignore the
   * range because they're current-state reads.
   */
  async getFactoringSummary(tenantId: number, dateRange?: { from?: string; to?: string }) {
    const txnDateFilter: { gte?: Date; lte?: Date } = {};
    if (dateRange?.from) txnDateFilter.gte = this.parseCalendarDate(dateRange.from);
    if (dateRange?.to) txnDateFilter.lte = this.parseCalendarDate(dateRange.to);
    const txnWhere = {
      tenantId,
      deletedAt: null,
      ...(txnDateFilter.gte || txnDateFilter.lte ? { transactionDate: txnDateFilter } : {}),
    };

    const [totalsByType, submittedCount, recoursedCount, reservesAgg, recentFunded] = await Promise.all([
      this.prisma.factoringTransaction.groupBy({
        by: ['type'],
        where: txnWhere,
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.invoice.count({ where: { tenantId, submittedToFactorAt: { not: null } } }),
      this.prisma.invoice.count({ where: { tenantId, status: 'RECOURSED' } }),
      this.prisma.invoice.aggregate({
        where: { tenantId, status: 'FACTORED', reserveReleasedAt: null, reserveAmountCents: { gt: 0 } },
        _sum: { reserveAmountCents: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          tenantId,
          submittedToFactorAt: { not: null, gte: new Date(Date.now() - 30 * 86400_000) },
          advanceReceivedAt: { not: null },
        },
        select: { submittedToFactorAt: true, advanceReceivedAt: true },
      }),
    ]);

    const sumByType = (t: string) => totalsByType.find((g) => g.type === t)?._sum.amountCents ?? 0;
    const countByType = (t: string) => totalsByType.find((g) => g.type === t)?._count ?? 0;

    const totalFundedCents = sumByType('ADVANCE');
    const totalFeeCents = sumByType('FEE');
    const totalFundedCount = countByType('ADVANCE');

    const averageDaysToFund =
      recentFunded.length === 0
        ? null
        : recentFunded.reduce((sum, r) => sum + (r.advanceReceivedAt.getTime() - r.submittedToFactorAt.getTime()), 0) /
          recentFunded.length /
          86400_000;

    return {
      totalSubmittedCents: totalFundedCents, // FACTORED invoices map to advance-as-funded baseline
      totalSubmittedCount: submittedCount,
      totalFundedCents,
      totalFundedCount,
      totalFeeCents,
      reservesOutstandingCents: reservesAgg._sum.reserveAmountCents ?? 0,
      averageDaysToFund,
      recourseRatePct: submittedCount > 0 ? (recoursedCount / submittedCount) * 100 : 0,
    };
  }

  /**
   * Phase 4C — count of backfill-estimated transactions for the tenant.
   * Used by the billing-page banner to nudge dispatchers to verify the
   * estimates against their factor statement.
   */
  async getBackfillBannerStatus(tenantId: number): Promise<{ estimatedTransactionCount: number }> {
    const count = await this.prisma.factoringTransaction.count({
      where: {
        tenantId,
        deletedAt: null,
        metadata: { path: ['estimated'], equals: true },
      },
    });
    return { estimatedTransactionCount: count };
  }

  // ─── End Phase 4 ───────────────────────────────────────────────────────
}
