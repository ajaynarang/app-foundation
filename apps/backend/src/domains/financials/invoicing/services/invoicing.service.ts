import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { buildDateRangeFilter } from '../../../../shared/utils/date-range';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { BillingPath, LineItemType } from '@prisma/client';
import { DETENTION_FREE_HOURS, DETENTION_RATE_CENTS } from '@sally/shared-types';
import { LoadEventsService } from '../../../fleet/loads/services/load-events.service';
import { NotificationTriggersService } from '../../../../domains/operations/notifications/notification-triggers.service';
import { NoaService } from './noa.service';
import { clampPagination } from '../../../../shared/utils/pagination';

/** One day in milliseconds — shared by aging-bucket math and DSO. */
const DAY_MS = 86_400_000;

/**
 * Minimum number of paid invoices in the 90-day DSO window before we
 * surface the metric. Below this, a single early-paying customer can
 * skew DSO into a misleading single-digit figure — better to omit it.
 */
const DSO_MIN_SAMPLE_SIZE = 5;
const DSO_LOOKBACK_DAYS = 90;

@Injectable()
export class InvoicingService {
  private readonly logger = new Logger(InvoicingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly cache: SallyCacheService,
    private readonly loadEventsService: LoadEventsService,
    private readonly notificationTriggers: NotificationTriggersService,
    private readonly events: DomainEventService,
    private readonly noaService: NoaService,
  ) {}

