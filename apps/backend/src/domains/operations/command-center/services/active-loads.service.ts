import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { LoadStatus, LoadStopStatus, RoutePlanStatus, RouteSegmentStatus } from '@prisma/client';
import type { ActiveLoadView, ActiveLoadStop, ActiveLoadAssignmentState } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S, TOWER_CACHE_NAMESPACE } from '../../../../constants/cache.constants';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { EtaCalculatorService } from '../../monitoring/services/eta-calculator.service';
import { LOOKAHEAD_MAX_HOURS, LOOKAHEAD_MIN_HOURS } from '../tower.constants';

type GeoPoint = { lat: number; lon: number };

/**
 * Tower v3 — driver-centric view of "what's rolling right now".
 *
 * Pulls drivers with at least one IN_TRANSIT load, plus drivers whose next
 * ASSIGNED load picks up within `lookaheadHours`. The shape is deliberately
 * leaner than the legacy `ActiveLoadDto` so the v3 widget doesn't carry
 * settlement / route-plan / billing fields it never renders.
 */
@Injectable()
export class ActiveLoadsService {
  private readonly logger = new Logger(ActiveLoadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly integrationData: IntegrationDataService,
    private readonly etaCalculator: EtaCalculatorService,
  ) {}

  async findActiveLoads(tenantId: number, lookaheadHours: number): Promise<ActiveLoadView[]> {
    if (lookaheadHours < LOOKAHEAD_MIN_HOURS || lookaheadHours > LOOKAHEAD_MAX_HOURS) {
      throw new BadRequestException(`lookaheadHours must be between ${LOOKAHEAD_MIN_HOURS} and ${LOOKAHEAD_MAX_HOURS}`);
    }

    return this.cache.getOrSet<ActiveLoadView[]>(
      buildKey(TOWER_CACHE_NAMESPACE, 'active-loads', tenantId, lookaheadHours),
      () => this.compute(tenantId, lookaheadHours),
      CACHE_TTL_HOT_30S,
    );
  }

