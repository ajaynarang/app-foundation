import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { RouteEventService } from './route-event.service';

@Injectable()
export class DriverEventService {
  private readonly logger = new Logger(DriverEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeEventService: RouteEventService,
  ) {}

  /**
   * Driver taps "Start Route" — begins the first drive segment.
   */
  async handleStartRoute(plan: any, dto: { notes?: string; latitude?: number; longitude?: number }, tenantId: number) {
    // Idempotent: if a segment is already in_progress, route is already started
    const inProgress = plan.segments.find((s: any) => s.status === RouteSegmentStatus.IN_PROGRESS);
    if (inProgress) {
      return {
        status: 'already_started',
        currentSegment: inProgress.segmentId,
      };
    }

    // Find first planned segment
    const firstSegment = plan.segments.find((s: any) => s.status === RouteSegmentStatus.PLANNED);
    if (!firstSegment) {
      throw new BadRequestException('No planned segments to start');
    }

    // Transition first segment: planned → in_progress
    await this.prisma.routeSegment.update({
      where: { id: firstSegment.id },
      data: { status: RouteSegmentStatus.IN_PROGRESS, actualDeparture: new Date() },
    });

    // Record event
    await this.routeEventService.recordEvent({
      planId: plan.id,
      planStringId: plan.planId,
      tenantId,
      segmentId: firstSegment.segmentId,
      eventType: 'ROUTE_STARTED',
      source: 'driver',
      eventData: { notes: dto.notes },
      location: dto.latitude != null ? { lat: dto.latitude, lon: dto.longitude } : undefined,
    });

    return {
      status: 'started',
      currentSegment: firstSegment.segmentId,
      segmentType: firstSegment.segmentType,
    };
  }

  /**
   * Driver taps "Pickup Complete" — completes dock segment, updates load to in_transit.
   */
  async handlePickupComplete(
    plan: any,
    dto: {
      segmentId: string;
      notes?: string;
      latitude?: number;
      longitude?: number;
    },
    tenantId: number,
  ) {
    const segment = plan.segments.find((s: any) => s.segmentId === dto.segmentId);
    if (!segment) throw new BadRequestException(`Segment ${dto.segmentId} not found in plan`);
    if (segment.segmentType !== 'dock') throw new BadRequestException('Pickup can only be confirmed on dock segments');
    if (segment.actionType !== 'pickup') throw new BadRequestException('This is not a pickup segment');

    // Idempotent
    if (segment.status === RouteSegmentStatus.COMPLETED) {
      return { status: 'already_completed', segmentId: dto.segmentId };
    }
    if (segment.status !== RouteSegmentStatus.IN_PROGRESS) {
      throw new BadRequestException(`Segment must be IN_PROGRESS to confirm pickup. Current: ${segment.status}`);
    }

    const nextDrive = this.findNextPlannedSegment(plan.segments, segment.sequenceOrder);

    // Wrap all DB writes in a transaction
    const loadUpdates = await this.prisma.$transaction(async (tx) => {
      // Complete the dock segment
      await tx.routeSegment.update({
        where: { id: segment.id },
        data: { status: RouteSegmentStatus.COMPLETED, actualDeparture: new Date() },
      });

      // Update load status: assigned → in_transit
      const updates = await this.updateLoadsForSegment(tx, plan, segment, 'IN_TRANSIT');

      // Start next drive segment if available
      if (nextDrive) {
        await tx.routeSegment.update({
          where: { id: nextDrive.id },
          data: { status: RouteSegmentStatus.IN_PROGRESS, actualDeparture: new Date() },
        });
      }

      return updates;
    });

    // Record event (outside transaction — event recording is non-critical)
    await this.routeEventService.recordEvent({
      planId: plan.id,
      planStringId: plan.planId,
      tenantId,
      segmentId: dto.segmentId,
      eventType: 'PICKUP_CONFIRMED',
      source: 'driver',
      eventData: {
        actionType: 'pickup',
        loadsUpdated: loadUpdates,
        nextSegmentId: nextDrive?.segmentId,
        notes: dto.notes,
      },
      location: dto.latitude != null ? { lat: dto.latitude, lon: dto.longitude } : undefined,
      impactSummary: {
        segmentsAffected: nextDrive ? 2 : 1,
        loadsAffected: loadUpdates.length,
      },
    });

    // Check for plan completion
    await this.checkAndCompletePlan(plan, tenantId);

    return {
      status: 'pickup_confirmed',
      segmentId: dto.segmentId,
      loadsUpdated: loadUpdates,
      nextSegmentId: nextDrive?.segmentId ?? null,
    };
  }

