import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S } from '../../../../constants/cache.constants';
import type {
  CommandCenterMapDataDto,
  MapRouteStopDto,
  MapTruckLocationDto,
  MapUnassignedLoadDto,
} from '../dto/map-data.dto';

/** Stop actionType values that count as a route waypoint, normalized to the DTO union. */
function normalizeActionType(actionType: string): MapRouteStopDto['actionType'] {
  if (actionType === 'pickup' || actionType === 'delivery') return actionType;
  return 'stop';
}

@Injectable()
export class MapDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getMapData(tenantId: number): Promise<CommandCenterMapDataDto> {
    const cacheKey = buildKey('sally:cmdcenter', 'map', tenantId);
    const cached = await this.cache.get<CommandCenterMapDataDto>(cacheKey);
    if (cached) return cached;

    // Bulk query: vehicles + telematics join (same pattern as getOverview).
    // We use a Prisma join here (not EldDataCacheService per-vehicle reads)
    // because bulk DB query is more efficient for rendering all trucks at once.
    // EldDataCacheService is designed for single-vehicle real-time checks in monitoring.
    const [vehiclesWithTelematics, activeLoads] = await Promise.all([
      this.prisma.vehicle.findMany({
        where: {
          tenantId,
          lifecycleStatus: 'ACTIVE',
        },
        select: {
          vehicleId: true,
          unitNumber: true,
          assignedDriver: {
            select: {
              driverId: true,
              name: true,
              hosData: true,
              hosDataSyncedAt: true,
            },
          },
          telematics: true,
          loads: {
            where: {
              status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
              isActive: true,
            },
            select: {
              loadNumber: true,
              referenceNumber: true,
              status: true,
              customerName: true,
              originCity: true,
              originState: true,
              destinationCity: true,
              destinationState: true,
              pickupDate: true,
              deliveryDate: true,
              // Get the driver from the load (more reliable than vehicle.assignedDriver)
              driver: {
                select: {
                  driverId: true,
                  name: true,
                  hosData: true,
                  hosDataSyncedAt: true,
                },
              },
              stops: {
                select: {
                  sequenceOrder: true,
                  actionType: true,
                  stop: {
                    select: {
                      city: true,
                      state: true,
                      lat: true,
                      lon: true,
                    },
                  },
                },
                orderBy: { sequenceOrder: 'asc' },
              },
            },
            take: 1,
          },
        },
      }),
      this.prisma.load.findMany({
        where: {
          tenantId,
          status: { in: ['PENDING', 'ASSIGNED'] },
          isActive: true,
          driverId: null,
        },
        select: {
          loadNumber: true,
          referenceNumber: true,
          status: true,
          customerName: true,
          requiredEquipmentType: true,
          originCity: true,
          originState: true,
          destinationCity: true,
          destinationState: true,
          pickupDate: true,
          deliveryDate: true,
          stops: {
            select: {
              sequenceOrder: true,
              actionType: true,
              status: true,
              stop: {
                select: {
                  stopId: true,
                  name: true,
                  city: true,
                  state: true,
                  lat: true,
                  lon: true,
                },
              },
            },
            orderBy: { sequenceOrder: 'asc' },
          },
        },
      }),
    ]);

    // Helper: derive truck status from telematics
    const deriveTruckStatus = (speed: number, engineRunning: boolean): 'moving' | 'idle' | 'parked' => {
      if (speed > 1) return 'moving';
      if (engineRunning) return 'idle';
      return 'parked';
    };

    // Helper: derive HOS status from remaining drive hours
    // Returns 'none' when no HOS data available (no driver or no ELD)
    const deriveHosStatus = (
      driveHoursRemaining: number,
      hasHosData: boolean,
    ): 'safe' | 'warning' | 'critical' | 'none' => {
      if (!hasHosData) return 'none';
      if (driveHoursRemaining <= 1) return 'critical';
      if (driveHoursRemaining <= 3) return 'warning';
      return 'safe';
    };

