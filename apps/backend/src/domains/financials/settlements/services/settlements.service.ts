import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PayStructureType, Prisma } from '@prisma/client';
import { QUEUE_NAMES, FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { randomUUID } from 'crypto';
import { NotificationTriggersService } from '../../../../domains/operations/notifications/notification-triggers.service';
import { clampPagination } from '../../../../shared/utils/pagination';
import { toUtcCalendarDate } from '../../../../shared/utils/calendar-date';
import { requestContextStorage } from '../../../../infrastructure/logging/request-context.middleware';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import type { AccountingSyncJobData } from '../../../integrations/accounting/accounting-job.types';

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
    private readonly notificationTriggers: NotificationTriggersService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Calculate settlement for a driver in a given period.
   * Looks up delivered loads, applies pay structure, computes line items.
   */
  async calculate(
    tenantId: number,
    data: {
      driverId: string;
      periodStart: string;
      periodEnd: string;
      preview?: boolean;
    },
  ) {
    const driver = await this.prisma.driver.findFirst({
      where: { driverId: data.driverId, tenantId },
      include: { payStructures: { where: { isActive: true }, take: 1 } },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    const activePayStructure = driver.payStructures?.[0] ?? null;
    if (!activePayStructure) throw new BadRequestException('Driver has no pay structure configured');

    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    // Find delivered standard (non-relay) loads for this driver in the period
    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        driverId: driver.id,
        isRelay: false,
        status: 'DELIVERED',
        deliveredAt: { gte: periodStart, lte: periodEnd },
      },
      include: {
        routePlanLoads: {
          include: { plan: { select: { totalDistanceMiles: true } } },
        },
        trip: { select: { id: true } },
      },
    });

    // Find delivered relay legs for this driver in the period
    const relayLegs = await this.prisma.loadLeg.findMany({
      where: {
        tenantId,
        driverId: driver.id,
        status: 'DELIVERED',
        deliveredAt: { gte: periodStart, lte: periodEnd },
      },
      include: {
        load: {
          select: {
            loadNumber: true,
            rateCents: true,
            estimatedMiles: true,
            actualMiles: true,
          },
        },
        routePlan: { select: { totalDistanceMiles: true } },
      },
    });

    if (loads.length === 0 && relayLegs.length === 0)
      throw new BadRequestException('No delivered loads found in this period');

    // Prevent overlapping settlements for same driver
    if (!data.preview) {
      const existingSettlement = await this.prisma.settlement.findFirst({
        where: {
          tenantId,
          driverId: driver.id,
          status: { not: 'VOID' },
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
      });
      if (existingSettlement) {
        throw new ConflictException(
          `Settlement ${existingSettlement.settlementNumber} already covers this period (${existingSettlement.periodStart.toISOString().slice(0, 10)} to ${existingSettlement.periodEnd.toISOString().slice(0, 10)}). Void it first to recalculate.`,
        );
      }
    }

    // Calculate pay for each load
    const lineItems: Array<{
      load: { connect: { id: number } };
      leg?: { connect: { id: number } };
      tripId?: number | null;
      description: string;
      miles: number | null;
      loadRevenueCents: number | null;
      payAmountCents: number;
      payStructureType: PayStructureType;
      rateSnapshot: Record<string, any> | null;
    }> = [];

    const ps = activePayStructure;
    for (const load of loads) {
      const routeMiles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? null;
      const loadRevenueCents = load.rateCents ?? 0;
      let payAmountCents = 0;

      switch (ps.type) {
        case 'PER_MILE':
          payAmountCents = Math.round((routeMiles ?? 0) * (ps.ratePerMileCents ?? 0));
          break;
        case 'PERCENTAGE':
          payAmountCents = Math.round(loadRevenueCents * (Number(ps.percentage ?? 0) / 100));
          break;
        case 'FLAT_RATE':
          payAmountCents = ps.flatRateCents ?? 0;
          break;
        case 'HYBRID':
          payAmountCents =
            (ps.hybridBaseCents ?? 0) + Math.round(loadRevenueCents * (Number(ps.hybridPercent ?? 0) / 100));
          break;
      }

      lineItems.push({
        load: { connect: { id: load.id } },
        tripId: (load as any).trip?.id ?? null,
        description: `Load #${load.loadNumber} - ${ps.type.replace(/_/g, ' ').toLowerCase()}`,
        miles: routeMiles,
        loadRevenueCents,
        payAmountCents,
        payStructureType: ps.type,
        rateSnapshot: {
          type: ps.type,
          ratePerMileCents: ps.ratePerMileCents,
          percentage: ps.percentage,
          flatRateCents: ps.flatRateCents,
        },
      });
    }

    // Process relay legs
    for (const leg of relayLegs) {
      const routeMiles = leg.routePlan?.totalDistanceMiles ?? leg.actualMiles ?? 0;
      const loadRevenueCents = leg.load.rateCents ?? 0;

      // For PERCENTAGE and HYBRID, pro-rate revenue by leg miles
      const totalLoadMiles = leg.load.actualMiles ?? leg.load.estimatedMiles ?? routeMiles;
      const revenueShare = totalLoadMiles > 0 ? routeMiles / totalLoadMiles : 1;
      const legRevenueCents = Math.round(loadRevenueCents * revenueShare);

      let payAmountCents = 0;

      switch (ps.type) {
        case 'PER_MILE':
          payAmountCents = Math.round(routeMiles * (ps.ratePerMileCents ?? 0));
          break;
        case 'PERCENTAGE':
          payAmountCents = Math.round(legRevenueCents * (Number(ps.percentage ?? 0) / 100));
          break;
        case 'FLAT_RATE':
          // Pro-rate flat rate by leg miles for relay loads
          payAmountCents =
            totalLoadMiles > 0 ? Math.round((ps.flatRateCents ?? 0) * revenueShare) : (ps.flatRateCents ?? 0);
          break;
        case 'HYBRID':
          payAmountCents =
            Math.round((ps.hybridBaseCents ?? 0) * revenueShare) +
            Math.round(legRevenueCents * (Number(ps.hybridPercent ?? 0) / 100));
          break;
      }

      lineItems.push({
        load: { connect: { id: leg.loadId } },
        leg: { connect: { id: leg.id } },
        description: `Load #${leg.load.loadNumber} — Leg ${leg.sequence} (${ps.type.replace(/_/g, ' ').toLowerCase()})`,
        miles: routeMiles,
        loadRevenueCents: legRevenueCents,
        payAmountCents,
        payStructureType: ps.type,
        rateSnapshot: {
          type: ps.type,
          ratePerMileCents: ps.ratePerMileCents,
          percentage: ps.percentage,
          flatRateCents: ps.flatRateCents,
        },
      });
    }

    const grossPayCents = lineItems.reduce((sum, li) => sum + li.payAmountCents, 0);

    // Preview mode: return calculation without creating
    if (data.preview) {
      return {
        driverId: data.driverId,
        driverName: driver.name,
        periodStart: data.periodStart,
        periodEnd: data.periodEnd,
        lineItems: lineItems,
        grossPayCents: grossPayCents,
        deductionsCents: 0,
        netPayCents: grossPayCents,
        loadCount: loads.length + relayLegs.length,
      };
    }

    // Phase 4C — driver pay timing gate. When tenant.driverPayTiming = ON_FACTOR_FUND,
    // settlement creation is gated on every contributing factored load's invoice
    // having `advanceReceivedAt` set. The choice between ON_DELIVERY (default,
    // gate skipped) and ON_FACTOR_FUND (gate enforces) is itself the opt-in;
    // flipping to ON_FACTOR_FUND should be a deliberate decision per tenant.
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { driverPayTiming: true },
    });
    if (tenant?.driverPayTiming === 'ON_FACTOR_FUND') {
      const loadIds = [...loads.map((l) => l.id), ...relayLegs.map((l) => l.loadId)];
      const factoredInvoicesMissingAdvance =
        loadIds.length === 0
          ? []
          : await this.prisma.invoice.findMany({
              where: {
                tenantId,
                loadId: { in: loadIds },
                billingPath: 'FACTORED',
                advanceReceivedAt: null,
              },
              select: { invoiceNumber: true, loadId: true },
            });

      if (factoredInvoicesMissingAdvance.length > 0) {
        const detail = factoredInvoicesMissingAdvance.map((inv) => inv.invoiceNumber).join(', ');
        throw new BadRequestException(
          `Cannot create settlement: ${factoredInvoicesMissingAdvance.length} factored invoice(s) not yet funded by factor (${detail}). Driver pay timing is set to "Pay when factor funds"; record the advance first.`,
        );
      }
    }

    // Create settlement
    const lastName = driver.name.split(' ').pop() || driver.name;
    const settlementNumber = await this.generateSettlementNumber(tenantId, lastName, periodStart);

    const settlement = await this.prisma.settlement.create({
      data: {
        settlementId: `stl_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        settlementNumber,
        status: 'DRAFT',
        driverId: driver.id,
        periodStart,
        periodEnd,
        grossPayCents,
        deductionsCents: 0,
        netPayCents: grossPayCents,
        tenantId,
        lineItems: {
          create: lineItems,
        },
      },
      include: { lineItems: true, driver: true },
    });

    this.logger.log(
      `Created settlement ${settlementNumber} for driver ${driver.driverId} (${loads.length} loads, ${relayLegs.length} relay legs, gross $${(grossPayCents / 100).toFixed(2)})`,
    );

    await this.events.emit(SALLY_EVENTS.SETTLEMENT_CREATED, tenantId, {
      entityId: settlement.settlementId,
      entityType: 'settlement',
      settlementNumber: settlement.settlementNumber,
      driverId: data.driverId,
      totalAmount: settlement.netPayCents,
    });

    return this.serializeDateFields(settlement);
  }

  /** List settlements with filtering, search, sort, and period */
  async findAll(
    tenantId: number,
    filters?: {
      status?: string;
      driverId?: string;
      search?: string;
      periodStart?: string;
      periodEnd?: string;
      sortBy?: string;
      sortOrder?: string;
    },
    pagination?: { limit?: number; offset?: number },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { driverId: filters.driverId, tenantId },
      });
      if (driver) where.driverId = driver.id;
    }
    if (filters?.periodStart) {
      where.periodStart = {
        ...(where.periodStart || {}),
        gte: new Date(filters.periodStart),
      };
    }
    if (filters?.periodEnd) {
      where.periodEnd = {
        ...(where.periodEnd || {}),
        lte: new Date(filters.periodEnd),
      };
    }
    if (filters?.search) {
      where.OR = [
        { settlementNumber: { contains: filters.search, mode: 'insensitive' } },
        { driver: { name: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    const orderByMap: Record<string, any> = {
      period: { periodStart: filters?.sortOrder === 'asc' ? 'asc' : 'desc' },
      netPay: { netPayCents: filters?.sortOrder === 'asc' ? 'asc' : 'desc' },
      driverName: {
        driver: { name: filters?.sortOrder === 'asc' ? 'asc' : 'desc' },
      },
      status: { status: filters?.sortOrder === 'asc' ? 'asc' : 'desc' },
    };
    const orderBy = orderByMap[filters?.sortBy ?? ''] ?? { createdAt: 'desc' };

    const settlements = await this.prisma.settlement.findMany({
      where,
      include: {
        driver: { select: { driverId: true, name: true } },
        lineItems: true,
        deductions: true,
      },
      orderBy,
      ...clampPagination(pagination),
    });

    return settlements.map((s) => this.serializeDateFields(s));
  }

  /** Get single settlement with all relations */
  async findOne(tenantId: number, settlementId: string) {
    const settlement = await this.prisma.settlement.findFirst({
      where: { settlementId, tenantId },
      include: {
        driver: { select: { driverId: true, name: true } },
        lineItems: {
          include: {
            load: { select: { loadNumber: true, referenceNumber: true } },
            leg: { select: { legId: true, sequence: true } },
          },
        },
        deductions: true,
      },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');
    return this.serializeDateFields(settlement);
  }

  /** Add deduction to draft settlement */
  async addDeduction(
    tenantId: number,
    settlementId: string,
    data: {
      type: string;
      description: string;
      amountCents: number;
    },
  ) {
    const settlement = await this.findOne(tenantId, settlementId);
    if (settlement.status !== 'DRAFT') throw new BadRequestException('Can only add deductions to draft settlements');

    const totalDeductions = settlement.deductionsCents + data.amountCents;

    const [deduction] = await this.prisma.$transaction([
      this.prisma.settlementDeduction.create({
        data: {
          settlementId: settlement.id,
          type: data.type as any,
          description: data.description,
          amountCents: data.amountCents,
        },
      }),
      this.prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          deductionsCents: totalDeductions,
          netPayCents: settlement.grossPayCents - totalDeductions,
        },
      }),
    ]);

    return deduction;
  }

  /** Remove deduction from draft settlement */
  async removeDeduction(tenantId: number, settlementId: string, deductionId: number) {
    const settlement = await this.findOne(tenantId, settlementId);
    if (settlement.status !== 'DRAFT')
      throw new BadRequestException('Can only remove deductions from draft settlements');

    const deduction = settlement.deductions.find((d) => d.id === deductionId);
    if (!deduction) throw new NotFoundException('Deduction not found');

    const totalDeductions = settlement.deductionsCents - deduction.amountCents;

    await this.prisma.$transaction([
      this.prisma.settlementDeduction.delete({ where: { id: deductionId } }),
      this.prisma.settlement.update({
        where: { id: settlement.id },
        data: {
          deductionsCents: totalDeductions,
          netPayCents: settlement.grossPayCents - totalDeductions,
        },
      }),
    ]);
  }

  /** Approve settlement */
  async approve(tenantId: number, settlementId: string, userId?: number) {
    const settlement = await this.findOne(tenantId, settlementId);
    if (settlement.status !== 'DRAFT') throw new BadRequestException('Can only approve draft settlements');

    const updated = await this.prisma.settlement.update({
      where: { id: settlement.id },
      data: {
        status: 'APPROVED',
        approvedBy: userId || null,
        approvedAt: new Date(),
      },
      include: { driver: true, lineItems: true, deductions: true },
    });

    this.notificationTriggers
      .settlementReady(
        tenantId,
        settlement.settlementNumber,
        updated.driver?.name ?? 'Driver',
        `$${(settlement.netPayCents / 100).toFixed(2)}`,
      )
      .catch(() => {});

    await this.events.emit(SALLY_EVENTS.SETTLEMENT_APPROVED, tenantId, {
      entityId: settlementId,
      entityType: 'settlement',
      settlementNumber: updated.settlementNumber,
      driverId: updated.driverId,
    });

    return this.serializeDateFields(updated);
  }

  /** Mark settlement as paid */
  async markPaid(tenantId: number, settlementId: string) {
    const settlement = await this.findOne(tenantId, settlementId);
    if (settlement.status !== 'APPROVED') throw new BadRequestException('Can only mark approved settlements as paid');

    const updated = await this.prisma.settlement.update({
      where: { id: settlement.id },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
      include: { driver: true, lineItems: true, deductions: true },
    });

    // Notify the driver their payment has been processed
    const driverUser = await this.prisma.user.findFirst({
      where: { tenantId, driverId: settlement.driverId, isActive: true },
      select: { id: true },
    });
    if (driverUser) {
      this.notificationTriggers
        .driverPaymentProcessed(
          tenantId,
          driverUser.id,
          settlement.settlementNumber,
          `$${(settlement.netPayCents / 100).toFixed(2)}`,
        )
        .catch(() => {});
    }

    // Auto-sync bill payment to QB if settlement is already synced
    if (settlement.externalBillId) {
      const config = await this.prisma.integrationConfig.findFirst({
        where: {
          tenantId,
          integrationType: 'ACCOUNTING',
          isEnabled: true,
          status: 'ACTIVE',
        },
      });

      if (config) {
        const correlationId = requestContextStorage.getStore()?.requestId;
        const payload: AccountingSyncJobData = {
          tenantId,
          integrationId: config.integrationId,
          type: 'settlement-payment',
          entityId: settlementId,
          triggerSource: 'manual',
          correlationId,
        };
        await this.financeQueue.add(
          FINANCE_JOB_NAMES.SETTLEMENT_PAYMENT,
          buildJobEnvelope(payload, {
            tenantId: String(tenantId),
            source: 'api',
            correlationId,
          }),
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
        this.logger.log(`Queued settlement ${settlementId} bill payment for QB sync`);
      }
    }

    await this.events.emit(SALLY_EVENTS.SETTLEMENT_PAID, tenantId, {
      entityId: settlementId,
      entityType: 'settlement',
      settlementNumber: updated.settlementNumber,
      driverId: updated.driverId,
      paidAmount: updated.netPayCents,
    });

    return this.serializeDateFields(updated);
  }

  /** Void settlement */
  async voidSettlement(tenantId: number, settlementId: string) {
    const settlement = await this.findOne(tenantId, settlementId);
    if (settlement.status === 'VOID') throw new BadRequestException('Settlement is already voided');
    if (settlement.status === 'PAID') throw new BadRequestException('Cannot void a paid settlement');

    const updated = await this.prisma.settlement.update({
      where: { id: settlement.id },
      data: { status: 'VOID' },
      include: { driver: true, lineItems: true, deductions: true },
    });
    return this.serializeDateFields(updated);
  }

  /** Settlement summary stats with optional period filtering */
  async getSummary(tenantId: number, filters?: { periodStart?: string; periodEnd?: string }) {
    const periodWhere: any = {};
    if (filters?.periodStart) {
      periodWhere.periodStart = { gte: new Date(filters.periodStart) };
    }
    if (filters?.periodEnd) {
      periodWhere.periodEnd = { lte: new Date(filters.periodEnd) };
    }

    const [draftAgg, approvedAgg, paidAgg, driverCount, avgSettlement] = await Promise.all([
      this.prisma.settlement.aggregate({
        where: { tenantId, status: 'DRAFT', ...periodWhere },
        _count: true,
        _sum: { netPayCents: true },
      }),
      this.prisma.settlement.aggregate({
        where: { tenantId, status: 'APPROVED', ...periodWhere },
        _count: true,
        _sum: { netPayCents: true },
      }),
      this.prisma.settlement.aggregate({
        where: {
          tenantId,
          status: 'PAID',
          paidAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
          ...periodWhere,
        },
        _sum: { netPayCents: true },
      }),
      this.prisma.settlement.groupBy({
        by: ['driverId'],
        where: { tenantId, status: { not: 'VOID' }, ...periodWhere },
      }),
      this.prisma.settlement.aggregate({
        where: { tenantId, status: { not: 'VOID' }, ...periodWhere },
        _avg: { netPayCents: true },
      }),
    ]);

    return {
      pendingApproval: draftAgg._count,
      pendingApprovalCents: draftAgg._sum.netPayCents ?? 0,
      readyToPay: approvedAgg._count,
      readyToPayCents: approvedAgg._sum.netPayCents ?? 0,
      paidThisMonthCents: paidAgg._sum.netPayCents ?? 0,
      activeDrivers: driverCount.length,
      avgSettlementCents: Math.round(avgSettlement._avg.netPayCents ?? 0),
    };
  }

  /** Update settlement notes */
  async updateNotes(tenantId: number, settlementId: string, notes: string) {
    const settlement = await this.findOne(tenantId, settlementId);
    return this.prisma.settlement.update({
      where: { id: settlement.id },
      data: { notes },
    });
  }

  /** Preview batch calculation — returns driver eligibility and estimated pay without creating */
  async previewBatch(tenantId: number, data: { periodStart: string; periodEnd: string }) {
    const periodStart = new Date(data.periodStart);
    const periodEnd = new Date(data.periodEnd);

    const drivers = await this.prisma.driver.findMany({
      where: { tenantId, status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] } },
      include: { payStructures: { where: { isActive: true }, take: 1 } },
    });

    const results = await Promise.all(
      drivers.map(async (driver) => {
        const activePayStructure = driver.payStructures?.[0] ?? null;
        if (!activePayStructure) {
          return {
            driverId: driver.driverId,
            name: driver.name,
            payType: null,
            rate: null,
            loadCount: 0,
            estimatedPayCents: 0,
            eligible: false,
            warning: 'No pay structure configured',
          };
        }

        const loads = await this.prisma.load.findMany({
          where: {
            tenantId,
            driverId: driver.id,
            status: 'DELIVERED',
            deliveredAt: { gte: periodStart, lte: periodEnd },
          },
          include: {
            routePlanLoads: {
              include: { plan: { select: { totalDistanceMiles: true } } },
            },
          },
        });

        if (loads.length === 0) {
          return {
            driverId: driver.driverId,
            name: driver.name,
            payType: activePayStructure.type,
            rate: this.formatRate(activePayStructure),
            loadCount: 0,
            estimatedPayCents: 0,
            eligible: false,
            warning: 'No delivered loads in period',
          };
        }

        const ps = activePayStructure;
        let estimatedPay = 0;
        for (const load of loads) {
          const miles = load.routePlanLoads?.[0]?.plan?.totalDistanceMiles ?? 0;
          const revenue = load.rateCents ?? 0;
          switch (ps.type) {
            case 'PER_MILE':
              estimatedPay += Math.round(miles * (ps.ratePerMileCents ?? 0));
              break;
            case 'PERCENTAGE':
              estimatedPay += Math.round(revenue * (Number(ps.percentage ?? 0) / 100));
              break;
            case 'FLAT_RATE':
              estimatedPay += ps.flatRateCents ?? 0;
              break;
            case 'HYBRID':
              estimatedPay += (ps.hybridBaseCents ?? 0) + Math.round(revenue * (Number(ps.hybridPercent ?? 0) / 100));
              break;
          }
        }

        return {
          driverId: driver.driverId,
          name: driver.name,
          payType: ps.type,
          rate: this.formatRate(ps),
          loadCount: loads.length,
          estimatedPayCents: estimatedPay,
          eligible: true,
          warning: null,
        };
      }),
    );

    return { drivers: results };
  }

  /** Calculate settlements for multiple drivers */
  async batchCalculate(tenantId: number, data: { driverIds: string[]; periodStart: string; periodEnd: string }) {
    const settlements: any[] = [];
    const errors: Array<{ driverId: string; error: string }> = [];

    for (const driverId of data.driverIds) {
      try {
        const settlement = await this.calculate(tenantId, {
          driverId: driverId,
          periodStart: data.periodStart,
          periodEnd: data.periodEnd,
        });
        settlements.push(settlement);
      } catch (error: any) {
        errors.push({ driverId: driverId, error: error.message });
      }
    }

    return {
      settlements,
      errors,
      total: data.driverIds.length,
      successCount: settlements.length,
    };
  }

  /** Approve multiple settlements in a single query */
  async batchApprove(tenantId: number, settlementIds: string[], userId?: number) {
    const { count } = await this.prisma.settlement.updateMany({
      where: {
        tenantId,
        settlementId: { in: settlementIds },
        status: 'DRAFT',
      },
      data: {
        status: 'APPROVED',
        approvedBy: userId || null,
        approvedAt: new Date(),
      },
    });
    return { approved: count, skipped: settlementIds.length - count };
  }

  /** Mark multiple settlements as paid in a single query */
  async batchPay(tenantId: number, settlementIds: string[]) {
    const { count } = await this.prisma.settlement.updateMany({
      where: {
        tenantId,
        settlementId: { in: settlementIds },
        status: 'APPROVED',
      },
      data: {
        status: 'PAID',
        paidAt: new Date(),
      },
    });
    return { paid: count, skipped: settlementIds.length - count };
  }

  /** Void multiple settlements in a single query */
  async batchVoid(tenantId: number, settlementIds: string[]) {
    const { count } = await this.prisma.settlement.updateMany({
      where: {
        tenantId,
        settlementId: { in: settlementIds },
        status: { notIn: ['VOID', 'PAID'] },
      },
      data: { status: 'VOID' },
    });
    return { voided: count, skipped: settlementIds.length - count };
  }

  /** Format pay structure rate as display string */
  private formatRate(ps: {
    type: string;
    ratePerMileCents?: number | null;
    percentage?: Prisma.Decimal | number | null;
    flatRateCents?: number | null;
    hybridBaseCents?: number | null;
    hybridPercent?: Prisma.Decimal | number | null;
  }): string {
    switch (ps.type) {
      case 'PER_MILE':
        return `$${((ps.ratePerMileCents ?? 0) / 100).toFixed(2)}/mi`;
      case 'PERCENTAGE':
        return `${Number(ps.percentage ?? 0)}%`;
      case 'FLAT_RATE':
        return `$${((ps.flatRateCents ?? 0) / 100).toFixed(2)}/load`;
      case 'HYBRID':
        return `$${((ps.hybridBaseCents ?? 0) / 100).toFixed(2)} + ${Number(ps.hybridPercent ?? 0)}%`;
      default:
        return '';
    }
  }

  /** Generate settlement number: STL-YYYY-WNN-LASTNAME-SEQ */
  private async generateSettlementNumber(tenantId: number, driverLastName: string, periodStart: Date): Promise<string> {
    const year = periodStart.getFullYear();
    const weekNum = Math.ceil(((periodStart.getTime() - new Date(year, 0, 1).getTime()) / 86400000 + 1) / 7);
    const weekStr = `W${String(weekNum).padStart(2, '0')}`;
    const nameStr = driverLastName.toUpperCase().slice(0, 6);
    const prefix = `STL-${year}-${weekStr}-${nameStr}`;

    const count = await this.prisma.settlement.count({
      where: { tenantId, settlementNumber: { startsWith: prefix } },
    });

    return count > 0 ? `${prefix}-${count + 1}` : prefix;
  }

  /** Serialize @db.Date fields as YYYY-MM-DD strings to prevent timezone shift */
  private serializeDateFields<T extends Record<string, any>>(settlement: T): T {
    return {
      ...settlement,
      periodStart:
        settlement.periodStart instanceof Date
          ? settlement.periodStart.toISOString().split('T')[0]
          : settlement.periodStart,
      periodEnd:
        settlement.periodEnd instanceof Date ? settlement.periodEnd.toISOString().split('T')[0] : settlement.periodEnd,
    };
  }

  // ---------------------------------------------------------------------------
  // Desk fan-out query
  //
  // Narrow projection for `settlement_review` — DRAFT settlements with
  // headline totals. Shared with the MCP tool `get-draft-settlements`.
  // ---------------------------------------------------------------------------

  /** Draft settlements with headline totals for the Desk `settlement_review` responsibility. */
  async findDrafts(tenantId: number, options: { limit?: number } = {}): Promise<DraftSettlementRow[]> {
    const settlements = await this.prisma.settlement.findMany({
      where: { tenantId, status: 'DRAFT' },
      select: {
        settlementId: true,
        settlementNumber: true,
        driver: { select: { driverId: true, name: true } },
        periodStart: true,
        periodEnd: true,
        grossPayCents: true,
        deductionsCents: true,
        netPayCents: true,
        createdAt: true,
        _count: { select: { lineItems: true } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: options.limit ?? 50,
    });
    const now = Date.now();
    return settlements.map((s) => ({
      settlementId: s.settlementId,
      settlementNumber: s.settlementNumber,
      driverId: s.driver?.driverId ?? null,
      driverName: s.driver?.name ?? null,
      periodStart: toUtcCalendarDate(s.periodStart),
      periodEnd: toUtcCalendarDate(s.periodEnd),
      grossPayCents: s.grossPayCents,
      deductionsCents: s.deductionsCents,
      netPayCents: s.netPayCents,
      lineItemCount: s._count.lineItems,
      createdAt: s.createdAt.toISOString(),
      daysSinceCreated: Math.max(0, Math.floor((now - s.createdAt.getTime()) / 86_400_000)),
    }));
  }
}

/** Row shape for `SettlementsService.findDrafts`. */
export interface DraftSettlementRow {
  settlementId: string;
  settlementNumber: string;
  driverId: string | null;
  driverName: string | null;
  periodStart: string;
  periodEnd: string;
  grossPayCents: number;
  deductionsCents: number;
  netPayCents: number;
  lineItemCount: number;
  createdAt: string;
  daysSinceCreated: number;
}
