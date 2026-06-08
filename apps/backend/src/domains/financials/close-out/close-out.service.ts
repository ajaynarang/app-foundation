import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_60S } from '../../../constants/cache.constants';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { BillingReadinessService } from './billing-readiness.service';
import { LoadEventsService } from '../../fleet/loads/services/load-events.service';

const VALID_BILLING_STATUSES = ['PENDING_DOCUMENTS', 'READY_FOR_REVIEW', 'APPROVED'] as const;

type BillingStatusFilter = (typeof VALID_BILLING_STATUSES)[number];

@Injectable()
export class CloseOutService {
  private readonly logger = new Logger(CloseOutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly readinessService: BillingReadinessService,
    private readonly loadEventsService: LoadEventsService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Get close-out summary counts using targeted count() queries.
   * Called frequently (sidebar badge, widget, 30s polling) — must be lightweight.
   */
  async getSummary(tenantId: number) {
    const cacheKey = buildKey('sally:closeout', 'summary', tenantId);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const settings = await this.prisma.fleetOperationsSettings.findUnique({
          where: { tenantId },
        });
        const gracePeriodHours = settings?.podGracePeriodHours ?? 48;

        const baseWhere: Record<string, any> = {
          tenantId,
          status: 'DELIVERED',
        };

        const graceDeadline = new Date(Date.now() - gracePeriodHours * 60 * 60 * 1000);

        const [needsDocs, readyForReview, readyToBill, overduePods, readyToBillTotal] = await Promise.all([
          this.prisma.load.count({
            where: { ...baseWhere, billingStatus: 'PENDING_DOCUMENTS' },
          }),
          this.prisma.load.count({
            where: { ...baseWhere, billingStatus: 'READY_FOR_REVIEW' },
          }),
          this.prisma.load.count({
            where: { ...baseWhere, billingStatus: 'APPROVED' },
          }),
          this.prisma.load.count({
            where: {
              ...baseWhere,
              billingStatus: 'PENDING_DOCUMENTS',
              deliveredAt: { lt: graceDeadline },
            },
          }),
          this.prisma.loadCharge.aggregate({
            where: {
              isBillable: true,
              load: { ...baseWhere, billingStatus: 'APPROVED' },
            },
            _sum: { totalCents: true },
          }),
        ]);

        return {
          needsDocs,
          readyForReview,
          readyToBill,
          readyToBillTotalCents: readyToBillTotal._sum.totalCents ?? 0,
          overduePods,
          total: needsDocs + readyForReview + readyToBill,
        };
      },
      CACHE_TTL_HOT_60S,
    );
  }

  /**
   * List loads in close-out queue with filtering.
   */
  async list(
    tenantId: number,
    params?: {
      billingStatus?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Record<string, any> = {
      tenantId,
      status: 'DELIVERED',
      billingStatus: {
        in: ['PENDING_DOCUMENTS', 'READY_FOR_REVIEW', 'APPROVED'],
      },
    };

    if (params?.billingStatus) {
      if (!VALID_BILLING_STATUSES.includes(params.billingStatus as BillingStatusFilter)) {
        throw new BadRequestException(`Invalid billingStatus. Allowed: ${VALID_BILLING_STATUSES.join(', ')}`);
      }
      where.billingStatus = params.billingStatus;
    }

    if (params?.search) {
      where.OR = [
        { loadNumber: { contains: params.search, mode: 'insensitive' } },
        { customerName: { contains: params.search, mode: 'insensitive' } },
        { referenceNumber: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    if (params?.dateFrom || params?.dateTo) {
      where.deliveredAt = {};
      if (params.dateFrom) where.deliveredAt.gte = new Date(params.dateFrom);
      if (params.dateTo) {
        const to = new Date(params.dateTo);
        to.setHours(23, 59, 59, 999);
        where.deliveredAt.lte = to;
      }
    }

    const take = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const skip = Math.max(params?.offset ?? 0, 0);

    const [loads, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        include: {
          stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
          charges: true,
          driver: true,
          vehicle: true,
        },
        orderBy: [{ deliveredAt: 'asc' }],
        take,
        skip,
      }),
      this.prisma.load.count({ where }),
    ]);

    return {
      loads: loads.map((load) => this.formatCloseOutLoad(load)),
      total,
    };
  }

  /**
   * Approve a load for billing.
   * Validates document compliance server-side and uses optimistic locking.
   */
  async approveForBilling(tenantId: number, loadNumber: string, userId?: number, overrideReason?: string) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });

    if (!load) throw new NotFoundException('Load not found');
    if (load.status !== 'DELIVERED') {
      throw new BadRequestException('Load must be delivered to approve for billing');
    }
    if (load.billingStatus === 'INVOICED') {
      throw new BadRequestException('Load is already invoiced');
    }
    if (load.billingStatus === 'APPROVED') {
      throw new BadRequestException('Load is already approved');
    }

    // Use BillingReadinessService instead of raw compliance check
    const readiness = await this.readinessService.evaluate(load.loadNumber, tenantId);

    if (readiness.score < 100) {
      // Check if override is allowed
      if (!readiness.overrideAllowed || !overrideReason) {
        const missingLabels = readiness.items
          .filter((i) => i.enforcement !== 'recommended' && i.status !== 'satisfied')
          .map((i) => i.label)
          .join(', ');
        throw new BadRequestException(`Cannot approve: missing ${missingLabels}`);
      }

      if (!userId) {
        throw new BadRequestException('User ID is required for billing override');
      }

      // Override: record the audit trail
      await this.prisma.billingOverride.create({
        data: {
          loadId: load.id,
          tenantId,
          overriddenBy: userId,
          reason: overrideReason,
          missingItems: readiness.items
            .filter((i) => i.enforcement !== 'recommended' && i.status !== 'satisfied')
            .map((i) => ({ type: i.type, label: i.label, status: i.status })),
        },
      });

      this.logger.warn(`Load ${loadNumber} approved with override by user ${userId}: ${overrideReason}`);
    }

    // Optimistic locking: only update if status hasn't changed since our check
    const result = await this.prisma.load.updateMany({
      where: {
        id: load.id,
        billingStatus: { in: ['PENDING_DOCUMENTS', 'READY_FOR_REVIEW'] },
      },
      data: { billingStatus: 'APPROVED' },
    });

    if (result.count === 0) {
      throw new BadRequestException('Load status changed — refresh and try again');
    }

    await this.events.emit(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED, tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
      billingStatus: 'APPROVED',
    });

    await this.events.emit(SALLY_EVENTS.CLOSEOUT_COMPLETED, tenantId, {
      entityId: load.loadNumber,
      entityType: 'closeout',
      loadNumber: load.loadNumber,
    });

    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'billing_approved',
        fromValue: load.billingStatus ?? 'unknown',
        toValue: 'APPROVED',
        description: overrideReason ? `Approved with override: ${overrideReason}` : 'Approved for billing',
        userId,
      })
      .catch((err) => this.logger.error(`Failed to log approval event: ${err.message}`));

    await this.cache.del(buildKey('sally:closeout', 'summary', tenantId));

    this.logger.log(`Load ${loadNumber} approved for billing`);
    return { loadNumber: load.loadNumber, billingStatus: 'APPROVED' };
  }

  /**
   * Send an approved load back to READY_FOR_REVIEW so charges can be edited.
   */
  async sendBack(tenantId: number, loadNumber: string, reason: string, userId?: number) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
    });

    if (!load) throw new NotFoundException('Load not found');
    if (load.billingStatus === 'INVOICED') {
      throw new BadRequestException('Cannot send back: invoice already generated. Void the invoice first.');
    }
    if (load.billingStatus !== 'APPROVED') {
      throw new BadRequestException('Load is not in approved status');
    }

    const result = await this.prisma.load.updateMany({
      where: {
        id: load.id,
        billingStatus: 'APPROVED',
      },
      data: { billingStatus: 'READY_FOR_REVIEW' },
    });

    if (result.count === 0) {
      throw new BadRequestException('Load status changed — refresh and try again');
    }

    await this.events.emit(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED, tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
      billingStatus: 'READY_FOR_REVIEW',
    });

    await this.events.emit(SALLY_EVENTS.CLOSEOUT_REOPENED, tenantId, {
      entityId: load.loadNumber,
      entityType: 'closeout',
      loadNumber: load.loadNumber,
    });

    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'billing_send_back',
        fromValue: 'APPROVED',
        toValue: 'READY_FOR_REVIEW',
        description: reason,
        userId,
      })
      .catch((err) => this.logger.error(`Failed to log send-back event: ${err.message}`));

    await this.cache.del(buildKey('sally:closeout', 'summary', tenantId));

    this.logger.log(`Load ${loadNumber} sent back from APPROVED to READY_FOR_REVIEW`);
    return { loadNumber, billingStatus: 'READY_FOR_REVIEW' };
  }

  private formatCloseOutLoad(load: any) {
    const chargeTotalCents = load.charges?.reduce((sum: number, c: any) => sum + c.totalCents, 0) ?? 0;

    return {
      id: load.id,
      loadNumber: load.loadNumber,
      referenceNumber: load.referenceNumber ?? null,
      status: load.status,
      billingStatus: load.billingStatus,
      customerName: load.customerName,
      customerId: load.customerId,
      rateCents: load.rateCents,
      chargeTotalCents: chargeTotalCents,
      originCity: load.originCity,
      originState: load.originState,
      destinationCity: load.destinationCity,
      destinationState: load.destinationState,
      deliveredAt: load.deliveredAt?.toISOString() ?? null,
      driverName: load.driver?.name ?? null,
      driverId: load.driverId,
      vehicleNumber: load.vehicle?.unitNumber ?? null,
      stops:
        load.stops?.map((s: any) => ({
          id: s.id,
          sequenceOrder: s.sequenceOrder,
          actionType: s.actionType,
          status: s.status,
          completedAt: s.completedAt?.toISOString() ?? null,
        })) ?? [],
      charges:
        load.charges?.map((c: any) => ({
          id: c.id,
          chargeType: c.chargeType,
          description: c.description,
          quantity: c.quantity,
          unitPriceCents: c.unitPriceCents,
          totalCents: c.totalCents,
          isBillable: c.isBillable,
          isPayable: c.isPayable,
        })) ?? [],
    };
  }
}
