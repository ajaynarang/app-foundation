import { Injectable, Logger } from '@nestjs/common';
import {
  IELDAdapter,
  ELDVehicleData,
  ELDDriverData,
  ELDVehicleLocationData,
  ELDDVIRData,
  ELDTrailerData,
  HOSClockData,
  ELDVehicleStat,
  VehicleStatsFeedResult,
} from './eld-adapter.interface';
import axios, { AxiosError } from 'axios';

/**
 * Custom error for 401 Unauthorized responses from Samsara.
 * Allows callers (EldSyncService) to detect auth failures and
 * trigger token refresh (OAuth) or mark NEEDS_RECONNECT (API token).
 */
export class SamsaraAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 401,
  ) {
    super(message);
    this.name = 'SamsaraAuthError';
  }
}

// Type aliases for backward compatibility — types now live in eld-adapter.interface.ts
export type SamsaraGpsPoint = import('./eld-adapter.interface').ELDGpsPoint;
export type SamsaraVehicleStat = ELDVehicleStat;
export type { HOSClockData, VehicleStatsFeedResult };

/**
 * Samsara ELD Adapter
 *
 * Fetches vehicle, driver, HOS, and location data from Samsara ELD API.
 * Uses the recommended /fleet/vehicles/stats endpoint for GPS data
 * (the legacy /fleet/vehicles/locations endpoint is deprecated by Samsara).
 *
 * API Documentation: https://developers.samsara.com/
 */
@Injectable()
export class SamsaraELDAdapter implements IELDAdapter {
  private readonly logger = new Logger(SamsaraELDAdapter.name);
  private readonly baseUrl = 'https://api.samsara.com';

