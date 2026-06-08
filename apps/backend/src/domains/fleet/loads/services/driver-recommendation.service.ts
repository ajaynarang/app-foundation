import { Injectable, Inject, Logger, NotFoundException, forwardRef } from '@nestjs/common';
import { HOS_CONSTANTS } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { DriverRecommendationDto } from '../dto/driver-recommendation.dto';

const MS_PER_HOUR = 3_600_000;
const MAX_DRIVE_HOURS = HOS_CONSTANTS.MAX_DRIVE_HOURS;
const MAX_PROXIMITY_MILES = 500;

export interface MatchScoreInput {
  equipmentMatch: boolean;
  driveHoursRemaining: number;
  distanceMiles: number;
  isAvailable: boolean;
  activeLoadCount: number;
}

export interface RationaleInput {
  equipmentMatch: boolean;
  driveHoursRemaining: number;
  distanceMiles: number;
  isClosest: boolean;
}

@Injectable()
export class DriverRecommendationService {
  private readonly logger = new Logger(DriverRecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => IntegrationDataService))
    private readonly integrationData: IntegrationDataService,
  ) {}

  /**
   * Rank all active drivers for a given load by match quality.
   */
  async getRecommendations(loadNumber: string, tenantId: number): Promise<DriverRecommendationDto[]> {
    // 1. Fetch the load with its first pickup stop (lowest sequenceOrder with actionType = 'pickup')
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      include: {
        stops: {
          where: { actionType: 'pickup' },
          orderBy: { sequenceOrder: 'asc' },
          take: 1,
          include: {
            stop: {
              select: { lat: true, lon: true, city: true, state: true },
            },
          },
        },
      },
    });

    if (!load) {
      throw new NotFoundException(`Load ${loadNumber} not found`);
    }

    const pickupStop = load.stops[0]?.stop ?? null;
    const pickupLat = pickupStop?.lat ?? null;
    const pickupLon = pickupStop?.lon ?? null;
    const loadEquipmentType = (load.requiredEquipmentType as string) ?? null;

    this.logger.debug(
      `Recommendations for load ${loadNumber}: ` +
        `equipmentType=${loadEquipmentType}, ` +
        `pickupCoords=${pickupLat},${pickupLon}, ` +
        `stops=${load.stops.length}, ` +
        `stopHasLocation=${!!pickupStop}`,
    );

    // 2. Fetch all active drivers with vehicles and active loads
    const drivers = await this.prisma.driver.findMany({
      where: {
        tenantId,
        status: { in: ['ACTIVE', 'PENDING_ACTIVATION'] },
      },
      include: {
        assignedVehicle: {
          select: {
            id: true,
            vehicleId: true,
            unitNumber: true,
            equipmentType: true,
          },
        },
        loads: {
          where: {
            status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
            isActive: true,
          },
          select: {
            loadNumber: true,
            status: true,
          },
        },
      },
    });

    if (drivers.length === 0) {
      return [];
    }

    // Filter out drivers with unavailability overlapping the load's date range
    let eligibleDrivers = drivers;
    if (load.pickupDate && load.deliveryDate) {
      const unavailableDriverIds = await this.prisma.driverUnavailability
        .findMany({
          where: {
            tenantId,
            startDate: { lte: load.deliveryDate },
            endDate: { gte: load.pickupDate },
          },
          select: { driverId: true },
        })
        .then((rows) => new Set(rows.map((r) => r.driverId)));

      if (unavailableDriverIds.size > 0) {
        eligibleDrivers = drivers.filter((d) => !unavailableDriverIds.has(d.id));
        this.logger.debug(`Filtered ${unavailableDriverIds.size} unavailable driver(s) from recommendations`);
      }
    }

    if (eligibleDrivers.length === 0) {
      return [];
    }

    // Debug: log first driver's vehicle data to diagnose equipment matching
    const firstDriver = eligibleDrivers[0];
    this.logger.debug(
      `First driver: ${firstDriver.name}, ` +
        `assignedVehicleId=${firstDriver.assignedVehicleId}, ` +
        `vehicleEquipType=${firstDriver.assignedVehicle?.equipmentType ?? 'null'}, ` +
        `loadEquipType=${loadEquipmentType}`,
    );

    // 3. Build scored candidates
    type Candidate = {
      driver: (typeof drivers)[0];
      hos: Awaited<ReturnType<IntegrationDataService['getDriverHOS']>>;
      gps: Awaited<ReturnType<IntegrationDataService['getVehicleLocation']>>;
      distanceMiles: number;
      driveHoursRemaining: number;
      shiftHoursRemaining: number;
      cycleHoursRemaining: number;
      breakHoursRemaining: number;
      nextResetAt: string | null;
      score: number;
      equipmentMatch: boolean;
      isAvailable: boolean;
      availabilityStatus: 'available' | 'on_load' | 'resting';
      currentLoadNumber: string | null;
      locationLabel: string;
    };

    // Note: 2 cache calls per driver (HOS + GPS). Acceptable for fleets < 200 drivers.
    // For larger fleets, consider batch-fetching from IntegrationDataService.
    const candidates = await Promise.all(
      eligibleDrivers.map(async (driver): Promise<Candidate> => {
        // HOS — graceful fallback to structured DB fields
        let hos: Awaited<ReturnType<IntegrationDataService['getDriverHOS']>> = null;
        try {
          hos = await this.integrationData.getDriverHOS(tenantId, driver.driverId);
        } catch (err) {
          this.logger.warn(`HOS lookup failed for driver ${driver.driverId}: ${(err as Error).message}`);
        }

        const driveHoursRemaining = hos
          ? hos.driveTimeRemainingMs / MS_PER_HOUR
          : Math.max(0, MAX_DRIVE_HOURS - driver.currentHoursDriven);

        const shiftHoursRemaining = hos ? hos.shiftTimeRemainingMs / MS_PER_HOUR : 0;

        const cycleHoursRemaining = hos
          ? hos.cycleTimeRemainingMs / MS_PER_HOUR
          : Math.max(0, HOS_CONSTANTS.MAX_CYCLE_HOURS - driver.cycleHoursUsed);

        const breakHoursRemaining = hos
          ? hos.timeUntilBreakMs / MS_PER_HOUR
          : Math.max(0, HOS_CONSTANTS.BREAK_TRIGGER_HOURS - driver.currentHoursSinceBreak);

        const nextResetAt = driver.lastRestartAt
          ? new Date(driver.lastRestartAt.getTime() + HOS_CONSTANTS.RESTART_HOURS * MS_PER_HOUR).toISOString()
          : null;

        // GPS — graceful fallback
        let gps: Awaited<ReturnType<IntegrationDataService['getVehicleLocation']>> = null;
        if (driver.assignedVehicle) {
          try {
            gps = await this.integrationData.getVehicleLocation(tenantId, driver.assignedVehicle.vehicleId);
          } catch (err) {
            this.logger.warn(
              `GPS lookup failed for vehicle ${driver.assignedVehicle.vehicleId}: ${(err as Error).message}`,
            );
          }
        }

        // Distance calculation
        let distanceMiles = MAX_PROXIMITY_MILES; // default = worst-case
        if (gps && pickupLat !== null && pickupLon !== null) {
          distanceMiles = this.haversineDistance(gps.latitude, gps.longitude, pickupLat, pickupLon);
        }

        // Equipment match — normalize both sides: lowercase, replace hyphens/spaces with underscores
        const vehicleEquipType = driver.assignedVehicle?.equipmentType ?? null;
        const normalizeEquip = (s: string) => s.toLowerCase().replace(/[-\s]/g, '_');
        const equipmentMatch =
          loadEquipmentType !== null &&
          vehicleEquipType !== null &&
          normalizeEquip(vehicleEquipType) === normalizeEquip(loadEquipmentType);

        // Active load count
        const activeLoadCount = driver.loads.length;
        const currentLoad = driver.loads[0] ?? null;
        const isAvailable = activeLoadCount === 0;

        // Availability status
        let availabilityStatus: 'available' | 'on_load' | 'resting' = 'available';
        if (activeLoadCount > 0) {
          availabilityStatus = 'on_load';
        } else if (driveHoursRemaining <= 0) {
          availabilityStatus = 'resting';
        }

        // Location label — prefer human-readable description, fall back gracefully
        let locationLabel: string = '';
        if (gps) {
          // Prefer locationDescription (e.g. "Dallas, TX") from GPS provider
          locationLabel = (gps as any).locationDescription || `${gps.latitude.toFixed(4)}, ${gps.longitude.toFixed(4)}`;
        } else if (driver.homeTerminalCity && driver.homeTerminalState) {
          locationLabel = `${driver.homeTerminalCity}, ${driver.homeTerminalState}`;
        }
        // If still empty, omit rather than showing "Unknown"

        const score = this.calculateMatchScore({
          equipmentMatch,
          driveHoursRemaining,
          distanceMiles,
          isAvailable,
          activeLoadCount,
        });

        return {
          driver,
          hos,
          gps,
          distanceMiles,
          driveHoursRemaining,
          shiftHoursRemaining,
          cycleHoursRemaining,
          breakHoursRemaining,
          nextResetAt,
          score,
          equipmentMatch,
          isAvailable,
          availabilityStatus,
          currentLoadNumber: currentLoad?.loadNumber ?? null,
          locationLabel,
        };
      }),
    );

    // 4. Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // 5. Identify the closest candidate for rationale use
    const minDistance = Math.min(...candidates.map((c) => c.distanceMiles));

    // 6. Map to DTOs — first candidate is best match
    return candidates.map((c, index): DriverRecommendationDto => {
      const nameParts = c.driver.name.trim().split(/\s+/);
      const initials =
        nameParts.length >= 2
          ? `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase()
          : c.driver.name.slice(0, 2).toUpperCase();

      const isClosest = c.distanceMiles === minDistance;

      const matchRationale = this.generateRationale({
        equipmentMatch: c.equipmentMatch,
        driveHoursRemaining: c.driveHoursRemaining,
        distanceMiles: c.distanceMiles,
        isClosest,
        hasVehicle: !!c.driver.assignedVehicle,
      });

      return {
        driverId: c.driver.driverId,
        name: c.driver.name,
        initials,
        matchScore: Math.round(c.score),
        matchRationale,
        isBestMatch: index === 0,
        equipmentMatch: c.equipmentMatch,
        equipmentType: c.driver.assignedVehicle?.equipmentType ?? null,
        hos: {
          driveHoursRemaining: parseFloat(c.driveHoursRemaining.toFixed(2)),
          shiftHoursRemaining: parseFloat(c.shiftHoursRemaining.toFixed(2)),
          cycleHoursRemaining: parseFloat(c.cycleHoursRemaining.toFixed(2)),
          breakHoursRemaining: parseFloat(c.breakHoursRemaining.toFixed(2)),
          nextResetAt: c.nextResetAt,
        },
        proximity: {
          distanceMilesFromPickup: parseFloat(c.distanceMiles.toFixed(1)),
          lastKnownLocation: c.locationLabel,
        },
        availability: {
          status: c.availabilityStatus,
          currentLoadNumber: c.currentLoadNumber,
          currentLoadEta: null,
          availableAt: new Date().toISOString(),
        },
        vehicle: c.driver.assignedVehicle
          ? {
              vehicleId: c.driver.assignedVehicle.vehicleId,
              unitNumber: c.driver.assignedVehicle.unitNumber,
              equipmentType: c.driver.assignedVehicle.equipmentType,
            }
          : null,
        activeLoadCount: c.driver.loads.length,
      };
    });
  }

  /**
   * Calculate a 0–100 match score for a driver-load pairing.
   *
   * Breakdown:
   *   Equipment match   — 30 pts
   *   HOS drive hours   — 0-25 pts  (driveHoursRemaining / 11 * 25)
   *   Proximity         — 0-25 pts  (max(0, 1 - distanceMiles/500) * 25)
   *   Availability now  — 10 pts
   *   Active load count — 0-10 pts  (max(0, 10 - activeLoadCount * 5))
   */
  calculateMatchScore(input: MatchScoreInput): number {
    const { equipmentMatch, driveHoursRemaining, distanceMiles, isAvailable, activeLoadCount } = input;

    const equipmentScore = equipmentMatch ? 30 : 0;

    const hosScore = Math.min(25, (Math.max(0, driveHoursRemaining) / MAX_DRIVE_HOURS) * 25);

    const proximityScore = Math.max(0, (1 - distanceMiles / MAX_PROXIMITY_MILES) * 25);

    const availabilityScore = isAvailable ? 10 : 0;

    const loadCountScore = Math.max(0, 10 - activeLoadCount * 5);

    return equipmentScore + hosScore + proximityScore + availabilityScore + loadCountScore;
  }

  /**
   * Generate a short human-readable rationale for why a driver was ranked.
   */
  generateRationale(input: RationaleInput & { hasVehicle?: boolean }): string {
    const { equipmentMatch, driveHoursRemaining, isClosest, hasVehicle } = input;

    const hasFullHos = driveHoursRemaining >= MAX_DRIVE_HOURS * 0.9;
    const needsReset = driveHoursRemaining <= 0;

    // Build the differentiating part first (HOS + proximity)
    let differentiator = '';
    if (isClosest && hasFullHos) {
      differentiator = 'Closest · full HOS';
    } else if (isClosest) {
      differentiator = needsReset ? 'Closest · needs reset' : `Closest · ${driveHoursRemaining.toFixed(1)}h HOS`;
    } else if (hasFullHos) {
      differentiator = 'Full HOS available';
    } else if (needsReset) {
      differentiator = 'Needs HOS reset';
    } else {
      differentiator = `${driveHoursRemaining.toFixed(1)}h drive remaining`;
    }

    // Equipment mismatch or no vehicle — prepend warning but still show differentiator
    if (!equipmentMatch) {
      if (hasVehicle === false) {
        return `No vehicle assigned · ${differentiator}`;
      }
      return `Equipment mismatch · ${differentiator}`;
    }

    return differentiator;
  }

  /**
   * Haversine formula — returns distance in miles between two lat/lon points.
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 3_958.8; // Earth radius in miles
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
