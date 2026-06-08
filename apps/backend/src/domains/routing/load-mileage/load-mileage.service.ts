import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { LoadBillingStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { QUEUE_NAMES, GEO_COMPUTE_JOB_NAMES, bullJobIdFromDbId } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { MileageService } from '../../platform-services/mileage/mileage.service';
import {
  LOAD_MILEAGE_BACKOFF_MS,
  LOAD_MILEAGE_MAX_ATTEMPTS,
  LOAD_MILEAGE_MIN_STOPS,
  LOAD_MILEAGE_RECOMPUTE_DEBOUNCE_MS,
} from './load-mileage.constants';

/**
 * Billing states where the invoice is already posted — recompute is skipped so
 * system-computed mileage can't shift figures a customer has already been billed on.
 */
const POSTED_BILLING_STATES: ReadonlySet<LoadBillingStatus> = new Set([
  LoadBillingStatus.INVOICED,
  LoadBillingStatus.CLOSED,
]);

interface LegUpdate {
  loadStopId: number;
  miles: number;
  driveHours: number;
}

interface ComputedLegs {
  legs: LegUpdate[];
  /** Provider string reported by the resolved IMileageProvider (single source of truth). */
  provider: string;
}

/** A LoadStop whose Stop has been confirmed to carry coordinates. */
interface GeocodedStop {
  id: number;
  stop: { lat: number; lon: number };
}

@Injectable()
export class LoadMileageService {
  private readonly logger = new Logger(LoadMileageService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.GEO_COMPUTE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly mileage: MileageService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Schedule an async mileage recompute for a load. Debounced + deduped by loadId:
   * rapid edits (stop drag-reorder) collapse to a single HERE Routing call.
   *
   * Tenant id is looked up from the load so the BullMQ payload carries the same
   * envelope shape every other queue uses (correlation id, trace id, dead-letter
   * attribution). If the load is missing we still enqueue with a synthetic
   * tenant id of "0" — the worker recompute is a no-op for an unknown load.
   */
  async enqueueRecalc(loadId: number): Promise<void> {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      select: { tenantId: true },
    });
    const tenantId = load ? String(load.tenantId) : '0';

    const envelope = buildJobEnvelope(
      { loadId },
      {
        tenantId,
        source: 'api',
      },
    );

    await this.queue.add(GEO_COMPUTE_JOB_NAMES.LOAD_MILEAGE_RECALC, envelope, {
      jobId: bullJobIdFromDbId('load-mileage', loadId),
      delay: LOAD_MILEAGE_RECOMPUTE_DEBOUNCE_MS,
      attempts: LOAD_MILEAGE_MAX_ATTEMPTS,
      backoff: { type: 'exponential', delay: LOAD_MILEAGE_BACKOFF_MS },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });
  }

  /**
   * Recompute total miles + drive hours for a load via HERE Routing, leg by leg,
   * and persist onto Load + each LoadStop. Quietly degrades — a failed leg leaves
   * the load untouched so the next enqueue retries.
   */
  async recompute(loadId: number): Promise<void> {
    const load = await this.prisma.load.findUnique({
      where: { id: loadId },
      include: { stops: { include: { stop: true }, orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!load) return;

    if (load.billingStatus && POSTED_BILLING_STATES.has(load.billingStatus)) {
      this.logger.debug(`Load ${loadId} billing posted (${load.billingStatus}) — skipping mileage recompute`);
      return;
    }

    const geocoded = load.stops.filter(
      (ls): ls is typeof ls & GeocodedStop => ls.stop.lat != null && ls.stop.lon != null,
    );
    if (geocoded.length < LOAD_MILEAGE_MIN_STOPS) {
      this.logger.debug(`Load ${loadId} has < ${LOAD_MILEAGE_MIN_STOPS} geocoded stops — skipping mileage`);
      return;
    }

    const computed = await this.computeLegs(loadId, geocoded);
    if (!computed) return; // a leg failed — quietly degraded, next enqueue retries

    const { legs, provider } = computed;
    const totalMiles = this.round2(legs.reduce((sum, l) => sum + l.miles, 0));
    const totalHours = this.round2(legs.reduce((sum, l) => sum + l.driveHours, 0));

    await this.persist(loadId, legs, totalMiles, totalHours, provider);

    await this.events.emit(SALLY_EVENTS.LOAD_MILEAGE_CALCULATED, load.tenantId, {
      loadNumber: load.loadNumber,
      totalMiles,
      estimatedDriveHours: totalHours,
      provider,
    });
  }

  private async computeLegs(loadId: number, geocoded: GeocodedStop[]): Promise<ComputedLegs | null> {
    const legs: LegUpdate[] = [];
    let provider = '';
    for (let i = 0; i < geocoded.length - 1; i++) {
      const from = geocoded[i];
      const to = geocoded[i + 1];
      try {
        const result = await this.mileage.getTruckMiles(
          { latitude: from.stop.lat, longitude: from.stop.lon },
          { latitude: to.stop.lat, longitude: to.stop.lon },
        );
        provider = result.provider;
        legs.push({
          loadStopId: from.id,
          miles: result.practical_miles,
          driveHours: result.duration_hours ?? 0,
        });
      } catch (err) {
        this.logger.warn(`Leg miles failed for load ${loadId} stop ${from.id}→${to.id}: ${(err as Error).message}`);
        return null;
      }
    }
    return { legs, provider };
  }

  private async persist(
    loadId: number,
    legs: LegUpdate[],
    totalMiles: number,
    totalHours: number,
    provider: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      ...legs.map((leg) =>
        this.prisma.loadStop.update({
          where: { id: leg.loadStopId },
          data: { legMilesToNext: leg.miles, legDriveHoursToNext: leg.driveHours },
        }),
      ),
      this.prisma.load.update({
        where: { id: loadId },
        data: {
          totalMiles,
          estimatedDriveHours: totalHours,
          mileageProvider: provider,
          mileageCalculatedAt: new Date(),
        },
      }),
    ]);
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
}
