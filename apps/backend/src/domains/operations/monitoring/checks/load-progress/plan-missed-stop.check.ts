import { RouteSegmentStatus } from '@prisma/client';
import { EARTH_RADIUS_MILES } from '@sally/shared-types';
import { MonitoringCheck, LoadCheckContext, MonitoringTrigger, ActivePlanSegment } from '../../monitoring.types';

/**
 * Haversine distance in miles between two lat/lon points.
 */
function haversineDistanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = EARTH_RADIUS_MILES;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export class PlanMissedStopCheck implements MonitoringCheck {
  id = 'plan_missed_stop';
  displayName = 'Plan Missed Stop';
  category = 'load_progress' as const;
  needs = ['route_plan_data', 'gps_data'];
  scope = 'per-load' as const;
  defaultThresholds = { missedStopDistanceMiles: 2 };
  autoResolve = false;
  severity = 'high' as const;

  run(context: LoadCheckContext, thresholds: Record<string, number>): MonitoringTrigger | null {
    const { activePlan, driverPosition, load, driver } = context;
    if (!activePlan || !driverPosition) return null;

    const distanceThreshold = thresholds.missedStopDistanceMiles ?? this.defaultThresholds.missedStopDistanceMiles;

    // Check planned fuel/rest segments that should have been visited
    // If no segment is in_progress, use the first planned segment's order (no segments are "past")
    const currentSegment = activePlan.currentSegment ?? activePlan.nextSegment;
    if (!currentSegment) return null; // No active or planned segments — nothing to check
    const currentOrder = currentSegment.sequenceOrder;

    const missedSegments = activePlan.segments.filter(
      (s) =>
        s.status === RouteSegmentStatus.PLANNED &&
        (s.segmentType === 'fuel' || s.segmentType === 'rest' || s.segmentType === 'break') &&
        s.sequenceOrder < currentOrder &&
        s.toLat != null &&
        s.toLon != null,
    );

    for (const seg of missedSegments) {
      const distMiles = haversineDistanceMiles(driverPosition.lat, driverPosition.lon, seg.toLat, seg.toLon);

      const speed = driverPosition.speed ?? 0;

      // Driver is past the stop (> threshold miles away) and moving (> 5 mph)
      if (distMiles > distanceThreshold && speed > 5) {
        return {
          type: 'PLAN_MISSED_STOP',
          severity: this.severity,
          requiresReplan: true,
          etaImpactMinutes: this.estimateImpact(seg),
          params: {
            loadId: load.loadNumber,
            driverName: driver.name,
            planId: activePlan.planId,
            segmentId: seg.segmentId,
            segmentType: seg.segmentType,
            stopLocation: seg.toLocation ?? 'planned stop',
            distancePastMiles: Math.round(distMiles * 10) / 10,
            currentSpeed: Math.round(speed),
          },
        };
      }
    }

    return null;
  }

  private estimateImpact(segment: ActivePlanSegment): number {
    if (segment.segmentType === 'fuel') return 30; // ~30 min fuel stop missed
    if (segment.restDurationHours) {
      return Math.round(segment.restDurationHours * 60);
    }
    return 30; // default
  }
}
