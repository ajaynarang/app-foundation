import { Injectable, Logger } from '@nestjs/common';
import { LocationPrecision } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** ~11m at US latitudes. Same epsilon as StopsService.findOrCreateFromPlace. */
export const COORD_DEDUP_EPSILON = 0.0001;

interface MatchableStop {
  id: number;
  lat: number | null;
  lon: number | null;
  locationPrecision: LocationPrecision;
}

@Injectable()
export class StopMatchService {
  private readonly logger = new Logger(StopMatchService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Best-effort: attach a NON-BINDING merge suggestion when this stop is the same
   * precise place as an existing tenant stop. Only ROOFTOP→ROOFTOP within ~11m
   * qualifies — a CENTROID (city/ZIP-only) point must never snap onto a specific
   * dock, and two centroids are not "the same place." Never links; only suggests,
   * so the dispatcher confirms before anything is shared.
   */
  async suggestMerge(tenantId: number, stop: MatchableStop): Promise<void> {
    if (stop.lat == null || stop.lon == null) return;
    if (stop.locationPrecision !== LocationPrecision.ROOFTOP) return;

    const match = await this.prisma.stop.findFirst({
      where: {
        tenantId,
        isActive: true,
        id: { not: stop.id },
        locationPrecision: LocationPrecision.ROOFTOP,
        lat: { gte: stop.lat - COORD_DEDUP_EPSILON, lte: stop.lat + COORD_DEDUP_EPSILON },
        lon: { gte: stop.lon - COORD_DEDUP_EPSILON, lte: stop.lon + COORD_DEDUP_EPSILON },
      },
      select: { id: true, locationPrecision: true },
    });
    if (!match) return;

    await this.prisma.stop.update({
      where: { id: stop.id },
      data: { suggestedMergeStopId: match.id },
    });
    this.logger.log(`Stop ${stop.id} → merge suggestion ${match.id}. metric:stop.merge_suggested`);
  }
}
