import { Injectable, NotFoundException } from '@nestjs/common';
import { LoadStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { formatLoadResponse } from '../utils/format-load-response';
import { LoadCreationService } from './load-creation.service';

@Injectable()
export class CustomerLoadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loadCreationService: LoadCreationService,
  ) {}

  /**
   * Find loads scoped to a specific customer ID
   */
  async findByCustomerId(customerId: number, tenantId?: number) {
    // Only return loads that are customer-visible (not internal draft/pending states)
    const CUSTOMER_VISIBLE_STATUSES: LoadStatus[] = [
      LoadStatus.ASSIGNED,
      LoadStatus.IN_TRANSIT,
      LoadStatus.DELIVERED,
      LoadStatus.ON_HOLD,
      LoadStatus.CANCELLED,
    ];
    const loads = await this.prisma.load.findMany({
      where: {
        customerId,
        isActive: true,
        status: { in: CUSTOMER_VISIBLE_STATUSES },
        ...(tenantId ? { tenantId } : {}),
      },
      include: {
        stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
        routePlanLoads: {
          include: {
            plan: { select: { estimatedArrival: true, isActive: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return loads.map((load) => {
      const firstPickup = load.stops.find((s) => s.actionType === 'pickup');
      const lastDelivery = [...load.stops].reverse().find((s) => s.actionType === 'delivery');
      const activePlan = load.routePlanLoads.map((rpl) => rpl.plan).find((p) => p.isActive);

      return {
        loadNumber: load.loadNumber,
        referenceNumber: load.referenceNumber ?? null,
        status: load.status,
        customerName: load.customerName,
        estimatedDelivery: activePlan?.estimatedArrival?.toISOString() || null,
        originCity: firstPickup?.stop?.city || null,
        originState: firstPickup?.stop?.state || null,
        destinationCity: lastDelivery?.stop?.city || null,
        destinationState: lastDelivery?.stop?.state || null,
        createdAt: load.createdAt.toISOString(),
      };
    });
  }

  /**
   * Find a single load for a customer (validates customer ownership)
   */
  async findOneForCustomer(loadNumber: string, customerId: number) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, customerId },
      include: {
        stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } },
      },
    });
    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);
    // Filter out internal exchange stops — customers should not see relay handoff points
    const filteredLoad = {
      ...load,
      stops: load.stops.filter((s) => s.actionType !== 'exchange'),
    };
    return formatLoadResponse(filteredLoad);
  }

  /**
   * Create a load from customer portal request (creates as draft)
   */
  async createFromCustomerRequest(data: {
    tenantId: number;
    customerId: number;
    customerName: string;
    pickupAddress: string;
    pickupCity: string;
    pickupState: string;
    deliveryAddress: string;
    deliveryCity: string;
    deliveryState: string;
    pickupDate?: string;
    deliveryDate?: string;
    weightLbs: number;
    commodityType?: string;
    notes?: string;
  }) {
    const loadNumber = `REQ-${Date.now().toString(36).toUpperCase()}`;

    return this.loadCreationService.create({
      tenantId: data.tenantId,
      loadNumber,
      weightLbs: data.weightLbs,
      commodityType: data.commodityType || 'general',
      specialRequirements: data.notes || undefined,
      customerName: data.customerName,
      customerId: data.customerId,
      intakeSource: 'portal',
      intakeMetadata: { requested_by: 'customer_portal' },
      status: 'DRAFT',
      stops: [
        {
          stopId: `stop_${Date.now()}_pickup`,
          sequenceOrder: 1,
          actionType: 'pickup',
          estimatedDockHours: 2,
          earliestArrival: data.pickupDate || undefined,
          name: data.pickupAddress,
          address: data.pickupAddress,
          city: data.pickupCity,
          state: data.pickupState,
        },
        {
          stopId: `stop_${Date.now()}_delivery`,
          sequenceOrder: 2,
          actionType: 'delivery',
          estimatedDockHours: 2,
          earliestArrival: data.deliveryDate || undefined,
          name: data.deliveryAddress,
          address: data.deliveryAddress,
          city: data.deliveryCity,
          state: data.deliveryState,
        },
      ],
    });
  }
}
