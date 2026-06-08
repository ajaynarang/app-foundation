import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../../platform-services/geocoding/geocoding.service';

interface StopGeocodeFields {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipCode?: string | null;
  name?: string | null;
}

const MIN_GEOCODE_CONFIDENCE = 0.5;

/**
 * Attempt to geocode a stop and update its coordinates.
 * Best-effort: logs and continues on failure (never blocks stop creation).
 */
@Injectable()
export class StopGeocodingService {
  private readonly logger = new Logger(StopGeocodingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {}

  async geocodeAndUpdateStop(stopId: number, fields: StopGeocodeFields): Promise<void> {
    await this.geocodeAndUpdateStopReturning(stopId, fields);
  }

  /**
   * Same best-effort geocode-and-persist as {@link geocodeAndUpdateStop}, but
   * returns the confidence (or null) so callers can derive a precision tier
   * without re-reading the stop or duplicating the confidence gate.
   */
  async geocodeAndUpdateStopReturning(
    stopId: number,
    fields: StopGeocodeFields,
  ): Promise<{ confidence: number } | null> {
    try {
      const result = await this.geocodingService.geocodeStop(fields);
      if (result && result.confidence >= MIN_GEOCODE_CONFIDENCE) {
        await this.prisma.stop.update({
          where: { id: stopId },
          data: { lat: result.latitude, lon: result.longitude },
        });
        this.logger.debug(
          `Geocoded stop ${stopId}: (${result.latitude}, ${result.longitude}) confidence=${result.confidence}`,
        );
        return { confidence: result.confidence };
      }
      this.logger.debug(`Geocoding returned no confident result for stop ${stopId}`);
      return null;
    } catch (error) {
      this.logger.warn(`Failed to geocode stop ${stopId}: ${error}`);
      return null;
    }
  }
}
