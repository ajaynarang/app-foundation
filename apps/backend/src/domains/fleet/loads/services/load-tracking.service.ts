import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { LoadShareLinkService } from './load-share-link.service';

@Injectable()
export class LoadTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shareLinks: LoadShareLinkService,
  ) {}

  async getPublicTracking(token: string) {
    const link = await this.shareLinks.resolveActive(token);
    if (!link) {
      throw new NotFoundException('Tracking information not found');
    }

    const load = await this.prisma.load.findFirst({
      where: { id: link.loadId },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        tenant: { select: { companyName: true } },
        routePlanLoads: {
          include: {
            plan: {
              select: {
                estimatedArrival: true,
                status: true,
                isActive: true,
              },
            },
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException('Tracking information not found');
    }

    // Filter out internal exchange stops — customers must never see relay handoff
    // points on a public tracking page. Mirrors CustomerLoadService.
    load.stops = load.stops.filter((s) => s.actionType !== 'exchange');

    const timeline = this.buildTrackingTimeline(load);

    const activePlan = load.routePlanLoads.map((rpl) => rpl.plan).find((p) => p.isActive);

    return {
      loadNumber: load.loadNumber,
      referenceNumber: load.referenceNumber ?? null,
      status: load.status,
      customerName: load.customerName,
      carrierName: load.tenant.companyName,
      equipmentType: load.requiredEquipmentType ?? null,
      weightLbs: load.weightLbs,
      estimatedDelivery: activePlan?.estimatedArrival?.toISOString() || null,
      timeline,
      stops: load.stops.map((ls) => ({
        sequenceOrder: ls.sequenceOrder,
        actionType: ls.actionType,
        city: ls.stop?.city || null,
        state: ls.stop?.state || null,
      })),
    };
  }

  /**
   * Generate a tracking token for a load. Mints a fresh opaque nanoid via
   * LoadShareLinkService — never embeds the load number in the token.
   */
  async generateTrackingToken(loadNumber: string, tenantId: number, issuedByUserId: number) {
    const load = await this.prisma.load.findFirst({ where: { loadNumber, tenantId } });
    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);

    const link = await this.shareLinks.issue(tenantId, load.id, issuedByUserId, {});
    return { trackingToken: link.token, trackingUrl: `/track/${link.token}` };
  }

  private buildTrackingTimeline(load: any) {
    const events: Array<{
      event: string;
      status: string;
      timestamp?: string;
      detail?: string;
    }> = [];

    events.push({
      event: 'Order Confirmed',
      status: 'completed',
      timestamp: load.createdAt.toISOString(),
    });

    if (['ASSIGNED', 'IN_TRANSIT', 'DELIVERED'].includes(load.status)) {
      events.push({
        event: 'Driver Assigned',
        status: 'completed',
      });
    }

    const firstPickup = load.stops.find((s: any) => s.actionType === 'pickup');
    if (firstPickup?.actualDockHours !== null && ['IN_TRANSIT', 'DELIVERED'].includes(load.status)) {
      events.push({
        event: 'Picked Up',
        status: 'completed',
        detail: `${firstPickup.stop?.city}, ${firstPickup.stop?.state}`,
      });
    }

    if (load.status === 'IN_TRANSIT') {
      events.push({
        event: 'In Transit',
        status: 'current',
      });
    }

    const lastDelivery = [...load.stops].reverse().find((s: any) => s.actionType === 'delivery');
    if (load.status === 'DELIVERED') {
      events.push({
        event: 'Delivered',
        status: 'completed',
        detail: `${lastDelivery?.stop?.city}, ${lastDelivery?.stop?.state}`,
      });
    } else {
      events.push({
        event: 'Delivery',
        status: 'upcoming',
        detail: `${lastDelivery?.stop?.city}, ${lastDelivery?.stop?.state}`,
      });
    }

    return events;
  }
}