  /**
   * Driver taps "Delivery Complete" — completes dock segment, updates load to delivered.
   */
  async handleDeliveryComplete(
    plan: any,
    dto: {
      segmentId: string;
      notes?: string;
      latitude?: number;
      longitude?: number;
    },
    tenantId: number,
  ) {
    const segment = plan.segments.find((s: any) => s.segmentId === dto.segmentId);
    if (!segment) throw new BadRequestException(`Segment ${dto.segmentId} not found in plan`);
    if (segment.segmentType !== 'dock')
      throw new BadRequestException('Delivery can only be confirmed on dock segments');
    if (segment.actionType !== 'dropoff') throw new BadRequestException('This is not a delivery segment');

    // Idempotent
    if (segment.status === RouteSegmentStatus.COMPLETED) {
      return { status: 'already_completed', segmentId: dto.segmentId };
    }
    if (segment.status !== RouteSegmentStatus.IN_PROGRESS) {
      throw new BadRequestException(`Segment must be IN_PROGRESS to confirm delivery. Current: ${segment.status}`);
    }

    const nextSegment = this.findNextPlannedSegment(plan.segments, segment.sequenceOrder);

    // Wrap all DB writes in a transaction
    const loadUpdates = await this.prisma.$transaction(async (tx) => {
      // Complete the dock segment
      await tx.routeSegment.update({
        where: { id: segment.id },
        data: { status: RouteSegmentStatus.COMPLETED, actualDeparture: new Date() },
      });

      // Update load status: in_transit → delivered
      const updates = await this.updateLoadsForSegment(tx, plan, segment, 'DELIVERED');

      // Start next segment if available
      if (nextSegment) {
        await tx.routeSegment.update({
          where: { id: nextSegment.id },
          data: { status: RouteSegmentStatus.IN_PROGRESS, actualDeparture: new Date() },
        });
      }

      return updates;
    });

    // Record event (outside transaction — event recording is non-critical)
    await this.routeEventService.recordEvent({
      planId: plan.id,
      planStringId: plan.planId,
      tenantId,
      segmentId: dto.segmentId,
      eventType: 'DELIVERY_CONFIRMED',
      source: 'driver',
      eventData: {
        actionType: 'dropoff',
        loadsUpdated: loadUpdates,
        nextSegmentId: nextSegment?.segmentId,
        notes: dto.notes,
      },
      location: dto.latitude != null ? { lat: dto.latitude, lon: dto.longitude } : undefined,
      impactSummary: {
        segmentsAffected: nextSegment ? 2 : 1,
        loadsAffected: loadUpdates.length,
      },
    });

    // Check for plan completion
    await this.checkAndCompletePlan(plan, tenantId);

    return {
      status: 'delivery_confirmed',
      segmentId: dto.segmentId,
      loadsUpdated: loadUpdates,
      nextSegmentId: nextSegment?.segmentId ?? null,
    };
  }