  /**
   * Generate an invoice from a delivered load.
   * Auto-creates line items from load rate and stop data.
   */
  async generateFromLoad(
    tenantId: number,
    loadNumber: string,
    options?: {
      paymentTermsDays?: number;
      notes?: string;
      internalNotes?: string;
    },
  ) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      include: { stops: { include: { stop: true } }, customer: true },
    });

    if (!load) throw new NotFoundException('Load not found');
    if (load.status !== 'DELIVERED') throw new BadRequestException('Can only generate invoices for delivered loads');
    // If billingStatus is set, require APPROVED (new flow)
    // If billingStatus is null, allow generation (legacy flow)
    if (load.billingStatus && load.billingStatus !== 'APPROVED') {
      throw new BadRequestException('Load must be approved for billing before invoice generation');
    }
    if (!load.customerId) throw new BadRequestException('Load must have a customer assigned');

    // rateCents check only for legacy flow (no LoadCharge records)
    const hasCharges = await this.prisma.loadCharge.count({
      where: { loadId: load.id, isBillable: true },
    });
    if (!hasCharges && !load.rateCents) {
      throw new BadRequestException('Load must have charges or a rate set');
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      // Check for existing non-VOID invoice for this load
      const existing = await tx.invoice.findFirst({
        where: { loadId: load.id, tenantId, status: { not: 'VOID' } },
      });
      if (existing) throw new BadRequestException(`Invoice ${existing.invoiceNumber} already exists for this load`);

      // Fetch tenant invoice settings once (used for prefix, payment terms, and defaults)
      const invoiceSettings = await tx.invoiceSettings.findUnique({
        where: { tenantId },
      });

      // Generate invoice number with retry on collision.
      // The counter runs outside the transaction, so if invoices were imported
      // or manually created the counter may be behind. Retry up to 5 times
      // to advance past any existing numbers.
      const prefix = invoiceSettings?.invoicePrefix ?? 'INV';
      let invoiceNumber: string | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = await this.generateInvoiceNumber(tenantId, prefix);
        const collision = await tx.invoice.findFirst({
          where: { tenantId, invoiceNumber: candidate },
        });
        if (!collision) {
          invoiceNumber = candidate;
          break;
        }
        this.logger.warn(
          `Invoice number ${candidate} already exists for tenant ${tenantId}, retrying (attempt ${attempt + 1})`,
        );
      }
      if (!invoiceNumber) {
        throw new ConflictException(
          'Unable to generate a unique invoice number. Please check the invoice number counter in settings.',
        );
      }

      // Build line items from LoadCharge records (source of truth)
      const charges = await tx.loadCharge.findMany({
        where: { loadId: load.id, isBillable: true },
        orderBy: { id: 'asc' },
      });

      let lineItems: Array<{
        type: LineItemType;
        description: string;
        quantity: number;
        unitPriceCents: number;
        totalCents: number;
        sequenceOrder: number;
      }> = [];

      const CHARGE_TYPE_MAP: Record<string, LineItemType> = {
        linehaul: 'LINEHAUL',
        fuel_surcharge: 'FUEL_SURCHARGE',
        detention_pickup: 'DETENTION_PICKUP',
        detention_delivery: 'DETENTION_DELIVERY',
        layover: 'LAYOVER',
        lumper: 'LUMPER',
        tonu: 'TONU',
        accessorial: 'ACCESSORIAL',
        adjustment: 'ADJUSTMENT',
      };

      if (charges.length > 0) {
        // Use LoadCharge records as source of truth
        lineItems = charges.map((charge, index) => ({
          type: CHARGE_TYPE_MAP[charge.chargeType] ?? ('ACCESSORIAL' as LineItemType),
          description: charge.description,
          quantity: charge.quantity,
          unitPriceCents: charge.unitPriceCents,
          totalCents: charge.totalCents,
          sequenceOrder: index,
        }));
      } else {
        // Backward compatibility: fall back to rateCents + auto-detention for legacy loads
        if (load.rateCents) {
          lineItems.push({
            type: 'LINEHAUL',
            description: `Line haul - Load #${load.loadNumber}`,
            quantity: 1,
            unitPriceCents: load.rateCents,
            totalCents: load.rateCents,
            sequenceOrder: 0,
          });
        }

        let seq = 1;
        for (const ls of load.stops) {
          if (ls.actualDockHours && ls.estimatedDockHours) {
            const overageHours = ls.actualDockHours - ls.estimatedDockHours;
            const freeHours = DETENTION_FREE_HOURS;
            if (overageHours > freeHours) {
              const billableHours = overageHours - freeHours;
              const detentionRateCents = DETENTION_RATE_CENTS;
              const detentionType = ls.actionType === 'pickup' ? 'DETENTION_PICKUP' : 'DETENTION_DELIVERY';
              lineItems.push({
                type: detentionType,
                description: `Detention at ${ls.actionType} (${billableHours.toFixed(1)} hrs @ $75/hr)`,
                quantity: billableHours,
                unitPriceCents: detentionRateCents,
                totalCents: Math.round(billableHours * detentionRateCents),
                sequenceOrder: seq++,
              });
            }
          }
        }
      }

      if (lineItems.length === 0) {
        throw new BadRequestException('No billable charges found for this load');
      }

      const subtotalCents = lineItems.reduce((sum, li) => sum + li.totalCents, 0);

      // Payment terms priority: explicit option → customer terms → tenant default → 30
      let paymentTermsDays = options?.paymentTermsDays ?? null;
      if (paymentTermsDays === null && load.customer?.paymentTerms) {
        const termsMap: Record<string, number> = {
          NET_15: 15,
          NET_30: 30,
          NET_45: 45,
          NET_60: 60,
          NET_90: 90,
          COD: 0,
          QUICK_PAY: 7,
        };
        paymentTermsDays = termsMap[load.customer.paymentTerms] ?? null;
      }
      if (paymentTermsDays === null) {
        paymentTermsDays = invoiceSettings?.defaultPaymentTermsDays ?? 30;
      }

      const issueDate = new Date();
      const dueDate = new Date(issueDate);
      dueDate.setDate(dueDate.getDate() + paymentTermsDays);

      // Pre-fill notes from tenant defaults when not explicitly provided
      const notes = options?.notes ?? invoiceSettings?.defaultNotes ?? null;

      // Tenant default factor — fallback when the customer has no override.
      // Cascade: customer.override -> tenant.default -> null (DIRECT).
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { defaultFactoringCompanyId: true },
      });

      const created = await tx.invoice.create({
        data: {
          invoiceNumber,
          status: 'DRAFT',
          billingPath: this.resolveBillingPath(load.customer, tenant),
          factoringCompanyId: this.resolveFactoringCompanyId(load.customer, tenant),
          customerId: load.customerId,
          loadId: load.id,
          subtotalCents,
          adjustmentCents: 0,
          totalCents: subtotalCents,
          paidCents: 0,
          balanceCents: subtotalCents,
          issueDate,
          dueDate,
          paymentTermsDays,
          notes,
          internalNotes: options?.internalNotes ?? null,
          tenantId,
          lineItems: {
            create: lineItems,
          },
        },
        include: { lineItems: true, customer: true, load: true },
      });

      await tx.load.update({
        where: { id: load.id },
        data: { billingStatus: 'INVOICED' },
      });

      return created;
    });

    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'invoice_generated',
        fromValue: 'APPROVED',
        toValue: 'INVOICED',
        description: `Invoice ${invoice.invoiceNumber} generated`,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
        },
      })
      .catch((err) => this.logger.error(`Failed to log invoice event: ${err.message}`));

    // Auto-create the NOA record for the (customer, factor) pair on first
    // FACTORED invoice. Idempotent via the @@unique([customerId,
    // factoringCompanyId, tenantId]) constraint; concurrent invoice
    // generations to the same broker can race safely.
    //
    // Wrapped in try/catch so an upsert failure never blocks invoice
    // creation — the submit-time gate runs the same check anyway.
    if (invoice.billingPath === 'FACTORED' && invoice.factoringCompanyId != null) {
      this.noaService
        .upsertForFactoredInvoice(tenantId, invoice.customerId, invoice.factoringCompanyId)
        .catch((err: unknown) => {
          const reason = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `NOA auto-upsert failed for invoice ${invoice.invoiceNumber} (tenantId=${tenantId}): ${reason}`,
          );
        });
    }

    this.notificationTriggers
      .invoiceGenerated(tenantId, invoice.invoiceNumber, load.loadNumber, `$${(invoice.totalCents / 100).toFixed(2)}`)
      .catch(() => {});

    await this.events.emit(SALLY_EVENTS.INVOICE_CREATED, tenantId, {
      entityId: invoice.invoiceNumber,
      entityType: 'invoice',
      invoiceNumber: invoice.invoiceNumber,
      loadNumber: load.loadNumber,
      amount: invoice.totalCents,
    });

    await this.invalidateInvoicingCaches(tenantId);

    this.logger.log(`Generated invoice ${invoice.invoiceNumber} for load ${load.loadNumber} (tenant ${tenantId})`);
    return this.serializeDateFields(invoice);
  }

  /** List invoices with filtering, search, and sorting */
  async findAll(
    tenantId: number,
    filters?: {
      status?: string;
      customerId?: number;
      overdueOnly?: boolean;
      minDaysOverdue?: number;
      search?: string;
      sortBy?: string;
      sortOrder?: string;
      dateFrom?: string;
      dateTo?: string;
      billingPath?: string;
    },
    pagination?: { limit?: number; offset?: number },
  ) {
    const where: any = { tenantId };

    if (filters?.status) where.status = filters.status;
    if (filters?.customerId) where.customerId = filters.customerId;
    if (filters?.billingPath) where.billingPath = filters.billingPath;
    if (filters?.overdueOnly) {
      where.status = { in: ['SENT', 'PARTIAL'] };
      where.dueDate = { lt: new Date() };
    }

    // minDaysOverdue narrows to invoices whose dueDate is at least N days
    // in the past. Used by the AR Health bucket drill-through. Stricter
    // than overdueOnly (which is `dueDate < now`), so it wins when both
    // are set.
    if (filters?.minDaysOverdue !== undefined && filters.minDaysOverdue >= 0) {
      where.status = { in: ['SENT', 'PARTIAL'] };
      where.dueDate = { lt: new Date(Date.now() - filters.minDaysOverdue * DAY_MS) };
    }

    if (filters?.search) {
      where.OR = [
        { invoiceNumber: { contains: filters.search, mode: 'insensitive' } },
        {
          customer: {
            companyName: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          load: {
            loadNumber: { contains: filters.search, mode: 'insensitive' },
          },
        },
        {
          load: {
            referenceNumber: { contains: filters.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const dateFilter = buildDateRangeFilter(filters?.dateFrom, filters?.dateTo);
    if (dateFilter) where.issueDate = dateFilter;

    // Build sort order
    let orderBy: any = { createdAt: 'desc' };
    if (filters?.sortBy) {
      const direction = filters.sortOrder === 'asc' ? 'asc' : 'desc';
      switch (filters.sortBy) {
        case 'dueDate':
          orderBy = { dueDate: direction };
          break;
        case 'amount':
          orderBy = { totalCents: direction };
          break;
        case 'issueDate':
          orderBy = { issueDate: direction };
          break;
        default:
          orderBy = { createdAt: 'desc' };
      }
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        customer: true,
        load: { select: { loadNumber: true, referenceNumber: true } },
        lineItems: true,
        factoringCompanyRel: true,
      },
      orderBy,
      ...clampPagination(pagination),
    });

    return invoices.map((inv) => this.serializeDateFields(inv));
  }

  /**
   * Find overdue invoices for a tenant — used by the Desk scheduler fan-out
   * for AR Follow-up. Unlike `findAll({ overdueOnly: true })`, this is a
   * narrow projection with only the fields the trigger payload needs, and
   * supports a configurable minimum overdue threshold.
   *
   * Status scope (Phase 4C): SENT | PARTIAL | OVERDUE | FACTORED — broker
   * still owes the factor on FACTORED past due-date, so it's outstanding
   * from the carrier's recourse-exposure perspective. Excludes DRAFT, PAID,
   * VOID, RECOURSED (RECOURSED has its own UI surface).
   * Tenant-scoped; never returns cross-tenant rows.
   */
  async findOverdue(
    tenantId: number,
    options?: { minDaysOverdue?: number; limit?: number },
  ): Promise<
    Array<{
      id: number;
      invoiceNumber: string;
      customerId: number | null;
      totalCents: number;
      balanceCents: number;
      dueDate: Date | null;
    }>
  > {
    const minDays = options?.minDaysOverdue ?? 0;
    const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);
    // Phase 4C — include FACTORED past due-date. Broker still owes the
    // factor; from the carrier's recourse-exposure perspective it's overdue.
    // Excludes RECOURSED (already chargeback-active; has its own UI surface).
    return this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'PARTIAL', 'OVERDUE', 'FACTORED'] },
        dueDate: { lt: cutoff },
      },
      select: {
        id: true,
        invoiceNumber: true,
        customerId: true,
        totalCents: true,
        balanceCents: true,
        dueDate: true,
      },
      orderBy: { dueDate: 'asc' },
      take: options?.limit,
    });
  }

  /** Get single invoice with all relations */
  async findOne(tenantId: number, invoiceNumber: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId },
      include: {
        customer: true,
        load: { include: { stops: { include: { stop: true } } } },
        lineItems: { orderBy: { sequenceOrder: 'asc' } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.serializeDateFields(invoice);
  }

  /** Update a draft invoice */
  async update(
    tenantId: number,
    invoiceNumber: string,
    data: {
      paymentTermsDays?: number;
      notes?: string;
      internalNotes?: string;
      adjustmentCents?: number;
      lineItems?: any[];
    },
  ) {
    const invoice = await this.findOne(tenantId, invoiceNumber);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Can only edit draft invoices');

    const updateData: any = {};
    if (data.paymentTermsDays !== undefined) {
      updateData.paymentTermsDays = data.paymentTermsDays;
      const newDue = new Date(invoice.issueDate);
      newDue.setDate(newDue.getDate() + data.paymentTermsDays);
      updateData.dueDate = newDue;
    }
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.internalNotes !== undefined) updateData.internalNotes = data.internalNotes;

    // Replace line items if provided
    if (data.lineItems) {
      await this.prisma.invoiceLineItem.deleteMany({
        where: { invoiceId: invoice.id },
      });
      const lineItems = data.lineItems.map((li, idx) => ({
        invoiceId: invoice.id,
        type: li.type,
        description: li.description,
        quantity: li.quantity,
        unitPriceCents: li.unitPriceCents,
        totalCents: Math.round(li.quantity * li.unitPriceCents),
        sequenceOrder: idx,
      }));
      await this.prisma.invoiceLineItem.createMany({ data: lineItems });

      const subtotalCents = lineItems.reduce((sum, li) => sum + li.totalCents, 0);
      const adjustmentCents = data.adjustmentCents ?? invoice.adjustmentCents;
      updateData.subtotalCents = subtotalCents;
      updateData.adjustmentCents = adjustmentCents;
      updateData.totalCents = subtotalCents + adjustmentCents;
      updateData.balanceCents = subtotalCents + adjustmentCents - invoice.paidCents;
    } else if (data.adjustmentCents !== undefined) {
      // Re-fetch invoice to get the latest subtotalCents in case line items were modified concurrently
      const freshInvoice = await this.prisma.invoice.findFirst({
        where: { id: invoice.id, tenantId },
      });
      if (!freshInvoice) throw new NotFoundException('Invoice not found');
      updateData.adjustmentCents = data.adjustmentCents;
      updateData.totalCents = freshInvoice.subtotalCents + data.adjustmentCents;
      updateData.balanceCents = freshInvoice.subtotalCents + data.adjustmentCents - freshInvoice.paidCents;
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: updateData,
      include: {
        lineItems: { orderBy: { sequenceOrder: 'asc' } },
        customer: true,
        load: true,
      },
    });
    return this.serializeDateFields(updated);
  }

  /** Mark invoice as sent */
  async markSent(tenantId: number, invoiceNumber: string) {
    const invoice = await this.findOne(tenantId, invoiceNumber);
    if (invoice.status !== 'DRAFT') throw new BadRequestException('Can only send draft invoices');

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'SENT' },
      include: { lineItems: true, customer: true, load: true },
    });

    this.notificationTriggers
      .invoiceSent(tenantId, invoice.invoiceNumber, invoice.customer?.companyName ?? 'Customer')
      .catch(() => {});
    if (invoice.customerId) {
      this.notificationTriggers
        .customerInvoiceSent(
          tenantId,
          invoice.customerId,
          invoice.invoiceNumber,
          `$${(invoice.totalCents / 100).toFixed(2)}`,
        )
        .catch(() => {});
    }

    await this.invalidateInvoicingCaches(tenantId, invoice.customerId);
    return this.serializeDateFields(updated);
  }

  /** Void an invoice */
  async voidInvoice(tenantId: number, invoiceNumber: string) {
    const invoice = await this.findOne(tenantId, invoiceNumber);
    if (invoice.status === 'VOID') throw new BadRequestException('Invoice is already voided');
    if (invoice.status === 'PAID') throw new BadRequestException('Cannot void a fully paid invoice');

    const voided = await this.prisma.$transaction(async (tx) => {
      const voidedInv = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: 'VOID' },
        include: { lineItems: true, customer: true, load: true },
      });

      // Reset load billingStatus to APPROVED so it can be re-invoiced
      if (invoice.loadId) {
        await tx.load.update({
          where: { id: invoice.loadId },
          data: { billingStatus: 'APPROVED' },
        });
      }

      return voidedInv;
    });

    if (invoice.loadId) {
      this.loadEventsService
        .logEvent({
          loadId: invoice.loadId,
          eventType: 'invoice_voided',
          fromValue: 'INVOICED',
          toValue: 'APPROVED',
          description: `Invoice ${invoice.invoiceNumber} voided`,
          metadata: {
            invoiceNumber: invoice.invoiceNumber,
          },
        })
        .catch((err) => this.logger.error(`Failed to log void event: ${err.message}`));
    }

    await this.events.emit(SALLY_EVENTS.INVOICE_VOIDED, tenantId, {
      entityId: invoice.invoiceNumber,
      entityType: 'invoice',
      invoiceNumber: invoice.invoiceNumber,
    });

    await this.invalidateInvoicingCaches(tenantId, invoice.customerId);
    return this.serializeDateFields(voided);
  }

  /** AR summary: outstanding, overdue, aging buckets with counts */
  async getSummary(tenantId: number) {
    const cacheKey = buildKey('sally:invoicing', 'summary', tenantId);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        // Phase 4C — AR aging includes FACTORED + RECOURSED invoices in
        // addition to direct-bill statuses. Broker still owes the factor on
        // FACTORED, so it's outstanding from the carrier's recourse-exposure
        // perspective. RECOURSED is post-chargeback — actively owed back to
        // factor. Direct-bill and factored buckets are separated so the UI
        // renders distinct columns.
        const invoices = await this.prisma.invoice.findMany({
          where: { tenantId, status: { in: ['SENT', 'PARTIAL', 'OVERDUE', 'FACTORED', 'RECOURSED'] } },
          select: { balanceCents: true, totalCents: true, dueDate: true, status: true },
        });

        const now = new Date();
        let outstanding = 0;
        let overdue = 0;
        let dueThisWeekCents = 0;
        let dueThisWeekCount = 0;
        const emptyBuckets = () => ({
          current: { amountCents: 0, count: 0 },
          days1_30: { amountCents: 0, count: 0 },
          days31_60: { amountCents: 0, count: 0 },
          days61_90: { amountCents: 0, count: 0 },
          daysOver90: { amountCents: 0, count: 0 },
        });
        const aging = emptyBuckets();
        const factoredAging = emptyBuckets();

        for (const inv of invoices) {
          // Factored invoices use totalCents (full broker exposure) since the
          // dispatcher has the advance from the factor — what's outstanding
          // is the amount the broker still owes, which is the full invoice.
          const isFactored = inv.status === 'FACTORED' || inv.status === 'RECOURSED';
          const amount = isFactored ? inv.totalCents : inv.balanceCents;
          const target = isFactored ? factoredAging : aging;

          outstanding += amount;
          const daysPast = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / (1000 * 60 * 60 * 24));

          if (daysPast > 0) {
            overdue += amount;
            if (daysPast <= 30) {
              target.days1_30.amountCents += amount;
              target.days1_30.count++;
            } else if (daysPast <= 60) {
              target.days31_60.amountCents += amount;
              target.days31_60.count++;
            } else if (daysPast <= 90) {
              target.days61_90.amountCents += amount;
              target.days61_90.count++;
            } else {
              target.daysOver90.amountCents += amount;
              target.daysOver90.count++;
            }
          } else {
            target.current.amountCents += amount;
            target.current.count++;
            // Due within the next 7 days (daysPast <= 0 means not yet overdue)
            if (daysPast >= -7) {
              dueThisWeekCents += amount;
              dueThisWeekCount++;
            }
          }
        }

        // Paid this month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const paidThisMonth = await this.prisma.payment.aggregate({
          where: { tenantId, paymentDate: { gte: startOfMonth } },
          _sum: { amountCents: true },
        });

        // Draft count
        const draftCount = await this.prisma.invoice.count({
          where: { tenantId, status: 'DRAFT' },
        });

        // Ready to invoice count (loads with billingStatus APPROVED)
        const readyToInvoiceCount = await this.prisma.load.count({
          where: { tenantId, billingStatus: 'APPROVED' },
        });

        // Factored invoices
        const factoredAgg = await this.prisma.invoice.aggregate({
          where: { tenantId, status: 'FACTORED' },
          _sum: { totalCents: true },
          _count: true,
        });

        // Billing path breakdown (non-VOID invoices)
        const factoredPathAgg = await this.prisma.invoice.aggregate({
          where: { tenantId, billingPath: 'FACTORED', status: { not: 'VOID' } },
          _sum: { totalCents: true },
          _count: true,
        });
        const directPathAgg = await this.prisma.invoice.aggregate({
          where: { tenantId, billingPath: 'DIRECT', status: { not: 'VOID' } },
          _sum: { totalCents: true },
          _count: true,
        });

        // DSO — Days Sales Outstanding over the last 90 days. Average days
        // from issueDate to paidDate across invoices marked PAID with a
        // paidDate inside the window. Omitted (undefined) when the sample
        // is too thin (< 5 invoices) to mean anything — a noisy single-digit
        // DSO would mislead the dispatcher more than its absence.
        const dsoWindowStart = new Date(now.getTime() - DSO_LOOKBACK_DAYS * DAY_MS);
        const paidInvoices = await this.prisma.invoice.findMany({
          where: {
            tenantId,
            status: 'PAID',
            paidDate: { gte: dsoWindowStart, not: null },
          },
          select: { issueDate: true, paidDate: true },
        });
        const dsoDays = this.computeDsoDays(paidInvoices);

        return {
          outstandingCents: outstanding,
          overdueCents: overdue,
          dueThisWeekCents,
          dueThisWeekCount,
          paidThisMonthCents: paidThisMonth._sum.amountCents ?? 0,
          draftCount,
          readyToInvoiceCount,
          factoredCents: factoredAgg._sum.totalCents ?? 0,
          factoredCount: factoredAgg._count,
          factoredInvoicesCents: factoredPathAgg._sum.totalCents ?? 0,
          factoredInvoicesCount: factoredPathAgg._count,
          directInvoicesCents: directPathAgg._sum.totalCents ?? 0,
          directInvoicesCount: directPathAgg._count,
          aging,
          factoredAging,
          ...(dsoDays !== undefined && { dsoDays }),
        };
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /** Batch generate invoices */
  async batchGenerate(tenantId: number, loadNumbers: string[], options?: { paymentTermsDays?: number }) {
    const results: any[] = [];
    const errors: Array<{ loadNumber: string; error: string }> = [];

    for (const loadNumber of loadNumbers) {
      try {
        const invoice = await this.generateFromLoad(tenantId, loadNumber, options);
        results.push(invoice);
      } catch (error: any) {
        errors.push({ loadNumber, error: error.message });
      }
    }

    return {
      generated: results,
      errors,
      total: loadNumbers.length,
      successCount: results.length,
    };
  }

  /** Batch send invoices */
  async batchSend(tenantId: number, invoiceNumbers: string[]) {
    let sent = 0;
    let skipped = 0;

    for (const invoiceNumber of invoiceNumbers) {
      try {
        const invoice = await this.prisma.invoice.findFirst({
          where: { invoiceNumber, tenantId, status: 'DRAFT' },
        });
        if (!invoice) {
          skipped++;
          continue;
        }

        await this.prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'SENT' },
        });
        sent++;
      } catch {
        skipped++;
      }
    }

    return { sent, skipped };
  }

  /** Batch void invoices */
  async batchVoid(tenantId: number, invoiceNumbers: string[]) {
    let voided = 0;
    let skipped = 0;

    for (const invoiceNumber of invoiceNumbers) {
      try {
        await this.voidInvoice(tenantId, invoiceNumber);
        voided++;
      } catch {
        skipped++;
      }
    }

    return { voided, skipped };
  }

  /** Batch mark paid */
  async batchMarkPaid(
    tenantId: number,
    invoiceNumbers: string[],
    data: { paymentDate: string; paymentMethod?: string },
  ) {
    if (new Date(data.paymentDate) > new Date()) {
      throw new BadRequestException('Payment date cannot be in the future');
    }

    let paid = 0;
    let skipped = 0;

    for (const invoiceNumber of invoiceNumbers) {
      try {
        const invoice = await this.prisma.invoice.findFirst({
          where: {
            invoiceNumber,
            tenantId,
            status: { in: ['SENT', 'PARTIAL'] },
          },
        });
        if (!invoice) {
          skipped++;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.payment.create({
            data: {
              paymentId: `pay_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
              invoiceId: invoice.id,
              amountCents: invoice.balanceCents,
              paymentMethod: data.paymentMethod || null,
              paymentDate: new Date(data.paymentDate),
              tenantId,
            },
          });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              status: 'PAID',
              paidCents: invoice.totalCents,
              balanceCents: 0,
              paidDate: new Date(data.paymentDate),
            },
          });
        });
        paid++;
      } catch {
        skipped++;
      }
    }

    return { paid, skipped };
  }

  /** Get customer payment statistics */
  async getCustomerPaymentStats(tenantId: number, customerId: number) {
    const cacheKey = buildKey('sally:invoicing', 'customer-stats', tenantId, customerId);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const paidInvoices = await this.prisma.invoice.findMany({
          where: { tenantId, customerId, status: 'PAID' },
          select: { issueDate: true, paidDate: true, totalCents: true },
        });

        if (paidInvoices.length === 0) return { hasHistory: false };

        const daysToPayList = paidInvoices
          .filter((inv) => inv.paidDate)
          .map((inv) => {
            const issue = new Date(inv.issueDate);
            const paid = new Date(inv.paidDate);
            return Math.round((paid.getTime() - issue.getTime()) / (1000 * 60 * 60 * 24));
          });

        const avgDaysToPay =
          daysToPayList.length > 0 ? Math.round(daysToPayList.reduce((a, b) => a + b, 0) / daysToPayList.length) : 0;

        const outstanding = await this.prisma.invoice.aggregate({
          where: {
            tenantId,
            customerId,
            status: { in: ['SENT', 'PARTIAL', 'OVERDUE'] },
          },
          _sum: { balanceCents: true },
          _count: true,
        });

        let reliability: string;
        if (avgDaysToPay <= 20) reliability = 'Excellent';
        else if (avgDaysToPay <= 35) reliability = 'Good';
        else if (avgDaysToPay <= 50) reliability = 'Average';
        else reliability = 'Slow';

        return {
          hasHistory: true,
          avgDaysToPay,
          reliability,
          reliabilityLabel: `Usually pays in ${avgDaysToPay} days`,
          totalInvoicesPaid: paidInvoices.length,
          outstandingCents: outstanding._sum.balanceCents || 0,
          outstandingCount: outstanding._count,
        };
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /** Re-invoice from voided invoice */
  async reInvoice(tenantId: number, invoiceNumber: string, options?: { paymentTermsDays?: number }) {
    const voidedInvoice = await this.prisma.invoice.findFirst({
      where: { invoiceNumber, tenantId, status: 'VOID' },
      include: { load: true },
    });
    if (!voidedInvoice) throw new NotFoundException('Voided invoice not found');

    return this.generateFromLoad(tenantId, voidedInvoice.load.loadNumber, options);
  }

  /** Invalidate invoicing-related caches after mutations */
  private async invalidateInvoicingCaches(tenantId: number, customerId?: number | null): Promise<void> {
    await this.cache.del(buildKey('sally:invoicing', 'summary', tenantId));
    if (customerId) {
      await this.cache.del(buildKey('sally:invoicing', 'customer-stats', tenantId, customerId));
    }
  }

  /**
   * Generate sequential invoice number using atomic UPSERT-based counter.
   * Format: {PREFIX}-{YEAR}-{SEQ} e.g. INV-2026-0001
   */
  private async generateInvoiceNumber(tenantId: number, prefix: string = 'INV'): Promise<string> {
    const year = new Date().getFullYear();
    const seq = await this.counterService.nextValue(tenantId, `invoice:${year}`);
    return `${prefix}-${year}-${String(seq).padStart(4, '0')}`;
  }

  /**
   * Cascade for invoice billingPath: customer override -> tenant default -> DIRECT.
   * A customer-set DIRECT override beats a tenant default; missing customer settings
   * fall back to FACTORED when the tenant has a pinned factor, otherwise DIRECT.
   */
  private resolveBillingPath(
    customer: { defaultBillingPath?: BillingPath | null } | null | undefined,
    tenant: { defaultFactoringCompanyId: number | null } | null,
  ): BillingPath {
    if (customer?.defaultBillingPath) return customer.defaultBillingPath;
    return tenant?.defaultFactoringCompanyId ? BillingPath.FACTORED : BillingPath.DIRECT;
  }

  /**
   * Cascade for invoice factoringCompanyId: customer override -> tenant default -> null.
   * Customer DIRECT override clears the factor; otherwise the customer FK takes priority,
   * then the tenant FK.
   */
  private resolveFactoringCompanyId(
    customer: { defaultBillingPath?: BillingPath | null; defaultFactoringCompanyId?: number | null } | null | undefined,
    tenant: { defaultFactoringCompanyId: number | null } | null,
  ): number | null {
    if (customer?.defaultBillingPath === BillingPath.DIRECT) return null;
    if (customer?.defaultFactoringCompanyId) return customer.defaultFactoringCompanyId;
    return tenant?.defaultFactoringCompanyId ?? null;
  }

  /**
   * Average days from issueDate to paidDate over the supplied paid-invoice
   * window. Returns `undefined` when the sample is below the floor
   * ({@link DSO_MIN_SAMPLE_SIZE}) so the UI can hide the metric instead of
   * surfacing a misleading single-digit value.
   */
  private computeDsoDays(paidInvoices: Array<{ issueDate: Date | null; paidDate: Date | null }>): number | undefined {
    const usable = paidInvoices.filter((inv) => inv.issueDate && inv.paidDate);
    if (usable.length < DSO_MIN_SAMPLE_SIZE) return undefined;
    const totalDays = usable.reduce((acc, inv) => {
      const ms = inv.paidDate.getTime() - inv.issueDate.getTime();
      return acc + ms / DAY_MS;
    }, 0);
    return Math.round(totalDays / usable.length);
  }

  /** Serialize @db.Date fields as YYYY-MM-DD strings to prevent timezone shift */
  private serializeDateFields<T extends Record<string, any>>(invoice: T): T {
    return {
      ...invoice,
      issueDate: invoice.issueDate instanceof Date ? invoice.issueDate.toISOString().split('T')[0] : invoice.issueDate,
      dueDate: invoice.dueDate instanceof Date ? invoice.dueDate.toISOString().split('T')[0] : invoice.dueDate,
      paidDate:
        invoice.paidDate instanceof Date ? invoice.paidDate.toISOString().split('T')[0] : (invoice.paidDate ?? null),
      ...(invoice.payments
        ? {
            payments: invoice.payments.map((p: any) => ({
              ...p,
              paymentDate: p.paymentDate instanceof Date ? p.paymentDate.toISOString().split('T')[0] : p.paymentDate,
            })),
          }
        : {}),
    };
  }
}
