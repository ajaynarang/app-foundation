import { Injectable, Logger } from '@nestjs/common';
import { decode } from '@here/flexpolyline';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString' | 'Point';
    coordinates: number[][] | number[];
  };
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

const SEGMENT_COLORS: Record<string, string> = {
  drive: '#7c8aff',
  rest: '#8b5cf6',
  fuel: '#f59e0b',
  dock: '#4ade80',
  break: '#94a3b8',
  wait: '#64748b',
};

const SEGMENT_ICONS: Record<string, string> = {
  dock: 'warehouse',
  fuel: 'fuel',
  rest: 'lodging',
  break: 'cafe',
  wait: 'clock',
};

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class GeoJSONService {
  private readonly logger = new Logger(GeoJSONService.name);

  /**
   * Convert a route plan with segments into a GeoJSON FeatureCollection
   * suitable for rendering with Mapbox GL JS.
   *
   * Decodes HERE Flexible Polyline geometry from drive segments
   * and creates point features for stop locations.
   */
  planToGeoJSON(plan: {
    segments: Array<{
      segmentId: string;
      segmentType: string;
      sequenceOrder: number;
      fromLat?: number | null;
      fromLon?: number | null;
      toLat?: number | null;
      toLon?: number | null;
      toLocation?: string | null;
      fromLocation?: string | null;
      distanceMiles?: number | null;
      driveTimeHours?: number | null;
      routeGeometry?: string | null;
      restDurationHours?: number | null;
      restType?: string | null;
      restReason?: string | null;
      dockDurationHours?: number | null;
      customerName?: string | null;
      fuelStationName?: string | null;
      fuelPricePerGallon?: number | null;
      fuelCostEstimate?: number | null;
      fuelGallons?: number | null;
      detourMiles?: number | null;
      isDocktimeConverted?: boolean | null;
      estimatedArrival?: Date | null;
      estimatedDeparture?: Date | null;
      hosStateAfter?: any;
      fuelStateAfter?: unknown;
      actionType?: string | null;
    }>;
  }): GeoJSONFeatureCollection {
    const features: GeoJSONFeature[] = [];

    for (const segment of plan.segments) {
      // Add route line for drive segments with geometry
      if (segment.routeGeometry) {
        try {
          const decoded = decode(segment.routeGeometry);
          // HERE returns [lat, lng, elevation?], GeoJSON needs [lng, lat]
          const geoCoords = decoded.polyline.map(([lat, lng]: number[]) => [lng, lat]);

          if (geoCoords.length >= 2) {
            features.push({
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: geoCoords },
              properties: {
                segmentId: segment.segmentId,
                segmentType: segment.segmentType,
                sequenceOrder: segment.sequenceOrder,
                color: SEGMENT_COLORS[segment.segmentType] ?? '#7c8aff',
                distanceMiles: segment.distanceMiles,
                driveTimeHours: segment.driveTimeHours,
                fromLocation: segment.fromLocation ?? null,
                toLocation: segment.toLocation ?? null,
                ...this.flattenHOS(segment.hosStateAfter),
              },
            });
          }
        } catch (err) {
          this.logger.warn(`Failed to decode polyline for segment ${segment.segmentId}: ${err}`);
        }
      }

      // Add point features for stop locations (non-drive segments)
      if (segment.segmentType !== 'drive' && segment.toLat && segment.toLon) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [segment.toLon, segment.toLat],
          },
          properties: {
            segmentId: segment.segmentId,
            segmentType: segment.segmentType,
            sequenceOrder: segment.sequenceOrder,
            name: segment.toLocation,
            icon: SEGMENT_ICONS[segment.segmentType] ?? 'circle',
            color: SEGMENT_COLORS[segment.segmentType] ?? '#94a3b8',
            ...this.segmentDetails(segment),
          },
        });
      }

      // Add origin/destination points for drive segments
      if (segment.segmentType === 'drive') {
        if (segment.sequenceOrder === 1 && segment.fromLat && segment.fromLon) {
          features.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [segment.fromLon, segment.fromLat],
            },
            properties: {
              segmentId: `${segment.segmentId}-origin`,
              segmentType: 'origin',
              icon: 'circle',
              color: '#4ade80',
              name: 'Origin',
            },
          });
        }
      }
    }

    // Add final destination point from last segment
    const lastSeg = plan.segments[plan.segments.length - 1];
    if (lastSeg?.toLat && lastSeg?.toLon) {
      const existing = features.find(
        (f) => f.geometry.type === 'Point' && f.properties.segmentId === lastSeg.segmentId,
      );
      if (!existing) {
        features.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [lastSeg.toLon, lastSeg.toLat],
          },
          properties: {
            segmentId: `${lastSeg.segmentId}-destination`,
            segmentType: 'destination',
            icon: 'circle',
            color: '#ef4444',
            name: lastSeg.toLocation ?? 'Destination',
          },
        });
      }
    }

    return { type: 'FeatureCollection', features };
  }

  private segmentDetails(segment: any): Record<string, any> {
    const details: Record<string, any> = {};

    if (segment.estimatedArrival) {
      details.estimatedArrival = segment.estimatedArrival;
    }
    if (segment.estimatedDeparture) {
      details.estimatedDeparture = segment.estimatedDeparture;
    }
    if (segment.toLocation) {
      details.location = segment.toLocation;
    }

    switch (segment.segmentType) {
      case 'rest':
        details.restDurationHours = segment.restDurationHours;
        details.restType = segment.restType;
        details.restReason = segment.restReason;
        break;
      case 'fuel': {
        details.fuelStationName = segment.fuelStationName;
        details.fuelPricePerGallon = segment.fuelPricePerGallon;
        details.fuelCostEstimate = segment.fuelCostEstimate;
        details.fuelGallons = segment.fuelGallons;
        details.detourMiles = segment.detourMiles;
        const fuelState = segment.fuelStateAfter as {
          rangeRemainingMiles?: number;
        } | null;
        if (fuelState?.rangeRemainingMiles != null) {
          details.fuelRangeAfterMiles = fuelState.rangeRemainingMiles;
        }
        break;
      }
      case 'dock':
        details.dockDurationHours = segment.dockDurationHours;
        details.customerName = segment.customerName;
        details.actionType = segment.actionType;
        details.isDocktimeConverted = segment.isDocktimeConverted;
        break;
      case 'break':
        details.restDurationHours = segment.restDurationHours;
        details.restReason = segment.restReason;
        break;
    }

    // Flatten HOS into top-level properties (avoids nested object serialization issues)
    Object.assign(details, this.flattenHOS(segment.hosStateAfter));

    return details;
  }

  private flattenHOS(hosStateAfter: any): Record<string, any> {
    if (!hosStateAfter) return {};
    return {
      hosHoursDriven: hosStateAfter.hoursDriven ?? null,
      hosOnDutyTime: hosStateAfter.onDutyTime ?? null,
      hosHoursSinceBreak: hosStateAfter.hoursSinceBreak ?? null,
      hosCycleHoursUsed: hosStateAfter.cycleHoursUsed ?? null,
    };
  }
}