  /**
   * Get all vehicles from Samsara ELD
   */
  async getVehicles(apiToken: string): Promise<ELDVehicleData[]> {
    this.logger.debug(`[VEHICLES] Calling GET /fleet/vehicles`);

    try {
      const response = await axios.get(`${this.baseUrl}/fleet/vehicles`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      const vehicles = response.data.data || [];
      this.logger.debug(`[VEHICLES] Received ${vehicles.length} vehicles from Samsara`);
      for (const v of vehicles.slice(0, 10)) {
        this.logger.debug(`[VEHICLES] id: ${v.id}, name: ${v.name}, vin: ${v.vin}, serial: ${v.serial}`);
      }

      return vehicles.map((v: any) => ({
        id: String(v.id),
        name: v.name,
        vin: v.vin,
        licensePlate: v.licensePlate,
        serial: v.serial,
        gateway: v.gateway,
        esn: v.esn,
        make: v.make,
        model: v.model,
        year: v.year,
        staticAssignedDriverId: v.staticAssignedDriver?.id ? String(v.staticAssignedDriver.id) : undefined,
        cameraSerial: v.cameraSerial,
      }));
    } catch (error) {
      this.handleApiError(error, 'VEHICLES');
    }
  }

  /**
   * Get all trailers from Samsara ELD
   */
  async getTrailers(apiToken: string): Promise<ELDTrailerData[]> {
    this.logger.debug(`[TRAILERS] Calling GET /fleet/trailers`);

    try {
      const response = await axios.get(`${this.baseUrl}/fleet/trailers`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      const trailers = response.data?.data || [];
      this.logger.debug(`[TRAILERS] Received ${trailers.length} trailers from Samsara`);
      for (const t of trailers.slice(0, 10)) {
        this.logger.debug(
          `[TRAILERS] id: ${t.id}, name: ${t.name}, serial: ${t.trailerSerialNumber}, plate: ${t.licensePlate}`,
        );
      }

      return trailers.map((t: any) => ({
        id: String(t.id),
        name: t.name,
        serialNumber: t.trailerSerialNumber,
        licensePlate: t.licensePlate,
        make: t.make,
        model: t.model,
        year: t.year,
        tags: t.tags,
      }));
    } catch (error) {
      this.handleApiError(error, 'TRAILERS');
    }
  }

  /**
   * Get all drivers from Samsara ELD
   */
  async getDrivers(apiToken: string): Promise<ELDDriverData[]> {
    this.logger.debug(`[DRIVERS] Calling GET /fleet/drivers`);

    try {
      const response = await axios.get(`${this.baseUrl}/fleet/drivers`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      const drivers = response.data.data || [];
      this.logger.debug(`[DRIVERS] Received ${drivers.length} drivers from Samsara`);
      for (const d of drivers.slice(0, 10)) {
        this.logger.debug(
          `[DRIVERS] id: ${d.id}, username: ${d.username}, phone: ${d.phone}, license: ${d.licenseNumber}`,
        );
      }

      return drivers.map((d: any) => ({
        id: String(d.id),
        name: d.name,
        username: d.username,
        phone: d.phone,
        licenseNumber: d.licenseNumber,
        licenseState: d.licenseState,
        driverActivationStatus: d.driverActivationStatus,
        eldSettings: d.eldSettings,
        carrierSettings: d.carrierSettings,
        tags: d.tags,
        timezone: d.timezone,
      }));
    } catch (error) {
      this.handleApiError(error, 'DRIVERS');
    }
  }

  /**
   * Get HOS clock data for all drivers from Samsara
   *
   * Real Samsara API response structure:
   * {
   *   data: [{
   *     driver: { id, name },
   *     currentDutyStatus: { hosStatusType: "driving" | "onDuty" | "offDuty" | "sleeperBerth" },
   *     clocks: {
   *       drive: { driveRemainingDurationMs },
   *       shift: { shiftRemainingDurationMs },
   *       cycle: { cycleRemainingDurationMs, cycleStartedAtTime, cycleTomorrowDurationMs },
   *       break: { timeUntilBreakDurationMs }
   *     },
   *     violations: { cycleViolationDurationMs, shiftDrivingViolationDurationMs }
   *   }]
   * }
   */
  async getHOSClocks(apiToken: string): Promise<HOSClockData[]> {
    this.logger.debug(`[HOS] Calling GET /fleet/hos/clocks`);

    try {
      const response = await axios.get(`${this.baseUrl}/fleet/hos/clocks`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      const rawEntries = response.data.data || [];
      this.logger.debug(`[HOS] Received ${rawEntries.length} clock entries from Samsara`);

      // Log each raw entry for debugging
      for (const entry of rawEntries) {
        this.logger.debug(
          `[HOS] Raw clock — driverId: ${entry.driver?.id}, name: ${entry.driver?.name}, ` +
            `status: ${entry.currentDutyStatus?.hosStatusType}, ` +
            `driveRemaining: ${entry.clocks?.drive?.driveRemainingDurationMs}ms, ` +
            `shiftRemaining: ${entry.clocks?.shift?.shiftRemainingDurationMs}ms, ` +
            `cycleRemaining: ${entry.clocks?.cycle?.cycleRemainingDurationMs}ms, ` +
            `breakRemaining: ${entry.clocks?.break?.timeUntilBreakDurationMs}ms`,
        );
      }

      return rawEntries.map((entry: any) => ({
        driverId: entry.driver?.id ?? '',
        driverName: entry.driver?.name ?? '',
        currentDutyStatus: this.mapDutyStatus(entry.currentDutyStatus?.hosStatusType),
        driveTimeRemainingMs: entry.clocks?.drive?.driveRemainingDurationMs ?? 0,
        shiftTimeRemainingMs: entry.clocks?.shift?.shiftRemainingDurationMs ?? 0,
        cycleTimeRemainingMs: entry.clocks?.cycle?.cycleRemainingDurationMs ?? 0,
        timeUntilBreakMs: entry.clocks?.break?.timeUntilBreakDurationMs ?? 0,
        lastUpdated: new Date().toISOString(),
      }));
    } catch (error) {
      this.handleApiError(error, 'HOS');
    }
  }

  /**
   * Get GPS location data for all vehicles from Samsara
   *
   * Uses GET /fleet/vehicles/stats?types=gps (Samsara's recommended endpoint).
   * The legacy /fleet/vehicles/locations endpoint is deprecated.
   *
   * Real Samsara API response:
   * {
   *   data: [{
   *     id: "vehicleId",
   *     name: "Truck-01",
   *     gps: { latitude, longitude, speedMilesPerHour, headingDegrees, time }
   *   }]
   * }
   */
  async getVehicleLocations(apiToken: string): Promise<ELDVehicleLocationData[]> {
    this.logger.debug(`[GPS] Calling GET /fleet/vehicles/stats?types=gps`);

    try {
      const response = await axios.get(`${this.baseUrl}/fleet/vehicles/stats?types=gps`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      });

      const rawEntries = response.data.data || [];
      this.logger.debug(`[GPS] Received ${rawEntries.length} vehicle location entries from Samsara`);

      for (const entry of rawEntries) {
        this.logger.debug(
          `[GPS] Raw location — vehicleId: ${entry.id}, name: ${entry.name}, ` +
            `lat: ${entry.gps?.latitude}, lng: ${entry.gps?.longitude}, ` +
            `speed: ${entry.gps?.speedMilesPerHour}, time: ${entry.gps?.time}`,
        );
      }

      return rawEntries.map((entry: any) => ({
        vehicleId: entry.id ?? '',
        vin: entry.externalIds?.['samsara.vin'] ?? undefined,
        latitude: entry.gps?.latitude ?? 0,
        longitude: entry.gps?.longitude ?? 0,
        speed: entry.gps?.speedMilesPerHour ?? 0,
        heading: entry.gps?.headingDegrees ?? 0,
        timestamp: entry.gps?.time ?? new Date().toISOString(),
      }));
    } catch (error) {
      this.handleApiError(error, 'GPS');
    }
  }

  /**
   * Wrap axios errors: convert 401 into SamsaraAuthError so callers can
   * distinguish auth failures from transient network errors.
   */
  private handleApiError(error: unknown, context: string): never {
    if (error instanceof AxiosError && error.response?.status === 401) {
      this.logger.warn(`[${context}] Samsara API returned 401 Unauthorized — token may be expired or revoked`);
      throw new SamsaraAuthError(`Samsara API 401 Unauthorized during ${context}`);
    }
    throw error;
  }

  private mapDutyStatus(raw: string): HOSClockData['currentDutyStatus'] {
    const map: Record<string, HOSClockData['currentDutyStatus']> = {
      driving: 'driving',
      onDuty: 'onDuty',
      on_duty: 'onDuty',
      offDuty: 'offDuty',
      off_duty: 'offDuty',
      sleeperBerth: 'sleeperBerth',
      sleeper_berth: 'sleeperBerth',
    };
    return map[raw] ?? 'offDuty';
  }

  /**
   * Get vehicle stats via Samsara's feed (cursor-based) endpoint.
   * Returns delta changes since last cursor, with GPS, fuel, engine, odometer.
   */
  async getVehicleStatsFeed(apiToken: string, cursor?: string): Promise<VehicleStatsFeedResult> {
    const MAX_PAGES = 100;
    const MAX_CURSOR_RESETS = 3;
    let allData: SamsaraVehicleStat[] = [];
    let currentCursor = cursor ?? '';
    let hasNextPage = true;
    let page = 0;
    let cursorResets = 0;

    this.logger.debug(
      `[FEED] Starting vehicle stats feed (cursor: ${cursor ? cursor.substring(0, 20) + '...' : 'initial'})`,
    );

    while (hasNextPage && page < MAX_PAGES) {
      const params: Record<string, string> = {
        types: 'gps,fuelPercents,gpsOdometerMeters',
        decorations: 'engineStates',
      };
      if (currentCursor) params.after = currentCursor;

      try {
        const response = await axios.get(`${this.baseUrl}/fleet/vehicles/stats/feed`, {
          params,
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        const pageData = response.data.data || [];
        this.logger.debug(
          `[FEED] Page ${page + 1}: ${pageData.length} stats, hasNextPage: ${response.data.pagination.hasNextPage}`,
        );
        allData = allData.concat(pageData);
        currentCursor = response.data.pagination.endCursor;
        hasNextPage = response.data.pagination.hasNextPage;
        page++;
      } catch (error: any) {
        // 401 = auth failure, surface immediately (no point retrying with same token)
        if (error.response?.status === 401) {
          this.handleApiError(error, 'FEED');
        }
        // If cursor is stale/invalid, reset and retry from the beginning
        if (error.response?.status === 400 && currentCursor && cursorResets < MAX_CURSOR_RESETS) {
          this.logger.warn(
            `[FEED] Samsara stats feed 400 with cursor, resetting (attempt ${cursorResets + 1}/${MAX_CURSOR_RESETS}). ` +
              `Response: ${JSON.stringify(error.response?.data)}`,
          );
          currentCursor = '';
          cursorResets++;
          page++; // Increment page to prevent tight loop
          continue;
        }
        // Log the response body for debugging, then rethrow
        if (error.response?.data) {
          this.logger.error(
            `[FEED] Samsara stats feed error ${error.response?.status}: ${JSON.stringify(error.response?.data)}`,
          );
        }
        throw error;
      }
    }

    this.logger.debug(`[FEED] Complete: ${allData.length} total stats across ${page} pages`);

    // Log a sample of vehicle stats for debugging
    for (const stat of allData.slice(0, 5)) {
      this.logger.debug(
        `[FEED] Sample — vehicleId: ${stat.id}, name: ${stat.name}, ` +
          `gps: ${stat.gps?.[0] ? `${stat.gps[0].latitude},${stat.gps[0].longitude}` : 'none'}, ` +
          `fuel: ${Array.isArray(stat.fuelPercents) ? stat.fuelPercents[0]?.value : (stat.fuelPercents?.value ?? 'none')}%, ` +
          `engine: ${stat.engineStates?.[0]?.value ?? 'none'}, ` +
          `odometer: ${Array.isArray(stat.gpsOdometerMeters) ? stat.gpsOdometerMeters[0]?.value : (stat.gpsOdometerMeters?.value ?? 'none')}m`,
      );
    }

    return { data: allData, endCursor: currentCursor, hasNextPage: false };
  }

  /**
   * Get DVIRs from Samsara
   * Endpoint: GET /fleet/dvirs/history
   * Docs: https://developers.samsara.com/reference/getdvirhistory
   */
  async getDVIRs(apiToken: string, startDate: string): Promise<ELDDVIRData[]> {
    const MAX_PAGES = 100;
    let allDvirs: ELDDVIRData[] = [];
    let currentCursor = '';
    let hasNextPage = true;
    let page = 0;

    this.logger.debug(`[DVIR] Starting paginated GET /fleet/dvirs/history?startTime=${startDate}`);

    while (hasNextPage && page < MAX_PAGES) {
      const params: Record<string, string> = {
        startTime: startDate,
        endTime: new Date().toISOString(),
      };
      if (currentCursor) params.after = currentCursor;

      try {
        const response = await axios.get(`${this.baseUrl}/fleet/dvirs/history`, {
          headers: { Authorization: `Bearer ${apiToken}` },
          params,
        });

        const dvirs = response.data.data || [];
        this.logger.debug(
          `[DVIR] Page ${page + 1}: ${dvirs.length} DVIRs, hasNextPage: ${response.data.pagination?.hasNextPage ?? false}`,
        );

        const mapped: ELDDVIRData[] = dvirs.map((d: any) => ({
          id: d.id ?? '',
          vehicleId: d.vehicle?.id ?? '',
          vehicleName: d.vehicle?.name,
          driverId: d.driver?.id,
          driverName: d.driver?.name,
          trailerId: d.trailer?.id,
          trailerName: d.trailer?.name,
          trailerDefects: (d.trailerDefects ?? []).map((def: any) => ({
            description: def.comment ?? def.name ?? 'Unknown defect',
            severity: def.severity,
            mechanicNotes: def.mechanicsNotes,
          })),
          inspectionType: d.inspectionType === 'post_trip' ? 'post_trip' : 'pre_trip',
          condition: d.condition === 'satisfactory' ? 'satisfactory' : 'needs_repair',
          defects: (d.defects ?? []).map((def: any) => ({
            description: def.comment ?? def.name ?? 'Unknown defect',
            severity: def.severity,
            mechanicNotes: def.mechanicsNotes,
          })),
          mechanicSignedOff: !!d.mechanicOrAgentSignature,
          inspectedAt: d.startTime ?? d.inspectionTime ?? new Date().toISOString(),
        }));

        allDvirs = allDvirs.concat(mapped);
        currentCursor = response.data.pagination?.endCursor ?? '';
        hasNextPage = response.data.pagination?.hasNextPage ?? false;
        page++;
      } catch (error) {
        this.handleApiError(error, 'DVIR');
      }
    }

    this.logger.debug(`[DVIR] Complete: ${allDvirs.length} total DVIRs across ${page} pages`);

    return allDvirs;
  }

  /**
   * Test connection to Samsara API
   */
  async testConnection(apiToken: string): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/fleet/vehicles`, {
        headers: { Authorization: `Bearer ${apiToken}` },
        params: { limit: 1 },
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