  /**
   * Dispatcher overrides a segment status (e.g., driver forgot to confirm pickup).
   */
  async handleDispatcherOverride(
    plan: any,
    dto: {
      segmentId: string;
      newStatus: string;
      reason: string;
      confirmPickup?: boolean;
      confirmDelivery?: boolean;
    },
    tenantId: number,
    dispatcherUserId: string,
  ) {
    const segment = plan.segments.find((s: any) => s.segmentId === dto.segmentId);
    if (!segment) throw new BadRequestException(`Segment ${dto.segmentId} not found in plan`);

    const previousStatus = segment.status;

    // Update segment status
    const updateData: any = { status: dto.newStatus };
    if (dto.newStatus === RouteSegmentStatus.COMPLETED && !segment.actualDeparture)
      updateData.actualDeparture = new Date();
    if (dto.newStatus === RouteSegmentStatus.IN_PROGRESS && !segment.actualArrival)
      updateData.actualArrival = new Date();

    const nextSegment =
      dto.newStatus === RouteSegmentStatus.COMPLETED
        ? this.findNextPlannedSegment(plan.segments, segment.sequenceOrder)
        : null;

    // Wrap all DB writes in a transaction
    const loadUpdates = await this.prisma.$transaction(async (tx) => {
      await tx.routeSegment.update({
        where: { id: segment.id },
        data: updateData,
      });

      // Handle business event confirmations
      let updates: { loadNumber: string; newStatus: string }[] = [];
      if (dto.confirmPickup && segment.segmentType === 'dock' && segment.actionType === 'pickup') {
        updates = await this.updateLoadsForSegment(tx, plan, segment, 'IN_TRANSIT');
      }
      if (dto.confirmDelivery && segment.segmentType === 'dock' && segment.actionType === 'dropoff') {
        updates = await this.updateLoadsForSegment(tx, plan, segment, 'DELIVERED');
      }

      // Start next segment if this one was completed
      if (nextSegment) {
        await tx.routeSegment.update({
          where: { id: nextSegment.id },
          data: { status: RouteSegmentStatus.IN_PROGRESS, actualDeparture: new Date() },
        });
      }

      return updates;
    });

    // Record event (outside transaction — event recording is non-critical)
    await this.routeEventService.recordEvent({
      planId: plan.id,
      planStringId: plan.planId,
      tenantId,
      segmentId: dto.segmentId,
      eventType: 'DISPATCHER_OVERRIDE',
      source: 'dispatcher',
      eventData: {
        previousStatus,
        newStatus: dto.newStatus,
        reason: dto.reason,
        dispatcherUserId,
        confirmPickup: dto.confirmPickup,
        confirmDelivery: dto.confirmDelivery,
        loadsUpdated: loadUpdates,
        nextSegmentId: nextSegment?.segmentId,
      },
    });

    // Check for plan completion
    await this.checkAndCompletePlan(plan, tenantId);

    return {
      status: 'overridden',
      segmentId: dto.segmentId,
      previousStatus,
      newStatus: dto.newStatus,
      loadsUpdated: loadUpdates,
      nextSegmentId: nextSegment?.segmentId ?? null,
    };
  }

  // --- Private helpers ---

  /**
   * Find loads connected to a dock segment via its stopId, and update their status.
   * Accepts a Prisma transaction client for transactional safety.
   */
  private async updateLoadsForSegment(
    tx: any,
    plan: any,
    segment: any,
    newLoadStatus: string,
  ): Promise<{ loadNumber: string; newStatus: string }[]> {
    if (!segment.stopId) return [];

    // Find loads on this plan that have a stop matching this segment's stop
    const routePlanLoads = await tx.routePlanLoad.findMany({
      where: { planId: plan.id },
      include: {
        load: {
          include: { stops: { where: { stopId: segment.stopId } } },
        },
      },
    });

    const updates: { loadNumber: string; newStatus: string }[] = [];
    for (const rpl of routePlanLoads) {
      if (rpl.load.stops.length > 0) {
        await tx.load.update({
          where: { id: rpl.load.id },
          data: { status: newLoadStatus },
        });
        updates.push({ loadNumber: rpl.load.loadNumber, newStatus: newLoadStatus });
        this.logger.log(`Load ${rpl.load.loadNumber} status → ${newLoadStatus}`);
      }
    }

    return updates;
  }

  /**
   * Find the next planned segment after the given sequence order.
   */
  private findNextPlannedSegment(segments: any[], afterSequenceOrder: number): any {
    return (
      segments
        .filter((s: any) => s.sequenceOrder > afterSequenceOrder && s.status === RouteSegmentStatus.PLANNED)
        .sort((a: any, b: any) => a.sequenceOrder - b.sequenceOrder)[0] ?? null
    );
  }

  /**
   * Check if all segments are done → mark plan as completed.
   */
  private async checkAndCompletePlan(plan: any, tenantId: number): Promise<boolean> {
    // Re-fetch fresh segment statuses
    const segments = await this.prisma.routeSegment.findMany({
      where: { planId: plan.id },
    });

    const allDone = segments.every(
      (s) => s.status === RouteSegmentStatus.COMPLETED || s.status === RouteSegmentStatus.SKIPPED,
    );
    if (!allDone) return false;

    // Mark plan as completed
    await this.prisma.routePlan.update({
      where: { id: plan.id },
      data: { status: RoutePlanStatus.COMPLETED, isActive: false, completedAt: new Date() },
    });

    // Record event
    await this.routeEventService.recordEvent({
      planId: plan.id,
      planStringId: plan.planId,
      tenantId,
      eventType: 'ROUTE_COMPLETED',
      source: 'system',
      eventData: {
        totalSegments: segments.length,
        completedSegments: segments.filter((s) => s.status === RouteSegmentStatus.COMPLETED).length,
        skippedSegments: segments.filter((s) => s.status === RouteSegmentStatus.SKIPPED).length,
      },
    });

    this.logger.log(`Route ${plan.planId} completed — all segments done`);
    return true;
  }
}
