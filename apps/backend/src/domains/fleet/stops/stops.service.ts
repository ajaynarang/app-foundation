import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LocationType, Stop } from '@prisma/client';
import type { PlaceSuggestion } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { GeocodingService } from '../../platform-services/geocoding/geocoding.service';
import { clampPagination } from '../../../shared/utils/pagination';
import { ListStopsDto } from './dto/list-stops.dto';

/** Coordinate-dedup radius — 4 decimal places ≈ 11 metres. */
const COORD_DEDUP_EPSILON = 0.0001;

/** Round to 4 decimals — keeps coord-dedup query bounds free of IEEE-754 drift. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Honest fallback label for a stop with no facility name — "Fair Lawn, NJ".
 * Beats inventing "Unknown Facility" (which collided across cities, SQ-112) and
 * reads like a real location in lists. Falls back to "Unnamed stop" only when no
 * city/state are known either.
 */
function locationLabel(city?: string | null, state?: string | null): string {
  const parts = [city?.trim(), state?.trim()].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Unnamed stop';
}

@Injectable()
export class StopsService {
  private readonly logger = new Logger(StopsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocodingService: GeocodingService,
  ) {}

  /**
   * Search stops by name, address, or city — tenant-scoped.
   * Returns results with usage metadata (load count, avg dock hours).
   */
  async search(tenantId: number, query: string, limit = 20) {
    // Escape Prisma ILIKE special chars to prevent unexpected pattern matches
    const escaped = query.replace(/[%_]/g, '\\$&');
    const stops = await this.prisma.stop.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: escaped, mode: 'insensitive' } },
          { address: { contains: escaped, mode: 'insensitive' } },
          { city: { contains: escaped, mode: 'insensitive' } },
        ],
      },
      include: {
        _count: { select: { loadStops: true } },
        loadStops: {
          select: { estimatedDockHours: true, actualDockHours: true },
          take: 100,
        },
      },
      orderBy: { name: 'asc' },
      take: clampPagination({ limit }).take,
    });

    return stops.map((s) => {
      const dockHours = s.loadStops
        .map((ls) => ls.actualDockHours ?? ls.estimatedDockHours)
        .filter((h): h is number => h != null);
      const avgDockHours =
        dockHours.length > 0
          ? Math.round((dockHours.reduce((a, b) => a + b, 0) / dockHours.length) * 10) / 10
          : undefined;

      return {
        id: s.id,
        stopId: s.stopId,
        name: s.name,
        address: s.address,
        city: s.city,
        state: s.state,
        zipCode: s.zipCode,
        lat: s.lat,
        lon: s.lon,
        locationType: s.locationType,
        useCount: s._count.loadStops,
        avgDockHours,
      };
    });
  }

  /**
   * Get recent stops — stops from the most recent loads for this tenant.
   */
  async getRecent(tenantId: number, limit = 5) {
    const recentLoadStops = await this.prisma.loadStop.findMany({
      where: {
        load: { tenantId },
        stop: { isActive: true },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        stop: {
          include: {
            _count: { select: { loadStops: true } },
          },
        },
      },
    });

    // Deduplicate by stop ID, keep first (most recent) occurrence
    const seen = new Set<number>();
    const uniqueStops: typeof recentLoadStops = [];
    for (const ls of recentLoadStops) {
      if (!seen.has(ls.stop.id)) {
        seen.add(ls.stop.id);
        uniqueStops.push(ls);
      }
      if (uniqueStops.length >= limit) break;
    }

    return uniqueStops.map((ls) => ({
      id: ls.stop.id,
      stopId: ls.stop.stopId,
      name: ls.stop.name,
      address: ls.stop.address,
      city: ls.stop.city,
      state: ls.stop.state,
      zipCode: ls.stop.zipCode,
      lat: ls.stop.lat,
      lon: ls.stop.lon,
      locationType: ls.stop.locationType,
      useCount: ls.stop._count.loadStops,
      avgDockHours: undefined,
    }));
  }

  /**
   * Find existing stop by normalized address + zip, or create a new one.
   * This is the core dedup logic.
   */
  async findOrCreate(
    tenantId: number,
    data: {
      name: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      lat?: number | null;
      lon?: number | null;
    },
  ) {
    // Try to find existing stop by normalized address + zip within tenant
    if (data.address && data.zipCode) {
      const normalizedAddress = this.normalizeAddress(data.address);
      const normalizedZip = data.zipCode.trim().slice(0, 5);

      const candidates = await this.prisma.stop.findMany({
        where: {
          tenantId,
          isActive: true,
          zipCode: { startsWith: normalizedZip },
        },
        take: 100,
      });

      for (const candidate of candidates) {
        if (candidate.address) {
          const existingNorm = this.normalizeAddress(candidate.address);
          if (existingNorm === normalizedAddress) {
            this.logger.log(`Dedup: matched stop "${data.name}" to existing "${candidate.name}" (id=${candidate.id})`);
            return { stop: candidate, isNew: false };
          }
        }
      }
    }

    // NOTE: no name-only fallback. Matching by name alone collapsed two
    // different places that share a generic name (e.g. "Unknown Facility" in
    // different cities) onto one stop — the SQ-112 wrong-location bug. Dedup is
    // by normalized address+ZIP only; everything else creates a fresh stop.

    // No match — create new stop. Coordinates are persisted when the caller
    // supplies them (e.g. picker-sourced from a HERE Autosuggest pick), so the
    // downstream geocode-on-create step is skipped.
    const stopId = `STOP-${randomUUID().slice(0, 12)}`;
    const stop = await this.prisma.stop.create({
      data: {
        stopId,
        name: data.name,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        lat: data.lat ?? null,
        lon: data.lon ?? null,
        locationType: LocationType.WAREHOUSE,
        isActive: true,
        tenantId,
      },
    });

    return { stop, isNew: true };
  }

  /**
   * Create a fresh Stop for an imported load leg — NO tenant dedup. Document
   * imports (rate-cons) must keep each parsed location as its own record rather
   * than silently snapping onto a pre-existing stop; merging is offered later as
   * a reviewed suggestion (StopMatchService), never forced at write time.
   *
   * When the document gives no facility name we use a location label ("Fair Lawn,
   * NJ") instead of inventing a generic "Unknown Facility" placeholder — the
   * latter was the SQ-112 collision source and reads dishonestly. The paired
   * LoadStop is flagged `facilityUnverified` so the dispatcher confirms the dock.
   */
  async createImportStop(
    tenantId: number,
    data: {
      name?: string | null;
      address?: string | null;
      city?: string | null;
      state?: string | null;
      zipCode?: string | null;
    },
  ): Promise<Stop> {
    const stopId = `STOP-${randomUUID().slice(0, 12)}`;
    return this.prisma.stop.create({
      data: {
        stopId,
        name: data.name?.trim() || locationLabel(data.city, data.state),
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        locationType: LocationType.WAREHOUSE,
        isActive: true,
        tenantId,
      },
    });
  }

  /**
   * Find-or-create a Stop from an external Places suggestion (HERE Autosuggest etc.).
   *
   * The suggestion already carries coordinates, so this first dedups by proximity
   * (within ~11m) — catching the case where two differently-typed addresses resolve
   * to the same place — then falls back to the address/name dedup in findOrCreate.
   * No geocoding round-trip: the picker provides lat/lon inline.
   */
  async findOrCreateFromPlace(
    tenantId: number,
    suggestion: PlaceSuggestion,
    overrideName?: string,
  ): Promise<{ stop: Stop; isNew: boolean }> {
    if (suggestion.lat == null || suggestion.lon == null) {
      throw new BadRequestException('This suggestion has no location coordinates');
    }

    const lat = round4(suggestion.lat);
    const lon = round4(suggestion.lon);
    const existing = await this.prisma.stop.findFirst({
      where: {
        tenantId,
        isActive: true,
        lat: { gte: round4(lat - COORD_DEDUP_EPSILON), lte: round4(lat + COORD_DEDUP_EPSILON) },
        lon: { gte: round4(lon - COORD_DEDUP_EPSILON), lte: round4(lon + COORD_DEDUP_EPSILON) },
      },
    });
    if (existing) {
      this.logger.log(`Dedup: matched place to existing stop by coordinates (id=${existing.id})`);
      return { stop: existing, isNew: false };
    }

    return this.findOrCreate(tenantId, {
      name: overrideName ?? suggestion.text,
      address: suggestion.street ?? undefined,
      city: suggestion.city ?? undefined,
      state: suggestion.state ?? undefined,
      zipCode: suggestion.zipCode ?? undefined,
      lat: suggestion.lat,
      lon: suggestion.lon,
    });
  }

  /**
   * List stops with pagination and filters.
   */
  async list(tenantId: number, dto: ListStopsDto) {
    const { q, type, state, page = 1, limit = 25, sortBy = 'name', sortOrder = 'asc' } = dto;

    const where: any = {
      OR: [{ tenantId }, { tenantId: null }],
      isActive: true,
    };

    if (q) {
      where.AND = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { address: { contains: q, mode: 'insensitive' } },
          { city: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    if (type) {
      where.locationType = type;
    }

    if (state) {
      where.state = { equals: state, mode: 'insensitive' };
    }

    const allowedSortFields = ['name', 'city', 'state', 'locationType', 'createdAt'];
    const orderField = allowedSortFields.includes(sortBy) ? sortBy : 'name';

    const [items, total] = await Promise.all([
      this.prisma.stop.findMany({
        where,
        orderBy: { [orderField]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: {
            select: { loadStops: true },
          },
        },
      }),
      this.prisma.stop.count({ where }),
    ]);

    return {
      items: items.map((s) => {
        const { _count, ...rest } = s;
        return {
          ...rest,
          loadCount: _count.loadStops,
          isEditable: s.tenantId === tenantId,
        };
      }),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single stop by ID — tenant-scoped.
   */
  async getById(tenantId: number, id: number) {
    const stop = await this.prisma.stop.findFirst({
      where: {
        id,
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: {
        _count: {
          select: { loadStops: true },
        },
      },
    });

    if (!stop) return null;

    const { _count, ...rest } = stop;
    return {
      ...rest,
      loadCount: _count.loadStops,
      isEditable: stop.tenantId === tenantId,
    };
  }

  /**
   * Update an existing stop's details — tenant-scoped.
   */
  async update(
    tenantId: number,
    stopId: number,
    data: {
      name?: string;
      address?: string;
      city?: string;
      state?: string;
      zipCode?: string;
      locationType?: LocationType;
      contactName?: string;
      contactPhone?: string;
      contactEmail?: string;
      operatingHours?: Record<string, { open: string; close: string }>;
      appointmentRequired?: boolean;
      notes?: string;
    },
  ) {
    const stop = await this.prisma.stop.findFirst({
      where: { id: stopId, tenantId, isActive: true },
    });
    if (!stop) return null;

    // Detect if address-related fields changed — triggers re-geocoding
    const addressChanged =
      (data.address !== undefined && data.address !== stop.address) ||
      (data.city !== undefined && data.city !== stop.city) ||
      (data.state !== undefined && data.state !== stop.state) ||
      (data.zipCode !== undefined && data.zipCode !== stop.zipCode);

    const updated = await this.prisma.stop.update({
      where: { id: stopId },
      data: {
        name: data.name ?? stop.name,
        address: data.address !== undefined ? data.address || null : stop.address,
        city: data.city !== undefined ? data.city || null : stop.city,
        state: data.state !== undefined ? data.state || null : stop.state,
        zipCode: data.zipCode !== undefined ? data.zipCode || null : stop.zipCode,
        locationType: data.locationType ?? stop.locationType,
        contactName: data.contactName !== undefined ? data.contactName || null : stop.contactName,
        contactPhone: data.contactPhone !== undefined ? data.contactPhone || null : stop.contactPhone,
        contactEmail: data.contactEmail !== undefined ? data.contactEmail || null : stop.contactEmail,
        operatingHours: data.operatingHours !== undefined ? data.operatingHours : stop.operatingHours,
        appointmentRequired: data.appointmentRequired ?? stop.appointmentRequired,
        notes: data.notes !== undefined ? data.notes || null : stop.notes,
      },
    });

    // Re-geocode if address changed
    if (addressChanged) {
      this.logger.log(`Address changed for stop ${stopId} — re-geocoding`);
      try {
        const result = await this.geocodingService.geocodeStop({
          address: updated.address,
          city: updated.city,
          state: updated.state,
          zipCode: updated.zipCode,
          name: updated.name,
        });
        if (result && result.confidence >= 0.5) {
          const regeocoded = await this.prisma.stop.update({
            where: { id: stopId },
            data: { lat: result.latitude, lon: result.longitude },
          });
          return regeocoded;
        }
      } catch (error) {
        this.logger.warn(`Re-geocoding failed for stop ${stopId}: ${error}`);
      }
    }

    return updated;
  }

  /**
   * Normalize an address string for comparison.
   * Lowercases, strips punctuation, normalizes common abbreviations.
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .trim()
      .replace(/[.,#]/g, '')
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\bboulevard\b/g, 'blvd')
      .replace(/\bdrive\b/g, 'dr')
      .replace(/\broad\b/g, 'rd')
      .replace(/\blane\b/g, 'ln')
      .replace(/\bcourt\b/g, 'ct')
      .replace(/\bplace\b/g, 'pl')
      .replace(/\bnorth\b/g, 'n')
      .replace(/\bsouth\b/g, 's')
      .replace(/\beast\b/g, 'e')
      .replace(/\bwest\b/g, 'w')
      .replace(/\bsuite\b/g, 'ste')
      .replace(/\s+/g, ' ');
  }
}