    // Helper: extract origin/destination coordinates from load stops
    const extractStopCoords = (
      stops: {
        sequenceOrder: number;
        actionType: string;
        stop: {
          city: string | null;
          state: string | null;
          lat: number | null;
          lon: number | null;
        };
      }[],
      fallbackCity: string | null,
      type: 'origin' | 'destination',
    ): { lat: number; lng: number; city: string } | null => {
      const sorted = [...stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
      const stop =
        type === 'origin'
          ? (sorted.find((s) => s.actionType === 'pickup') ?? sorted[0])
          : ([...sorted].reverse().find((s) => s.actionType === 'delivery') ?? sorted[sorted.length - 1]);
      if (!stop?.stop?.lat || !stop?.stop?.lon) return null;
      return {
        lat: stop.stop.lat,
        lng: stop.stop.lon,
        city: stop.stop.city ?? fallbackCity ?? 'Unknown',
      };
    };

    // Helper: build the full geocoded stop sequence for an active load's route.
    // Returns stops ordered by sequenceOrder, dropping any without coordinates.
    // The Tower map draws a straight-line connector through these.
    const buildRouteStops = (
      stops: {
        sequenceOrder: number;
        actionType: string;
        stop: {
          city: string | null;
          state: string | null;
          lat: number | null;
          lon: number | null;
        };
      }[],
    ): MapRouteStopDto[] => {
      return [...stops]
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .filter((s) => s.stop?.lat != null && s.stop?.lon != null)
        .map((s) => ({
          sequenceOrder: s.sequenceOrder,
          actionType: normalizeActionType(s.actionType),
          lat: s.stop.lat,
          lng: s.stop.lon,
          city: s.stop.city ?? 'Unknown',
          state: s.stop.state ?? null,
        }));
    };

    // Build truck locations (flat structure for frontend)
    const trucks: MapTruckLocationDto[] = vehiclesWithTelematics
      .filter((v) => v.telematics) // Only vehicles with telematics data
      .map((v) => {
        const tel = v.telematics;
        const activeLoad = v.loads[0] ?? null;
        // IMPORTANT: vehicle.assignedDriver is a PREFERENCE ("usually drives this truck"),
        // not the current assignment. The actual driver is always on the load.
        // See dto/map-data.dto.ts for full explanation.
        const driver = activeLoad?.driver ?? v.assignedDriver;

        // HOS from driver record (same pattern as getOverview)
        let hosDriveRemaining = 0;
        let hosDutyRemaining = 0;
        if (driver?.hosData) {
          const driverHos = driver.hosData as Record<string, any>;
          hosDriveRemaining = (driverHos.driveTimeRemainingMs ?? 0) / 3600000;
          hosDutyRemaining = (driverHos.shiftTimeRemainingMs ?? 0) / 3600000;
        }

        // Build activeLoad with coordinates from stops
        let mappedActiveLoad: MapTruckLocationDto['activeLoad'] = null;
        if (activeLoad) {
          const origin = extractStopCoords(activeLoad.stops, activeLoad.originCity, 'origin');
          const destination = extractStopCoords(activeLoad.stops, activeLoad.destinationCity, 'destination');
          if (origin && destination) {
            const routeStops = buildRouteStops(activeLoad.stops);
            mappedActiveLoad = {
              loadNumber: activeLoad.loadNumber,
              referenceNumber: activeLoad.referenceNumber ?? null,
              origin,
              destination,
              // Only expose the sequence when there are 2+ geocoded stops to
              // connect — a single point is not a route.
              stops: routeStops.length >= 2 ? routeStops : [],
              etaStatus: 'on_time', // TODO: derive from route progress tracker
            };
          }
        }

        return {
          driverId: driver?.driverId ?? v.vehicleId,
          driverName: driver?.name ?? 'Unassigned',
          vehicleId: v.vehicleId,
          vehicleIdentifier: v.unitNumber,
          latitude: tel.latitude,
          longitude: tel.longitude,
          heading: tel.heading,
          speedMph: Math.round(tel.speed),
          status: deriveTruckStatus(tel.speed, tel.engineRunning),
          hosDriveRemaining: Math.round(hosDriveRemaining * 10) / 10,
          hosDutyRemaining: Math.round(hosDutyRemaining * 10) / 10,
          hosStatus: deriveHosStatus(hosDriveRemaining, !!driver?.hosData),
          fuelLevel: tel.fuelLevel,
          activeLoad: mappedActiveLoad,
          lastUpdated: tel.updatedAt.toISOString(),
        };
      });

    // Build unassigned loads with stop coordinates
    const unassignedLoads: MapUnassignedLoadDto[] = activeLoads
      .map((load) => {
        const origin = extractStopCoords(load.stops, load.originCity, 'origin');
        const destination = extractStopCoords(load.stops, load.destinationCity, 'destination');

        // Skip loads without geocoded stops — they can't be placed on the map
        if (!origin || !destination) return null;

        return {
          loadNumber: load.loadNumber,
          referenceNumber: load.referenceNumber ?? null,
          origin,
          destination,
          customerName: load.customerName,
          pickupDate: load.pickupDate
            ? load.pickupDate.toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
        };
      })
      .filter((l): l is MapUnassignedLoadDto => l !== null);

    const result: CommandCenterMapDataDto = {
      trucks,
      unassignedLoads,
      lastUpdated: new Date().toISOString(),
    };

    await this.cache.set(cacheKey, result, CACHE_TTL_HOT_30S);
    return result;
  }
}
