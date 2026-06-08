import { Injectable, Inject, Logger, forwardRef } from '@nestjs/common';
import { RouteSegmentStatus } from '@prisma/client';
import { EARTH_RADIUS_MILES, PLANNING_TRUCK_SPEED_MPH } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';

const ARRIVAL_PROXIMITY_MILES = 1.0;
const MOVING_SPEED_THRESHOLD_MPH = 5;
const PROGRESS_EVENT_THROTTLE_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Route Plan Progress Service
 *
 * Periodically called (every 2 min via BullMQ job) for each active route plan.
 * Updates segment progress based on driver's GPS position from cached telematics data.
 */
@Injectable()
export class RoutePlanProgressService {
  private readonly logger = new Logger(RoutePlanProgressService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => IntegrationDataService))
    private readonly integrationDataService: IntegrationDataService,
  ) {}

  /**
   * Update progress for an active route plan based on current GPS position.
   */
  async updateProgress(planId: number): Promise<void> {
    const plan = await this.prisma.routePlan.findUnique({
      where: { id: planId },
      include: {
        segments: { orderBy: { sequenceOrder: 'asc' } },
        vehicle: {
          select: { id: true, externalVehicleId: true, externalSource: true },
        },
        driver: { select: { id: true } },
      },
    });

    if (!plan || !plan.isActive) return;

    if (!plan.vehicle?.externalVehicleId) return;

    // Read GPS location from cache (populated by ELD sync pipeline)
    const telematics = await this.integrationDataService.getVehicleLocation(
      plan.tenantId,
      plan.vehicle.externalVehicleId,
    );
    if (!telematics) {
      this.logger.debug(`No cached telematics for vehicle ${plan.vehicle.externalVehicleId}, skipping`);
      return;
    }
    const vehicleLat = telematics.latitude;
    const vehicleLon = telematics.longitude;
    const vehicleSpeed = telematics.speed ?? 0;

    const location = {
      latitude: vehicleLat,
      longitude: vehicleLon,
      speed: vehicleSpeed,
    };

    // Find the active segment (first non-completed, non-skipped)
    const activeSegment = plan.segments.find(
      (s) => s.status === RouteSegmentStatus.IN_PROGRESS || s.status === RouteSegmentStatus.PLANNED,
    );
    if (!activeSegment) return;

    // Update progress for drive segments
    if (activeSegment.segmentType === 'drive' && activeSegment.status === RouteSegmentStatus.IN_PROGRESS) {
      const progress = this.calculateDriveProgress(activeSegment, location.latitude, location.longitude);

      await this.prisma.routeSegment.update({
        where: { id: activeSegment.id },
        data: {
          progress: progress.progressPct,
          milesDriven: progress.milesDriven,
          milesRemaining: progress.milesRemaining,
          updatedEta: progress.etaMinutes ? new Date(Date.now() + progress.etaMinutes * 60000) : undefined,
        },
      });

      // Throttled progress event
      await this.maybeCreateProgressEvent(plan.id, activeSegment.segmentId, location, progress);
    }

    // Detect proximity to next stop
    const nextStopSegment = this.findNextStopSegment(plan.segments, activeSegment);
    if (nextStopSegment && this.isNearStop(location, nextStopSegment, ARRIVAL_PROXIMITY_MILES)) {
      // Transition: active drive → completed, next stop → in_progress
      if (activeSegment.status === RouteSegmentStatus.IN_PROGRESS) {
        await this.transitionSegment(
          plan.id,
          activeSegment,
          RouteSegmentStatus.COMPLETED,
          location,
          'GPS_ARRIVAL_DETECTED',
        );
        await this.transitionSegment(
          plan.id,
          nextStopSegment,
          RouteSegmentStatus.IN_PROGRESS,
          location,
          'GPS_ARRIVAL_DETECTED',
        );
      }
    }

    // Detect departure (was at a stop, now moving)
    if (
      activeSegment.segmentType !== 'drive' &&
      activeSegment.status === RouteSegmentStatus.IN_PROGRESS &&
      location.speed > MOVING_SPEED_THRESHOLD_MPH
    ) {
      await this.transitionSegment(
        plan.id,
        activeSegment,
        RouteSegmentStatus.COMPLETED,
        location,
        'GPS_DEPARTURE_DETECTED',
      );

      // Activate next segment
      const nextSeg = plan.segments.find(
        (s) => s.sequenceOrder > activeSegment.sequenceOrder && s.status === RouteSegmentStatus.PLANNED,
      );
      if (nextSeg) {
        await this.transitionSegment(
          plan.id,
          nextSeg,
          RouteSegmentStatus.IN_PROGRESS,
          location,
          'SEGMENT_STATUS_CHANGED',
        );
      }
    }
  }

  /**
   * Calculate drive progress using haversine distance from segment start.
   */
  private calculateDriveProgress(
    segment: any,
    lat: number,
    lon: number,
  ): {
    milesDriven: number;
    milesRemaining: number;
    progressPct: number;
    etaMinutes: number;
  } {
    const fromLat = segment.fromLat ?? 0;
    const fromLon = segment.fromLon ?? 0;
    const driven = this.haversine(fromLat, fromLon, lat, lon);
    const total = segment.distanceMiles ?? 1;
    const progressPct = Math.min(driven / total, 1.0);
    const remaining = Math.max(total - driven, 0);
    const etaMinutes = (remaining / PLANNING_TRUCK_SPEED_MPH) * 60;

    return {
      milesDriven: Math.round(driven * 10) / 10,
      milesRemaining: Math.round(remaining * 10) / 10,
      progressPct: Math.round(progressPct * 1000) / 1000,
      etaMinutes: Math.round(etaMinutes),
    };
  }

  private findNextStopSegment(segments: any[], currentSegment: any): any {
    return segments.find(
      (s) =>
        s.sequenceOrder > currentSegment.sequenceOrder &&
        s.segmentType !== 'drive' &&
        s.status === RouteSegmentStatus.PLANNED,
    );
  }

  private isNearStop(
    location: { latitude: number; longitude: number },
    stopSegment: any,
    thresholdMiles: number,
  ): boolean {
    const stopLat = stopSegment.toLat ?? stopSegment.fromLat;
    const stopLon = stopSegment.toLon ?? stopSegment.fromLon;
    if (!stopLat || !stopLon) return false;

    const distance = this.haversine(location.latitude, location.longitude, stopLat, stopLon);
    return distance <= thresholdMiles;
  }

  private async transitionSegment(
    planId: number,
    segment: any,
    newStatus: RouteSegmentStatus,
    location: { latitude: number; longitude: number },
    eventType: string,
  ): Promise<void> {
    await this.prisma.routeSegment.update({
      where: { id: segment.id },
      data: {
        status: newStatus,
        ...(newStatus === RouteSegmentStatus.IN_PROGRESS ? { actualArrival: new Date() } : {}),
        ...(newStatus === RouteSegmentStatus.COMPLETED ? { actualDeparture: new Date(), progress: 1.0 } : {}),
      },
    });

    await this.prisma.routeEvent.create({
      data: {
        eventId: `EVT-${crypto.randomUUID()}`,
        planId,
        segmentId: segment.segmentId,
        eventType,
        source: 'system',
        occurredAt: new Date(),
        lat: location.latitude,
        lon: location.longitude,
        eventData: {
          previousStatus: segment.status,
          newStatus,
        },
      },
    });

    this.logger.debug(`Segment ${segment.segmentId}: ${segment.status} → ${newStatus} (${eventType})`);
  }

  private async maybeCreateProgressEvent(
    planId: number,
    segmentId: string,
    location: { latitude: number; longitude: number },
    progress: {
      milesDriven: number;
      milesRemaining: number;
      progressPct: number;
    },
  ): Promise<void> {
    // Check last progress event to throttle
    const lastEvent = await this.prisma.routeEvent.findFirst({
      where: {
        planId,
        segmentId,
        eventType: 'PROGRESS_UPDATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastEvent && Date.now() - lastEvent.createdAt.getTime() < PROGRESS_EVENT_THROTTLE_MS) {
      return; // Throttled
    }

    await this.prisma.routeEvent.create({
      data: {
        eventId: `EVT-${crypto.randomUUID()}`,
        planId,
        segmentId,
        eventType: 'PROGRESS_UPDATE',
        source: 'system',
        occurredAt: new Date(),
        lat: location.latitude,
        lon: location.longitude,
        eventData: progress,
      },
    });
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const sinHalfLat = Math.sin(dLat / 2);
    const sinHalfLon = Math.sin(dLon / 2);
    const a =
      sinHalfLat * sinHalfLat +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinHalfLon * sinHalfLon;
    return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
  }
}