  private async compute(tenantId: number, lookaheadHours: number): Promise<ActiveLoadView[]> {
    const now = new Date();
    const cutoff = new Date(now.getTime() + lookaheadHours * 3600_000);

    const loads = await this.prisma.load.findMany({
      where: {
        tenantId,
        isActive: true,
        driverId: { not: null },
        OR: [
          { status: LoadStatus.IN_TRANSIT },
          {
            status: LoadStatus.ASSIGNED,
            pickupDate: { lte: cutoff },
          },
        ],
      },
      include: {
        driver: {
          select: {
            id: true,
            driverId: true,
            name: true,
            hosData: true,
            hosDataSyncedAt: true,
          },
        },
        vehicle: {
          select: { id: true, vehicleId: true, unitNumber: true },
        },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            // lat/lon feed the live GPS-based ETA — see computeEtaAt.
            stop: { select: { stopId: true, name: true, city: true, state: true, lat: true, lon: true } },
          },
        },
        // Active route plan (if any) carries the real ETA. Mirrors the join in
        // overview.service.ts — `route.eta` there comes from the same source.
        routePlanLoads: {
          where: { plan: { isActive: true, status: RoutePlanStatus.ACTIVE } },
          include: {
            plan: {
              include: {
                segments: { orderBy: { sequenceOrder: 'asc' } },
              },
            },
          },
          take: 1,
        },
      },
    });

    // First pass — synchronous: drop loads outside the rolling window and
    // shape the stops. ETA needs an async GPS lookup, so we collect the
    // survivors here and resolve all of their ETAs concurrently below.
    const candidates = loads
      .filter((load) => load.driver)
      .map((load) => {
        const assignmentState: ActiveLoadAssignmentState =
          load.status === LoadStatus.IN_TRANSIT ? 'assigned' : 'rolling';

        // ASSIGNED loads need a second-pass window check against the
        // next-pickup time. pickupDate is a date-only column; for rolling we
        // accept ASSIGNED loads whose next stop appointment falls inside the
        // lookahead window.
        if (assignmentState === 'rolling') {
          const nextPickup = this.computeNextPickupAt(load.stops);
          if (nextPickup && nextPickup.getTime() > cutoff.getTime()) {
            return null;
          }
        }

        const stopViews = load.stops.map((s) => this.mapStop(s));
        return {
          load,
          assignmentState,
          stopViews,
          currentStop: this.pickCurrentStop(stopViews, load.stops),
          nextStop: this.pickNextStop(stopViews, load.stops),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    // Second pass — resolve each load's live ETA concurrently. getEstimatedDriveMinutes
    // is coordinate-keyed and cached (30 min) with a Haversine fallback, so a
    // per-load call is cheap; Promise.all keeps the wall time flat for 50+ loads.
    const views = await Promise.all(
      candidates.map(async ({ load, assignmentState, currentStop, nextStop }) => {
        const etaAt = await this.computeEtaAt(load, now);
        const slackMinutes = this.computeSlackMinutes(nextStop, etaAt, now);

        return {
          // Phase 2 Task 10 — `Load.loadId` (string slug) was removed; `loadNumber`
          // is now the canonical public identifier. The Tower API contract keeps
          // both `loadId` and `loadNumber` fields; both carry `load.loadNumber`,
          // matching how sibling command-center services key load data.
          loadId: load.loadNumber,
          loadNumber: load.loadNumber,
          referenceNumber: load.referenceNumber ?? null,
          customerName: load.customerName ?? null,
          driver: {
            driverId: load.driver.driverId,
            name: load.driver.name,
            initials: this.initials(load.driver.name),
          },
          vehicleIdentifier: load.vehicle?.unitNumber ?? load.vehicle?.vehicleId ?? null,
          currentStop,
          nextStop,
          etaAt,
          slackMinutes,
          assignmentState,
          hos: this.mapHos(load.driver.hosData, load.driver.hosDataSyncedAt),
        } satisfies ActiveLoadView;
      }),
    );

    return views;
  }

  private mapStop(s: any): ActiveLoadStop {
    return {
      stopId: s.stop?.stopId ?? String(s.stopId),
      kind: s.actionType === 'delivery' ? 'delivery' : 'pickup',
      customerName: s.stop?.name ?? null,
      city: s.stop?.city ?? null,
      state: s.stop?.state ?? null,
      appointmentAt: this.composeAppointmentAt(s),
      arrivedAt: s.arrivedAt ? new Date(s.arrivedAt).toISOString() : null,
    };
  }

  private composeAppointmentAt(stop: any): string | null {
    if (!stop.appointmentDate) return null;
    const apptDate = new Date(stop.appointmentDate);
    if (Number.isNaN(apptDate.getTime())) return null;
    const dateStr = apptDate.toISOString().split('T')[0];

    // earliest/latestArrival is a free-form VarChar(30) — usually "HH:MM" or
    // "HH:MM:SS" but not guaranteed. Accept only a clean time-of-day token;
    // anything else (full ISO string, "8 AM", junk) falls back to midnight.
    const time = stop.latestArrival ?? stop.earliestArrival;
    const isHms = typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time.trim());
    const composed = isHms
      ? new Date(`${dateStr}T${time.trim().length === 5 ? `${time.trim()}:00` : time.trim()}.000Z`)
      : new Date(`${dateStr}T00:00:00.000Z`);

    return Number.isNaN(composed.getTime()) ? null : composed.toISOString();
  }

  private computeNextPickupAt(stops: any[]): Date | null {
    const nextPending = stops.find((s) => s.actionType !== 'delivery' && s.status !== LoadStopStatus.COMPLETED);
    if (!nextPending) return null;
    const iso = this.composeAppointmentAt(nextPending);
    return iso ? new Date(iso) : null;
  }

  private pickCurrentStop(views: ActiveLoadStop[], stops: any[]): ActiveLoadStop | null {
    // "Current" = the most recently arrived stop that hasn't departed/completed.
    // If none, fall back to the last completed stop.
    const arrivedIdx = stops.findIndex(
      (s) =>
        s.arrivedAt &&
        (!s.departedAt || s.status !== LoadStopStatus.COMPLETED) &&
        s.status !== LoadStopStatus.COMPLETED,
    );
    if (arrivedIdx >= 0) return views[arrivedIdx] ?? null;
    // Last completed stop (driver is between stops):
    let lastCompleted = -1;
    for (let i = 0; i < stops.length; i++) {
      if (stops[i].status === LoadStopStatus.COMPLETED) lastCompleted = i;
    }
    return lastCompleted >= 0 ? views[lastCompleted] : null;
  }

  private pickNextStop(views: ActiveLoadStop[], stops: any[]): ActiveLoadStop | null {
    const idx = stops.findIndex((s) => s.status !== LoadStopStatus.COMPLETED);
    return idx >= 0 ? views[idx] : null;
  }

  /**
   * Projected arrival time at the load's next not-yet-completed stop.
   *
   * ETA does NOT require a route plan. The baseline is a live estimate
   * derived from the truck's latest GPS position and the next stop's
   * coordinates — the same path `MonitoringEngineService` uses via
   * `EtaCalculatorService` (HERE truck routing, cached, Haversine fallback).
   * Manual / unplanned loads get a real ETA the moment the truck has a GPS
   * ping; no planning step is needed.
   *
   * Precedence:
   *  1. Route-plan ETA — if the load has an active plan whose dock segments
   *     carry an arrival estimate. Preferred because the plan is HOS- and
   *     rest-stop-aware, so its arrival accounts for mandated breaks. The
   *     GPS-corrected `updatedEta` wins over the static `estimatedArrival`.
   *  2. Live GPS ETA — `now + drive-minutes(truckPos → nextStop)`. The
   *     baseline for every GPS-tracked load, planned or not.
   *  3. `null` — no plan ETA and no resolvable GPS position or next-stop
   *     coordinate. Honest: no signal, no ETA.
   */
  private async computeEtaAt(load: any, now: Date): Promise<string | null> {
    const planEta = this.routePlanEtaAt(load.routePlanLoads);
    if (planEta) return planEta;

    return this.liveGpsEtaAt(load, now);
  }

  /**
   * HOS/rest-aware ETA from the load's active route plan, when one exists.
   *
   * The plan's dock segments carry a per-stop arrival estimate; the next
   * not-yet-completed dock is the truck's next destination. `updatedEta` is
   * the GPS-corrected estimate (set by the progress tracker) and is preferred
   * over the static planned `estimatedArrival`. Falls back to the plan-wide
   * `estimatedArrival` when no dock segment carries one. Returns null when the
   * load has no active plan — the caller then uses the live GPS baseline.
   */
  private routePlanEtaAt(routePlanLoads: any[] | undefined): string | null {
    const plan = routePlanLoads?.[0]?.plan;
    if (!plan) return null;

    const segments: any[] = plan.segments ?? [];
    const nextDock = segments.find((s) => s.segmentType === 'dock' && s.status !== RouteSegmentStatus.COMPLETED);
    const segmentEta = nextDock?.updatedEta ?? nextDock?.estimatedArrival;
    const eta = segmentEta ?? plan.estimatedArrival;
    if (!eta) return null;

    const parsed = new Date(eta);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  /**
   * Live ETA = now + estimated drive-minutes from the truck's latest GPS
   * position to the next stop. Returns null when either coordinate is
   * missing — no GPS ping or no stop geocode means no honest estimate.
   */
  private async liveGpsEtaAt(load: any, now: Date): Promise<string | null> {
    const nextStopCoord = this.nextStopCoord(load.stops);
    if (!nextStopCoord) return null;

    const truckPosition = await this.resolveTruckPosition(load);
    if (!truckPosition) return null;

    const driveMinutes = await this.etaCalculator.getEstimatedDriveMinutes(truckPosition, nextStopCoord);
    if (driveMinutes == null) return null;

    return new Date(now.getTime() + driveMinutes * 60_000).toISOString();
  }

  /** Coordinates of the next not-yet-completed stop, or null when ungeocoded. */
  private nextStopCoord(stops: any[]): GeoPoint | null {
    const nextPending = stops.find((s) => s.status !== LoadStopStatus.COMPLETED);
    const lat = nextPending?.stop?.lat;
    const lon = nextPending?.stop?.lon;
    return typeof lat === 'number' && typeof lon === 'number' ? { lat, lon } : null;
  }

  /**
   * Latest GPS position of the load's truck, from the ELD telematics cache
   * (Redis → Postgres fallback) — the same source monitoring reads. Returns
   * null when the load has no vehicle or the vehicle has no recent ping.
   */
  private async resolveTruckPosition(load: any): Promise<GeoPoint | null> {
    const vehicleId: string | undefined = load.vehicle?.vehicleId;
    if (!vehicleId) return null;

    const gps = await this.integrationData.getVehicleLocation(load.tenantId, vehicleId).catch((err) => {
      this.logger.warn(`GPS lookup failed for vehicle ${vehicleId}: ${(err as Error).message}`);
      return null;
    });
    if (gps == null || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') {
      return null;
    }
    return { lat: gps.latitude, lon: gps.longitude };
  }

  /**
   * Minutes of slack against the next stop's appointment.
   *
   * When a projected ETA exists (GPS-based or plan-based — see computeEtaAt),
   * slack is `appointment − ETA`: how early (+) or late (−) the truck is
   * projected to arrive. This is what the risk score actually wants. When no
   * ETA could be computed (no GPS ping and no plan), fall back to
   * `appointment − now`: a coarser "time left on the clock" proxy that at
   * least flags appointments the truck cannot physically still make.
   */
  private computeSlackMinutes(nextStop: ActiveLoadStop | null, etaAt: string | null, now: Date): number | null {
    if (!nextStop || !nextStop.appointmentAt) return null;
    const appt = new Date(nextStop.appointmentAt);
    if (Number.isNaN(appt.getTime())) return null;

    const reference = etaAt ? new Date(etaAt) : now;
    if (Number.isNaN(reference.getTime())) return null;

    return Math.round((appt.getTime() - reference.getTime()) / 60_000);
  }

  private mapHos(hosData: any, syncedAt: Date | null): ActiveLoadView['hos'] {
    if (!hosData) return null;
    const h = hosData as Record<string, unknown>;
    const driveMs = h.driveTimeRemainingMs;
    // Drive is the anchor clock — without it there is no usable HOS snapshot.
    if (typeof driveMs !== 'number') return null;

    const toMinutes = (ms: unknown): number => (typeof ms === 'number' ? Math.round(ms / 60_000) : 0);
    return {
      driveMinutesRemaining: Math.round(driveMs / 60_000),
      dutyMinutesRemaining: toMinutes(h.shiftTimeRemainingMs),
      cycleMinutesRemaining: toMinutes(h.cycleTimeRemainingMs),
      // Break clock is optional in the feed — null when the ELD doesn't report it.
      breakMinutesRemaining: typeof h.timeUntilBreakMs === 'number' ? Math.round(h.timeUntilBreakMs / 60_000) : null,
      isEldConnected: !!syncedAt,
      lastSyncAt: syncedAt ? new Date(syncedAt).toISOString() : null,
    };
  }

  private initials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2);
  }
}
