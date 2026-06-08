import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RoutePlanStatus } from '@prisma/client';
import { ACTIVE_LOAD_STATUSES, DocumentStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const DOCUMENT_STATUS = DocumentStatusSchema.enum;
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_2M } from '../../../../constants/cache.constants';
import { clampPagination, MAX_PAGE_LIMIT } from '../../../../shared/utils/pagination';
import { formatLoadResponse } from '../utils/format-load-response';

const BOARD_SIZE_WARN_THRESHOLD = 400;

@Injectable()
export class LoadQueryService {
  private readonly logger = new Logger(LoadQueryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  /**
   * Find all loads with optional filtering, search, sort, and pagination
   */
  async findAll(
    tenantId: number,
    filters?: {
      status?: string;
      customerName?: string;
      driverId?: string;
      equipmentType?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
    pagination?: {
      limit?: number;
      offset?: number;
    },
  ) {
    const where: any = { tenantId };

    if (filters?.status) {
      // Normalize to uppercase to match Prisma LoadStatus enum
      // (API accepts case-insensitive input for robustness)
      const normalized = filters.status.toUpperCase();
      where.status = normalized.includes(',') ? { in: normalized.split(',') } : normalized;
    }

    if (filters?.customerName) {
      where.customerName = {
        contains: filters.customerName,
        mode: 'insensitive' as const,
      };
    }

    if (filters?.equipmentType) {
      where.requiredEquipmentType = filters.equipmentType as any;
    }

    // Driver filter: resolve string driverId to numeric DB id
    if (filters?.driverId) {
      const driver = await this.prisma.driver.findFirst({
        where: { driverId: filters.driverId },
      });
      if (driver) {
        where.driverId = driver.id;
      } else {
        // No matching driver — return empty results
        return {
          data: [],
          total: 0,
          limit: pagination?.limit || 50,
          offset: pagination?.offset || 0,
        };
      }
    }

    // Date range filter
    if (filters?.dateFrom || filters?.dateTo) {
      const dateFilter: any = {};
      if (filters.dateFrom) {
        dateFilter.gte = new Date(filters.dateFrom);
      }
      if (filters.dateTo) {
        // Add 1 day to make the end date inclusive
        const endDate = new Date(filters.dateTo);
        endDate.setDate(endDate.getDate() + 1);
        dateFilter.lt = endDate;
      }

      // Use deliveredAt for delivered loads, pickupDate for others
      if (filters?.status === 'DELIVERED') {
        where.deliveredAt = dateFilter;
      } else if (filters?.status === 'CANCELLED') {
        where.cancelledAt = dateFilter;
      } else {
        where.pickupDate = dateFilter;
      }
    }

    // Full-text search across multiple fields
    if (filters?.search) {
      const searchTerm = filters.search;
      where.OR = [
        {
          loadNumber: {
            contains: searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          customerName: {
            contains: searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          referenceNumber: {
            contains: searchTerm,
            mode: 'insensitive' as const,
          },
        },
        {
          driver: {
            name: {
              contains: searchTerm,
              mode: 'insensitive' as const,
            },
          },
        },
      ];
    }

    // Sort configuration
    const sortFieldMap: Record<string, string> = {
      createdAt: 'createdAt',
      pickupDate: 'pickupDate',
      deliveryDate: 'deliveryDate',
      customerName: 'customerName',
      rateCents: 'rateCents',
      deliveredAt: 'deliveredAt',
    };
    const sortField = sortFieldMap[filters?.sortBy || ''] || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';

    const [loads, total] = await Promise.all([
      this.prisma.load.findMany({
        where,
        include: {
          stops: {
            include: { stop: { select: { lat: true, lon: true } } },
          },
          driver: { select: { name: true, driverId: true } },
          vehicle: { select: { unitNumber: true, vehicleId: true } },
          legs: {
            select: {
              legId: true,
              sequence: true,
              status: true,
              driverId: true,
              actualMiles: true,
              pickedUpAt: true,
              deliveredAt: true,
              driver: { select: { name: true, driverId: true } },
              vehicle: { select: { unitNumber: true, vehicleId: true } },
              originStop: { select: { earliestArrival: true } },
              destStop: { select: { earliestArrival: true } },
            },
            orderBy: { sequence: 'asc' },
          },
          routePlanLoads: {
            where: { plan: { status: { in: [RoutePlanStatus.ACTIVE, RoutePlanStatus.DRAFT] } } },
            select: {
              plan: { select: { planId: true, status: true, isActive: true } },
            },
            orderBy: { plan: { createdAt: 'desc' } },
            take: 1,
          },
          settlementLineItems: {
            select: {
              payAmountCents: true,
              settlement: { select: { status: true, paidAt: true } },
            },
          },
          trip: { select: { tripId: true, loadCount: true } },
        },
        orderBy: { [sortField]: sortOrder },
        ...clampPagination(pagination),
      }),
      this.prisma.load.count({ where }),
    ]);

    const data = loads.map((load) => {
      const legs = (load as any).legs as
        | Array<{
            pickedUpAt: Date | null;
            deliveredAt: Date | null;
            originStop?: { earliestArrival: string | null } | null;
            destStop?: { earliestArrival: string | null } | null;
          }>
        | undefined;
      const pickupTime = derivePickupTime(load, legs);
      const deliveryTime = deriveDeliveryTime(load, legs);

      return {
        id: load.id,
        loadNumber: load.loadNumber,
        status: load.status,
        customerName: load.customerName,
        stopCount: load.stops.length,
        missingCoordinates: load.stops.filter((ls: any) => !ls.stop?.lat || !ls.stop?.lon).length,
        weightLbs: load.weightLbs,
        commodityType: load.commodityType,
        requiredEquipmentType: (load as any).requiredEquipmentType ?? null,
        referenceNumber: load.referenceNumber,
        rateCents: load.rateCents,
        billingStatus: load.billingStatus ?? null,
        pieces: load.pieces,
        intakeSource: load.intakeSource,
        externalLoadId: load.externalLoadId,
        externalSource: load.externalSource,
        lastSyncedAt: load.lastSyncedAt?.toISOString(),
        pickupDate: load.pickupDate ? load.pickupDate.toISOString().split('T')[0] : null,
        deliveryDate: load.deliveryDate ? load.deliveryDate.toISOString().split('T')[0] : null,
        pickupTime,
        deliveryTime,
        originCity: load.originCity || null,
        originState: load.originState || null,
        destinationCity: load.destinationCity || null,
        destinationState: load.destinationState || null,
        assignedAt: load.assignedAt?.toISOString() || null,
        inTransitAt: load.inTransitAt?.toISOString() || null,
        deliveredAt: load.deliveredAt?.toISOString() || null,
        routePlan: load.routePlanLoads?.[0]?.plan
          ? {
              planId: load.routePlanLoads[0].plan.planId,
              status: load.routePlanLoads[0].plan.status,
            }
          : null,
        driverName: load.driver?.name || null,
        vehicleUnitNumber: load.vehicle?.unitNumber || null,
        driverPayCents:
          load.settlementLineItems?.reduce((sum: number, li: any) => sum + (li.payAmountCents ?? 0), 0) || null,
        payStatus: this.derivePayStatus(load.settlementLineItems),
        isRelay: load.isRelay ?? false,
        tripId: (load as any).trip?.tripId ?? null,
        tripOrder: load.tripOrder ?? null,
        tripLoadCount: (load as any).trip?.loadCount ?? null,
        ...(load.isRelay && (load as any).legs?.length > 0
          ? {
              legs: (load as any).legs.map((leg: any) => ({
                legId: leg.legId,
                sequence: leg.sequence,
                status: leg.status,
                driverId: leg.driverId,
                actualMiles: leg.actualMiles,
                driverName: leg.driver?.name || null,
                vehicleUnitNumber: leg.vehicle?.unitNumber || null,
              })),
            }
          : {}),
        activeLeg:
          load.isRelay && (load as any).legs?.length > 0
            ? (() => {
                const legs = (load as any).legs;
                const active =
                  legs.find((l: any) => l.status !== 'DELIVERED' && l.status !== 'CANCELLED') ?? legs[legs.length - 1];
                return active
                  ? {
                      legId: active.legId,
                      sequence: active.sequence,
                      status: active.status,
                      driverName: active.driver?.name ?? null,
                      vehicleUnitNumber: active.vehicle?.unitNumber ?? null,
                      actualMiles: active.actualMiles ?? null,
                    }
                  : null;
              })()
            : undefined,
      };
    });

    return {
      data,
      total,
      limit: pagination?.limit || 50,
      offset: pagination?.offset || 0,
    };
  }

  /**
   * Returns every load in an active status for the dispatcher kanban board.
   *
   * Active = ACTIVE_LOAD_STATUSES (DRAFT, PENDING, ASSIGNED, IN_TRANSIT, ON_HOLD).
   * The kanban needs the complete set — pagination here would silently drop
   * cards. Capped at MAX_PAGE_LIMIT (the platform-wide ceiling for unbounded
   * pagination per §22), with a warn log if a tenant approaches the cap so
   * we learn before hitting it in production.
   */
  async findActiveBoard(tenantId: number) {
    const result = await this.findAll(
      tenantId,
      { status: ACTIVE_LOAD_STATUSES.join(',') },
      { limit: MAX_PAGE_LIMIT, offset: 0 },
    );

    if (result.total >= BOARD_SIZE_WARN_THRESHOLD) {
      this.logger.warn(
        `Tenant ${tenantId} active load board has ${result.total} loads (threshold ${BOARD_SIZE_WARN_THRESHOLD}, hard cap ${MAX_PAGE_LIMIT}). Consider closing out stale loads or moving to a paginated view.`,
      );
    }

    return result;
  }

  /**
   * Find one load by ID with stops.
   * Draft/pending loads skip cache — they're actively edited and stop
   * location edits (stopsApi.update) don't emit LOAD_UPDATED events.
   */
  async findOne(loadNumber: string, tenantId?: number) {
    if (tenantId !== undefined) {
      // Quick status check to decide whether to use cache
      const statusRow = await this.prisma.load.findFirst({
        where: { loadNumber, ...(tenantId !== undefined && { tenantId }) },
        select: { status: true },
      });
      const editable = statusRow?.status === 'DRAFT' || statusRow?.status === 'PENDING';
      if (!editable) {
        return this.cache.getOrSet(
          buildKey('sally:loads', 'detail', String(tenantId), loadNumber),
          () => this.computeFindOne(loadNumber, tenantId),
          CACHE_TTL_WARM_2M,
        );
      }
    }
    return this.computeFindOne(loadNumber, tenantId);
  }

  private async computeFindOne(loadNumber: string, tenantId?: number) {
    const where: any = { loadNumber };
    if (tenantId !== undefined) {
      where.tenantId = tenantId;
    }

    const load = await this.prisma.load.findFirst({
      where,
      include: {
        driver: { select: { name: true, driverId: true, phone: true } },
        vehicle: {
          select: {
            unitNumber: true,
            vehicleId: true,
            make: true,
            model: true,
          },
        },
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        legs: {
          select: {
            legId: true,
            sequence: true,
            status: true,
            driverId: true,
            vehicleId: true,
            actualMiles: true,
            assignedAt: true,
            pickedUpAt: true,
            deliveredAt: true,
            originStopId: true,
            destStopId: true,
            driver: { select: { name: true, driverId: true } },
            vehicle: { select: { unitNumber: true, vehicleId: true } },
          },
          orderBy: { sequence: 'asc' },
        },
        routePlanLoads: {
          where: { plan: { status: { in: [RoutePlanStatus.ACTIVE, RoutePlanStatus.DRAFT] } } },
          select: {
            plan: { select: { planId: true, status: true, isActive: true } },
          },
          orderBy: { plan: { createdAt: 'desc' } },
          take: 1,
        },
        trip: { select: { tripId: true, loadCount: true } },
        invoices: {
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            totalCents: true,
            balanceCents: true,
            dueDate: true,
            paidDate: true,
            createdAt: true,
          },
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    // Enrich stops with uploaded document records so consumers (driver app)
    // can check both text fields (bolNumber/podSignedBy) AND Document records.
    const enrichedLoad = {
      ...load,
      stops: await this.enrichStopsWithDocuments(load.stops, load.tenantId),
    };

    return formatLoadResponse(enrichedLoad);
  }

  /**
   * Batch-fetch confirmed Document records for an array of LoadStops
   * and attach `uploadedDocuments` to each stop. No migration needed —
   * uses the existing `relatedStopId` FK on Document.
   */
  async enrichStopsWithDocuments(stops: any[], tenantId: number): Promise<any[]> {
    if (stops.length === 0) return stops;

    const stopIds = stops.map((s) => s.id);
    const docs = await this.prisma.document.findMany({
      where: {
        entityType: 'load_stop',
        relatedStopId: { in: stopIds },
        status: DOCUMENT_STATUS.CONFIRMED,
        tenantId,
      },
      select: { relatedStopId: true, documentType: true, id: true },
    });

    const docsByStop = new Map<number, { documentType: string; id: number }[]>();
    for (const doc of docs) {
      if (doc.relatedStopId) {
        const list = docsByStop.get(doc.relatedStopId) || [];
        list.push({ documentType: doc.documentType, id: doc.id });
        docsByStop.set(doc.relatedStopId, list);
      }
    }

    return stops.map((s) => ({
      ...s,
      uploadedDocuments: docsByStop.get(s.id) || [],
    }));
  }

  /**
   * Derive pay status from settlement line items
   */
  private derivePayStatus(lineItems?: { settlement: { status: string; paidAt: Date | null } }[]): string | null {
    if (!lineItems?.length) return null;
    const statuses = lineItems.map((li) => li.settlement.status);
    if (statuses.every((s) => s === 'PAID')) return 'paid';
    if (statuses.some((s) => s === 'APPROVED')) return 'approved';
    if (statuses.some((s) => s === 'DRAFT')) return 'pending';
    return null;
  }

  /**
   * Compute denormalized fields from stops for fast display/filtering.
   * Public because the write-side methods still on LoadsService (create,
   * updateDraft, etc.) call this via facade.
   */
  async computeDenormalizedFields(loadDbId: number) {
    const stops = await this.prisma.loadStop.findMany({
      where: { loadId: loadDbId },
      include: { stop: true },
      orderBy: { sequenceOrder: 'asc' },
    });

    const firstPickup = stops.find((s) => s.actionType === 'pickup');
    const lastDelivery = [...stops].reverse().find((s) => s.actionType === 'delivery');

    const updateData: any = {};

    if (firstPickup) {
      updateData.pickupDate = firstPickup.appointmentDate || null;
      updateData.originCity = firstPickup.stop?.city || null;
      updateData.originState = firstPickup.stop?.state || null;
    }

    if (lastDelivery) {
      updateData.deliveryDate = lastDelivery.appointmentDate || null;
      updateData.destinationCity = lastDelivery.stop?.city || null;
      updateData.destinationState = lastDelivery.stop?.state || null;
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.load.update({
        where: { id: loadDbId },
        data: updateData,
      });
    }
  }
}

// HH:mm in UTC so the list matches pickupDate (also stored as a calendar date).
function toHHmmUTC(dt: Date | null | undefined): string | null {
  if (!dt) return null;
  const h = String(dt.getUTCHours()).padStart(2, '0');
  const m = String(dt.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function derivePickupTime(
  load: { isRelay?: boolean | null; stops: any[] },
  legs:
    | Array<{
        pickedUpAt: Date | null;
        originStop?: { earliestArrival: string | null } | null;
      }>
    | undefined,
): string | null {
  if (load.isRelay && legs?.length) {
    const first = legs[0];
    return toHHmmUTC(first.pickedUpAt) ?? first.originStop?.earliestArrival ?? null;
  }
  return (
    load.stops
      .filter((s: any) => s.actionType === 'pickup')
      .sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder)[0]?.earliestArrival ?? null
  );
}

function deriveDeliveryTime(
  load: { isRelay?: boolean | null; stops: any[] },
  legs:
    | Array<{
        deliveredAt: Date | null;
        destStop?: { earliestArrival: string | null } | null;
      }>
    | undefined,
): string | null {
  if (load.isRelay && legs?.length) {
    const last = legs[legs.length - 1];
    return toHHmmUTC(last.deliveredAt) ?? last.destStop?.earliestArrival ?? null;
  }
  return (
    load.stops
      .filter((s: any) => s.actionType === 'delivery')
      .sort((a: any, b: any) => b.sequenceOrder - a.sequenceOrder)[0]?.earliestArrival ?? null
  );
}
