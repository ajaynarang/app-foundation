import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { LocationType, LoadStatus, LoadBillingStatus } from '@prisma/client';
import {
  LEG_STATUS_TRANSITIONS,
  LoadLegStatusSchema,
  LoadStopStatusSchema,
  type LoadLegStatus,
  type ExchangeRemovalResolution,
} from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

/** Transaction client type extracted from Prisma's $transaction callback */
type PrismaTransactionClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

const LEG_STATUS = LoadLegStatusSchema.enum;
const STOP_STATUS = LoadStopStatusSchema.enum;

@Injectable()
export class LoadLegService {
  private readonly logger = new Logger(LoadLegService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly cache: SallyCacheService,
  ) {}

  // ─── Create Legs from Exchange Points ───────────────────────────────────────

  async createLegsFromExchangePoints(loadId: number, exchangeStopIds: number[], tenantId: number) {
    // 1. Validate load exists, is relay, and in draft/pending
    const load = await this.prisma.load.findFirst({
      where: { id: loadId, tenantId },
      include: {
        stops: { orderBy: { sequenceOrder: 'asc' } },
      },
    });

    if (!load) {
      throw new NotFoundException(`Load #${loadId} not found`);
    }
    if (!load.isRelay) {
      throw new BadRequestException(`Load #${loadId} is not a relay load. Set isRelay=true first.`);
    }
    if (!['DRAFT', 'PENDING'].includes(load.status)) {
      throw new BadRequestException(
        `Cannot create legs for load in "${load.status}" status. Must be draft or pending.`,
      );
    }

    // Guard: if legs already exist, only allow re-creation when ALL are pending with no driver
    const existingLegs = await this.prisma.loadLeg.findMany({
      where: { loadId, tenantId },
    });
    if (existingLegs.length > 0) {
      const hasAssignedOrAdvanced = existingLegs.some((l) => l.status !== LEG_STATUS.PENDING || l.driverId !== null);
      if (hasAssignedOrAdvanced) {
        throw new BadRequestException(
          'Cannot reconfigure exchange points — legs already have drivers assigned or are no longer pending',
        );
      }
    }

    const stops = load.stops;
    if (stops.length < 2) {
      throw new BadRequestException('Load must have at least 2 stops');
    }

    // 2. Validate exchange stops exist on this load
    const stopIds = new Set(stops.map((s) => s.id));
    for (const esId of exchangeStopIds) {
      if (!stopIds.has(esId)) {
        throw new BadRequestException(`Stop #${esId} does not belong to load #${loadId}`);
      }
    }

    // 3. Validate: exchange stops are not first or last stop
    const firstStopId = stops[0].id;
    const lastStopId = stops[stops.length - 1].id;
    for (const esId of exchangeStopIds) {
      if (esId === firstStopId) {
        throw new BadRequestException('Exchange stop cannot be the first stop (must be a pickup)');
      }
      if (esId === lastStopId) {
        throw new BadRequestException('Exchange stop cannot be the last stop (must be a delivery)');
      }
    }

    // 4. Validate first stop is pickup, last is delivery
    if (stops[0].actionType !== 'pickup') {
      throw new BadRequestException('First stop must be a pickup');
    }
    if (stops[stops.length - 1].actionType !== 'delivery') {
      throw new BadRequestException('Last stop must be a delivery');
    }

    // 5. Validate no adjacent exchange stops
    const exchangeSet = new Set(exchangeStopIds);
    const sortedStops = stops.map((s) => s.id);
    let prevWasExchange = false;
    for (const sid of sortedStops) {
      const isExchange = exchangeSet.has(sid);
      if (isExchange && prevWasExchange) {
        throw new BadRequestException(
          'Cannot have adjacent exchange stops — each leg must contain at least one non-exchange stop',
        );
      }
      prevWasExchange = isExchange;
    }

    // 6. Build leg boundaries from stops and exchange points
    // Exchange stops act as boundaries between legs.
    // Leg 1: first stop -> first exchange
    // Leg 2: first exchange -> second exchange (or final delivery)
    // Leg N: last exchange -> final delivery
    const boundaries: number[] = [0]; // indices into sorted stops
    for (let i = 0; i < stops.length; i++) {
      if (exchangeSet.has(stops[i].id)) {
        boundaries.push(i);
      }
    }
    boundaries.push(stops.length - 1);

    // Build short loadId for legId generation
    const loadShort = load.loadNumber || String(loadId);

    // 7. Delete existing legs (if re-creating) and create new ones in a transaction
    const legs = await this.prisma.$transaction(async (tx) => {
      // Delete existing legs for this load
      await tx.loadLeg.deleteMany({
        where: { loadId, tenantId },
      });

      // Mark exchange stop actionType:
      // - Pattern A (dedicated handoff location): set actionType to 'exchange'
      // - Pattern B (existing customer stop as leg boundary): keep original actionType
      //   The leg boundary is determined by being in exchangeStopIds, not by actionType.
      for (const esId of exchangeStopIds) {
        const stop = stops.find((s) => s.id === esId);
        if (stop && stop.actionType === 'exchange') {
          // Already marked as exchange (re-creation case) — no-op
        } else if (stop && ['pickup', 'delivery', 'both'].includes(stop.actionType)) {
          // Pattern B: customer stop used as exchange — keep original type
          // The stop serves dual purpose: customer delivery + driver handoff
        } else {
          // Pattern A: new stop with no customer-facing type — mark as exchange
          await tx.loadStop.update({
            where: { id: esId },
            data: { actionType: 'exchange' },
          });
        }
      }

      // Create legs from boundaries
      const created = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        const originIdx = boundaries[i];
        const destIdx = boundaries[i + 1];
        const sequence = i + 1;
        const legIdStr = `LEG-${loadShort}-${sequence}`;

        const leg = await tx.loadLeg.create({
          data: {
            legId: legIdStr,
            sequence,
            status: LEG_STATUS.PENDING,
            originStopId: stops[originIdx].id,
            destStopId: stops[destIdx].id,
            loadId,
            tenantId,
          },
          include: {
            originStop: { include: { stop: true } },
            destStop: { include: { stop: true } },
          },
        });

        created.push(leg);
      }

      return created;
    });

    this.logger.log(`Created ${legs.length} legs for relay load #${loadId} (tenant ${tenantId})`);

    await this.events.emit(SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED, tenantId, {
      entityId: String(loadId),
      entityType: 'load',
      loadId,
      legCount: legs.length,
      legIds: legs.map((l) => l.legId),
      action: 'legs_created',
    });

    return legs;
  }

  // ─── Remove Exchange Point ──────────────────────────────────────────────────
  //
  // Inverse of `createLegsFromExchangePoints` for a single exchange. The hard
  // part is deciding what "remove" means for a given stop, because we don't
  // persist provenance (whether the exchange was added net-new vs promoted from
  // a customer stop). We infer it at runtime from already-available signals
  // — see `classifyExchangeRemoval` for the rule table.

  /**
   * Pure classifier — given the snapshot of a Stop and how it appears on this
   * load + sibling loads, decide whether removing it as an exchange should
   * delete the LoadStop row entirely or just revert its actionType.
   *
   * Static so it's trivially testable without mocking Prisma.
   */
  static classifyExchangeRemoval(input: {
    stopLocationType: LocationType;
    actualPieces: number | null;
    siblingUsageCount: number;
  }): {
    resolution: ExchangeRemovalResolution | null;
    reasonCode:
      | 'pattern_a_clear'
      | 'pattern_b_clear_location_type'
      | 'pattern_b_clear_freight'
      | 'pattern_b_clear_sibling_use'
      | 'ambiguous';
  } {
    const { stopLocationType, actualPieces, siblingUsageCount } = input;

    // Pattern A indicators (truck stop / rest area / fuel station)
    const isHandoffLocationType =
      stopLocationType === LocationType.TRUCK_STOP ||
      stopLocationType === LocationType.REST_AREA ||
      stopLocationType === LocationType.FUEL_STATION;

    // Pattern B indicator: customer-facing location type
    const isCustomerLocationType =
      stopLocationType === LocationType.WAREHOUSE ||
      stopLocationType === LocationType.DISTRIBUTION_CENTER ||
      stopLocationType === LocationType.PORT ||
      stopLocationType === LocationType.RAIL_YARD;

    // Pattern B indicator: freight moved through this row (actualPieces is the
    // most reliable signal — a non-zero count means the stop actually saw cargo).
    const hadFreight = (actualPieces ?? 0) > 0;

    // Pattern B indicator: the same Stop is used as pickup/delivery on other loads
    const usedElsewhere = siblingUsageCount > 0;

    // Clear-B has priority over Clear-A — if the location ever moved freight,
    // it must be a real customer stop regardless of locationType.
    if (hadFreight) {
      return { resolution: 'revert', reasonCode: 'pattern_b_clear_freight' };
    }
    if (isCustomerLocationType) {
      return { resolution: 'revert', reasonCode: 'pattern_b_clear_location_type' };
    }
    if (usedElsewhere) {
      return { resolution: 'revert', reasonCode: 'pattern_b_clear_sibling_use' };
    }
    if (isHandoffLocationType) {
      return { resolution: 'delete', reasonCode: 'pattern_a_clear' };
    }

    // Ambiguous: OTHER-typed stop with no freight, no sibling refs. Could go
    // either way — ask the user.
    return { resolution: null, reasonCode: 'ambiguous' };
  }

  /**
   * Read-only preview of what `removeExchangePoint` would do. Used by the UI
   * to render the right confirmation copy before the user confirms.
   *
   * `loadStopId` is the LoadStop.id (join row PK), matching the existing
   * `createLegsFromExchangePoints` convention.
   */
  async previewExchangeRemoval(loadId: number, loadStopId: number, tenantId: number) {
    const { loadStop, stop } = await this.loadStopForExchange(loadId, loadStopId, tenantId);

    // LoadStop has no own tenantId; scope through the parent Load.
    const siblingUsageCount = await this.prisma.loadStop.count({
      where: {
        load: { tenantId },
        stopId: stop.id,
        loadId: { not: loadId },
        actionType: { in: ['pickup', 'delivery', 'both'] },
      },
    });

    const { resolution, reasonCode } = LoadLegService.classifyExchangeRemoval({
      stopLocationType: stop.locationType,
      actualPieces: loadStop.actualPieces,
      siblingUsageCount,
    });

    return {
      resolution,
      ambiguous: resolution === null,
      stopId: loadStop.id,
      stopName: stop.name,
      reasonCode,
    };
  }

  /**
   * Remove an exchange point from a relay load. The endpoint's behavior is:
   *
   *   1. Validate the LoadStop is actually an exchange on this load and tenant.
   *   2. If `forcedResolution` is undefined, classify via the rule table.
   *      If ambiguous, throw 409 — the caller must retry with `?resolve=…`.
   *   3. Apply the resolution inside a transaction:
   *        - `delete` → drop the LoadStop row (and the Stop catalog row if it's
   *           tenant-owned and has no remaining references)
   *        - `revert` → set actionType back to 'delivery'
   *      Then recompute legs from the new exchange set. If zero exchanges
   *      remain, the load demotes off `isRelay`.
   *   4. Emit `LOAD_EXCHANGE_REMOVED`.
   */
  async removeExchangePoint(
    loadId: number,
    loadStopId: number,
    tenantId: number,
    forcedResolution?: ExchangeRemovalResolution,
  ) {
    const { loadStop, stop, load } = await this.loadStopForExchange(loadId, loadStopId, tenantId);

    if (load.status !== LoadStatus.DRAFT && load.status !== LoadStatus.PENDING) {
      throw new BadRequestException(
        `Cannot remove exchange points on a load in "${load.status}" status — only draft or pending loads can be reconfigured.`,
      );
    }

    // Guard: no leg may have an assigned driver — same guard the createLegs path uses.
    const legs = await this.prisma.loadLeg.findMany({ where: { loadId, tenantId } });
    const hasAssignedOrAdvanced = legs.some((l) => l.status !== LEG_STATUS.PENDING || l.driverId !== null);
    if (hasAssignedOrAdvanced) {
      throw new BadRequestException(
        'Cannot remove exchange points — legs already have drivers assigned or are no longer pending. Revert assignments first.',
      );
    }

    let resolution: ExchangeRemovalResolution;
    if (forcedResolution) {
      resolution = forcedResolution;
    } else {
      const preview = await this.previewExchangeRemoval(loadId, loadStopId, tenantId);
      if (preview.resolution === null) {
        throw new ConflictException({
          ambiguous: true,
          stopId: loadStop.id,
          message:
            'Cannot determine whether this exchange should be deleted or kept as a delivery. Retry with ?resolve=delete or ?resolve=revert.',
        });
      }
      resolution = preview.resolution;
    }

    // ── Apply the resolution + recompute legs in a single transaction ──
    const recomputed = await this.prisma.$transaction(async (tx) => {
      if (resolution === 'delete') {
        await tx.loadStop.delete({ where: { id: loadStop.id } });

        // Resequence remaining stops (sequenceOrder is 1-based, contiguous).
        // LoadStop has no own tenantId — scope through the parent Load.
        const remaining = await tx.loadStop.findMany({
          where: { loadId, load: { tenantId } },
          orderBy: { sequenceOrder: 'asc' },
          select: { id: true },
        });
        for (let i = 0; i < remaining.length; i++) {
          await tx.loadStop.update({ where: { id: remaining[i].id }, data: { sequenceOrder: i + 1 } });
        }

        // If the Stop is tenant-owned and has no remaining LoadStop refs anywhere,
        // hard-delete the Stop. Global stops (tenantId=null) are never deleted —
        // they're catalog rows shared across tenants.
        if (stop.tenantId !== null) {
          const remainingRefs = await tx.loadStop.count({ where: { stopId: stop.id } });
          if (remainingRefs === 0) {
            await tx.stop.delete({ where: { id: stop.id } });
          }
        }
      } else {
        // revert
        await tx.loadStop.update({ where: { id: loadStop.id }, data: { actionType: 'delivery' } });
      }

      // Recompute legs from the new exchange set. Take a fresh read since we
      // just mutated either the row's actionType or the row's existence.
      const stopsAfter = await tx.loadStop.findMany({
        where: { loadId, load: { tenantId } },
        orderBy: { sequenceOrder: 'asc' },
        select: { id: true, actionType: true, sequenceOrder: true },
      });
      const remainingExchangeIds = stopsAfter.filter((s) => s.actionType === 'exchange').map((s) => s.id);

      // Always tear down existing legs first — even if we're keeping the load
      // as a relay, the leg boundaries have changed.
      await tx.loadLeg.deleteMany({ where: { loadId, tenantId } });

      if (remainingExchangeIds.length === 0) {
        // No exchanges left — demote the load to non-relay.
        await tx.load.update({ where: { id: loadId }, data: { isRelay: false } });
        return { isRelay: false, legCount: 0 };
      }

      // Rebuild legs with the remaining exchange ids. We can't reuse
      // `createLegsFromExchangePoints` here (different transaction context),
      // so inline the leg-build the same way.
      const loadShort = load.loadNumber || String(loadId);
      const exchangeSet = new Set(remainingExchangeIds);
      const boundaries: number[] = [0];
      for (let i = 0; i < stopsAfter.length; i++) {
        if (exchangeSet.has(stopsAfter[i].id)) {
          boundaries.push(i);
        }
      }
      boundaries.push(stopsAfter.length - 1);

      const legsToCreate = [];
      for (let i = 0; i < boundaries.length - 1; i++) {
        legsToCreate.push({
          legId: `LEG-${loadShort}-${i + 1}`,
          sequence: i + 1,
          status: LEG_STATUS.PENDING,
          originStopId: stopsAfter[boundaries[i]].id,
          destStopId: stopsAfter[boundaries[i + 1]].id,
          loadId,
          tenantId,
        });
      }
      await tx.loadLeg.createMany({ data: legsToCreate });

      return { isRelay: true, legCount: legsToCreate.length };
    });

    // Invalidate detail cache before emitting (prevents stale reads on SSE consumers).
    await this.cache.del(buildKey('sally:loads', 'detail', String(tenantId), load.loadNumber));

    this.logger.log(
      `Removed exchange LoadStop #${loadStop.id} (Stop #${stop.id}) from load #${loadId} (tenant ${tenantId}, resolution=${resolution}, isRelay=${recomputed.isRelay}, legs=${recomputed.legCount})`,
    );

    await this.events.emit(SALLY_EVENTS.LOAD_EXCHANGE_REMOVED, tenantId, {
      entityId: String(loadId),
      entityType: 'load',
      loadId,
      loadStopId: loadStop.id,
      stopId: stop.id,
      resolution,
      isRelay: recomputed.isRelay,
      legCount: recomputed.legCount,
    });

    return {
      resolution,
      stopId: loadStop.id,
      loadId,
      isRelay: recomputed.isRelay,
      legCount: recomputed.legCount,
    };
  }

  /**
   * Shared loader for the remove + preview paths: validates the LoadStop
   * belongs to this load + tenant and is in fact an exchange. Returns the
   * three rows we need for downstream logic.
   *
   * The URL param is the LoadStop.id (the join row's PK), matching the
   * existing `createLegsFromExchangePoints` convention. The Stop catalog row
   * is loaded by following the LoadStop.stopId FK.
   */
  private async loadStopForExchange(loadId: number, loadStopId: number, tenantId: number) {
    // LoadStop has no own tenantId — scope through the parent Load relation.
    const loadStop = await this.prisma.loadStop.findFirst({
      where: { id: loadStopId, loadId, load: { tenantId } },
    });
    if (!loadStop) {
      throw new NotFoundException(`Stop #${loadStopId} is not on load #${loadId}`);
    }
    if (loadStop.actionType !== 'exchange') {
      throw new BadRequestException(
        `Stop #${loadStopId} is not configured as an exchange on this load (actionType=${loadStop.actionType}).`,
      );
    }

    const stop = await this.prisma.stop.findUnique({ where: { id: loadStop.stopId } });
    if (!stop) {
      throw new NotFoundException(`Stop catalog row for LoadStop #${loadStopId} not found`);
    }

    const load = await this.prisma.load.findFirst({
      where: { id: loadId, tenantId },
      select: { id: true, loadNumber: true, status: true, isRelay: true },
    });
    if (!load) {
      throw new NotFoundException(`Load #${loadId} not found`);
    }

    return { loadStop, stop, load };
  }

  // ─── Assign Leg ─────────────────────────────────────────────────────────────

  async assignLeg(
    legId: string,
    driverId: string,
    vehicleId: string | undefined,
    tenantId: number,
    trailerId?: string,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Validate leg exists and belongs to tenant
      const leg = await tx.loadLeg.findFirst({
        where: { legId, tenantId },
        include: {
          load: {
            select: { loadNumber: true, requiredEquipmentType: true },
          },
        },
      });

      if (!leg) {
        throw new NotFoundException(`Leg "${legId}" not found`);
      }

      // 2. Validate leg is pending or assigned
      const assignableStatuses: readonly LoadLegStatus[] = [LEG_STATUS.PENDING, LEG_STATUS.ASSIGNED];
      if (!assignableStatuses.includes(leg.status as LoadLegStatus)) {
        throw new BadRequestException(`Cannot assign leg in "${leg.status}" status. Must be pending or assigned.`);
      }

      // 3. Resolve driver by driverId string -> Driver record
      const driver = await tx.driver.findFirst({
        where: { driverId, tenantId },
      });
      if (!driver) {
        throw new NotFoundException(`Driver "${driverId}" not found in tenant ${tenantId}`);
      }

      // 3b. Check if driver already has an in-transit load or leg
      const inTransitLeg = await tx.loadLeg.findFirst({
        where: {
          driverId: driver.id,
          status: LEG_STATUS.IN_TRANSIT,
          load: { isActive: true },
        },
      });
      const inTransitLoad = await tx.load.findFirst({
        where: {
          driverId: driver.id,
          status: 'IN_TRANSIT',
          isActive: true,
          isRelay: false,
        },
      });
      if (inTransitLeg || inTransitLoad) {
        throw new BadRequestException(
          `Driver ${driverId} already has an in-transit load or relay leg. Complete or revert it first.`,
        );
      }

      // 4. Resolve vehicle
      let resolvedVehicleId: number | null = null;
      let resolvedVehicle: {
        id: number;
        currentTrailer?: {
          id: number;
          trailerId: string;
          unitNumber: string;
          equipmentType: any;
          status: any;
        } | null;
      } | null = null;
      if (vehicleId) {
        const vehicle = await tx.vehicle.findFirst({
          where: { vehicleId, tenantId },
          include: {
            currentTrailer: {
              select: {
                id: true,
                trailerId: true,
                unitNumber: true,
                equipmentType: true,
                status: true,
              },
            },
          },
        });
        if (!vehicle) {
          throw new NotFoundException(`Vehicle "${vehicleId}" not found in tenant ${tenantId}`);
        }
        resolvedVehicleId = vehicle.id;
        resolvedVehicle = vehicle;
      } else {
        // Default: use previous leg's vehicleId (same truck continues)
        if (leg.sequence > 1) {
          const prevLeg = await tx.loadLeg.findFirst({
            where: {
              loadId: leg.loadId,
              tenantId,
              sequence: leg.sequence - 1,
            },
          });
          if (prevLeg?.vehicleId) {
            resolvedVehicleId = prevLeg.vehicleId;
          }
        }
      }

      // 4b. Resolve trailer
      let resolvedTrailerDbId: number | null = null;
      const requiredEquipType = leg.load.requiredEquipmentType;

      if (requiredEquipType === 'POWER_ONLY') {
        // POWER_ONLY loads must have no trailer
        resolvedTrailerDbId = null;
      } else if (trailerId) {
        // Explicit trailer provided
        const trailer = await tx.trailer.findFirst({
          where: { trailerId, tenantId },
        });
        if (!trailer) {
          throw new NotFoundException(`Trailer "${trailerId}" not found in tenant ${tenantId}`);
        }
        if (requiredEquipType && trailer.equipmentType !== requiredEquipType) {
          this.logger.warn(
            `Trailer ${trailerId} equipment type ${trailer.equipmentType} does not match load required type ${requiredEquipType}`,
          );
        }
        resolvedTrailerDbId = trailer.id;

        // Auto-sync trailer status: AVAILABLE → ASSIGNED
        if (trailer.status === 'AVAILABLE') {
          await tx.trailer.update({
            where: { id: trailer.id },
            data: { status: 'ASSIGNED' },
          });
        }
      } else if (resolvedVehicle?.currentTrailer) {
        // Auto-fill from vehicle's current trailer
        const ct = resolvedVehicle.currentTrailer;
        if (requiredEquipType && ct.equipmentType !== requiredEquipType) {
          this.logger.warn(
            `Vehicle current trailer ${ct.trailerId} equipment type ${ct.equipmentType} does not match load required type ${requiredEquipType}`,
          );
        }
        resolvedTrailerDbId = ct.id;

        if (ct.status === 'AVAILABLE') {
          await tx.trailer.update({
            where: { id: ct.id },
            data: { status: 'ASSIGNED' },
          });
        }
      }

      // 5. Business rule: same driver can't be on consecutive legs
      const adjacentLegs = await tx.loadLeg.findMany({
        where: {
          loadId: leg.loadId,
          tenantId,
          sequence: { in: [leg.sequence - 1, leg.sequence + 1] },
        },
      });

      for (const adjLeg of adjacentLegs) {
        if (adjLeg.driverId === driver.id) {
          throw new ConflictException(
            `Driver "${driverId}" is already assigned to adjacent leg ${adjLeg.legId}. ` +
              `Relay loads require different drivers on consecutive legs.`,
          );
        }
      }

      // 6. Update leg
      const result = await tx.loadLeg.update({
        where: { id: leg.id },
        data: {
          driverId: driver.id,
          vehicleId: resolvedVehicleId,
          trailerId: resolvedTrailerDbId,
          status: LEG_STATUS.ASSIGNED,
          assignedAt: new Date(),
        },
        include: {
          driver: true,
          vehicle: true,
          originStop: { include: { stop: true } },
          destStop: { include: { stop: true } },
        },
      });

      // 7. Sync load from legs
      await this.syncLoadFromLegs(leg.loadId, tx);

      return { legResult: result, loadStringId: leg.load.loadNumber };
    });

    this.logger.log(`Leg "${legId}" assigned to driver "${driverId}"`);

    // Eagerly invalidate load detail cache before async event (prevents stale reads)
    await this.cache.del(buildKey('sally:loads', 'detail', String(tenantId), updated.loadStringId));

    await this.events.emit(SALLY_EVENTS.LOAD_LEG_ASSIGNED, tenantId, {
      entityId: legId,
      entityType: 'load',
      legId,
      loadId: updated.legResult.loadId,
      driverId,
      vehicleId,
      driverDbId: updated.legResult.driverId,
      vehicleDbId: updated.legResult.vehicleId,
    });

    return updated.legResult;
  }

  // ─── Advance Leg Status ─────────────────────────────────────────────────────

  async advanceLegStatus(legId: string, targetStatus: LoadLegStatus, tenantId: number) {
    const updated = await this.prisma.$transaction(async (tx) => {
      // 1. Validate leg exists
      const leg = await tx.loadLeg.findFirst({
        where: { legId, tenantId },
        include: { load: true },
      });

      if (!leg) {
        throw new NotFoundException(`Leg "${legId}" not found`);
      }

      // 2. Validate transition is legal
      if (!LoadLegService.validateLegTransition(leg.status, targetStatus)) {
        const allowed = LEG_STATUS_TRANSITIONS[leg.status as LoadLegStatus] ?? [];
        throw new BadRequestException(
          `Invalid leg transition: ${leg.status} → ${targetStatus}. ` +
            `Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
        );
      }

      // 3. Build timestamp updates
      const timestampUpdate: Record<string, Date> = {};
      if (targetStatus === LEG_STATUS.IN_TRANSIT) {
        timestampUpdate.pickedUpAt = new Date();
      } else if (targetStatus === LEG_STATUS.DELIVERED) {
        timestampUpdate.deliveredAt = new Date();
      }

      // 4. Update leg status
      const result = await tx.loadLeg.update({
        where: { id: leg.id },
        data: {
          status: targetStatus,
          ...timestampUpdate,
        },
        include: {
          driver: true,
          vehicle: true,
          originStop: { include: { stop: true } },
          destStop: { include: { stop: true } },
        },
      });

      // 5. Get all legs to determine load-level side effects
      const allLegs = await tx.loadLeg.findMany({
        where: { loadId: leg.loadId, tenantId },
        orderBy: { sequence: 'asc' },
      });

      const isFinalLeg = leg.sequence === Math.max(...allLegs.map((l) => l.sequence));

      if (targetStatus === LEG_STATUS.DELIVERED && !isFinalLeg) {
        this.logger.log(`Intermediate leg "${legId}" delivered. Next leg ready for pickup.`);

        // Auto-activate next leg's route plan
        const nextLeg = await tx.loadLeg.findFirst({
          where: { loadId: leg.loadId, sequence: leg.sequence + 1 },
        });
        if (nextLeg?.routePlanId) {
          const plan = await tx.routePlan.findUnique({
            where: { id: nextLeg.routePlanId },
          });
          if (plan && plan.status === 'DRAFT') {
            await tx.routePlan.update({
              where: { id: plan.id },
              data: {
                isActive: true,
                status: 'ACTIVE',
                activatedAt: new Date(),
              },
            });
            this.logger.log(`Auto-activated plan ${plan.planId} for next leg ${nextLeg.legId}`);
          }
        }
      }

      // 6. Sync load from legs (derives status/driver/timestamps — must run first
      //    so the load row reflects DELIVERED before we apply billing side-effects)
      await this.syncLoadFromLegs(leg.loadId, tx);

      // 7. When the whole load is now delivered, apply the same delivery side-effects
      //    a single-driver load gets (billingStatus, stop completion, linehaul charge).
      //    Gate on the derived load status — not just isFinalLeg — so a stray
      //    non-delivered earlier leg can never trip billing early. (SQ-114)
      if (targetStatus === LEG_STATUS.DELIVERED && LoadLegService.deriveLoadStatus(allLegs) === LoadStatus.DELIVERED) {
        this.logger.log(
          `Final leg "${legId}" delivered. Load #${leg.loadId} fully delivered → applying billing side-effects.`,
        );
        await LoadLegService.applyDeliverySideEffects(tx, {
          id: leg.load.id,
          loadNumber: leg.load.loadNumber,
          billingStatus: leg.load.billingStatus,
          rateCents: leg.load.rateCents,
        });
      }

      return { legResult: result, loadStringId: leg.load.loadNumber };
    });

    this.logger.log(`Leg "${legId}" status changed to "${targetStatus}" (load #${updated.legResult.loadId})`);

    // Eagerly invalidate load detail cache before async event (prevents stale reads)
    await this.cache.del(buildKey('sally:loads', 'detail', String(tenantId), updated.loadStringId));

    await this.events.emit(SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED, tenantId, {
      entityId: legId,
      entityType: 'load',
      legId,
      loadId: updated.legResult.loadId,
      newStatus: targetStatus,
    });

    return updated.legResult;
  }

  // ─── Delivery Side-Effects (SHARED) ─────────────────────────────────────────

  /**
   * Single source of truth for the billing side-effects a load must receive when
   * it reaches DELIVERED. Shared by the single-driver path (LoadStatusService) and
   * the relay path (advanceLegStatus final-leg branch) so the two never diverge again
   * (SQ-114: relay delivery previously skipped all of this, leaving loads invisible
   * in Close-Out with nothing to bill).
   *
   * tx-agnostic: pass a Prisma transaction client to run inside an existing
   * transaction (relay path), or the base PrismaService for sequential use
   * (non-relay path). Writes the linehaul charge via `client.loadCharge.create`
   * directly — NOT LoadChargesService.addCharge — so the write stays on the caller's
   * connection/transaction (addCharge uses its own this.prisma and would escape a tx).
   *
   * Idempotent: only sets billingStatus when currently null (never downgrades an
   * advanced status), and only creates the linehaul charge when none exists.
   */
  static async applyDeliverySideEffects(
    client: PrismaTransactionClient,
    load: { id: number; loadNumber: string; billingStatus: LoadBillingStatus | null; rateCents: number | null },
  ): Promise<void> {
    // 1. Mark all stops completed (they must be, if the load is delivered)
    await client.loadStop.updateMany({
      where: { loadId: load.id, status: { not: STOP_STATUS.COMPLETED } },
      data: { status: STOP_STATUS.COMPLETED, completedAt: new Date() },
    });

    // 2. Auto-create the linehaul charge (only if missing and a rate exists)
    if (load.rateCents) {
      const existingLinehaul = await client.loadCharge.findFirst({
        where: { loadId: load.id, chargeType: 'linehaul' },
      });
      if (!existingLinehaul) {
        await client.loadCharge.create({
          data: {
            loadId: load.id,
            chargeType: 'linehaul',
            description: `Linehaul - Load #${load.loadNumber}`,
            quantity: 1,
            unitPriceCents: load.rateCents,
            totalCents: load.rateCents,
            isBillable: true,
            isPayable: false,
          },
        });
      }
    }

    // 3. Open the billing workflow — only if not already set (don't clobber
    //    READY_FOR_REVIEW / APPROVED / INVOICED / CLOSED on a re-entry).
    if (load.billingStatus == null) {
      await client.load.update({
        where: { id: load.id },
        data: { billingStatus: LoadBillingStatus.PENDING_DOCUMENTS },
      });
    }
  }

  // ─── Derive Load Status (PURE FUNCTION) ─────────────────────────────────────

  static deriveLoadStatus(legs: Array<{ status: string }>): string {
    if (legs.length === 0) return 'PENDING';

    // Filter out cancelled legs for primary derivation
    const nonCancelled = legs.filter((l) => l.status !== LEG_STATUS.CANCELLED);

    // 1. All cancelled -> cancelled
    if (nonCancelled.length === 0) return 'CANCELLED';

    // 2. All delivered -> delivered
    if (nonCancelled.every((l) => l.status === LEG_STATUS.DELIVERED)) return 'DELIVERED';

    // 3. Any on_hold -> on_hold
    if (nonCancelled.some((l) => l.status === LEG_STATUS.ON_HOLD)) return 'ON_HOLD';

    // 4. Any in_transit -> in_transit
    if (nonCancelled.some((l) => l.status === LEG_STATUS.IN_TRANSIT)) return 'IN_TRANSIT';

    // 5. Any assigned -> assigned
    if (nonCancelled.some((l) => l.status === LEG_STATUS.ASSIGNED)) return 'ASSIGNED';

    // 6. All pending -> pending
    if (nonCancelled.every((l) => l.status === LEG_STATUS.PENDING)) return 'PENDING';

    // 7. Fallback
    return 'PENDING';
  }

  // ─── Sync Load from Legs ────────────────────────────────────────────────────

  async syncLoadFromLegs(loadId: number, tx: PrismaTransactionClient) {
    // Get all legs for load ordered by sequence
    const legs = await tx.loadLeg.findMany({
      where: { loadId },
      orderBy: { sequence: 'asc' },
    });

    if (legs.length === 0) return;

    // Derive load status
    const derivedStatus = LoadLegService.deriveLoadStatus(legs);
    this.logger.log(
      `syncLoadFromLegs(${loadId}): legs=[${legs.map((l) => `${l.sequence}:${l.status}`).join(',')}] → derived=${derivedStatus}`,
    );

    // Get active leg
    const activeLeg = LoadLegService.getActiveLeg(legs);

    // Build load update data
    const loadUpdate: Record<string, unknown> = {
      status: derivedStatus,
      driverId: activeLeg?.driverId ?? null,
      vehicleId: activeLeg?.vehicleId ?? null,
    };

    // Set lifecycle timestamps based on derived status
    if (derivedStatus === 'ASSIGNED' && !legs.some((l) => l.status === LEG_STATUS.IN_TRANSIT)) {
      const firstAssigned = legs.find((l) => l.assignedAt);
      if (firstAssigned?.assignedAt) {
        loadUpdate.assignedAt = firstAssigned.assignedAt;
      }
    }

    if (derivedStatus === 'IN_TRANSIT') {
      const firstInTransit = legs.find((l) => l.pickedUpAt);
      if (firstInTransit?.pickedUpAt) {
        loadUpdate.inTransitAt = firstInTransit.pickedUpAt;
      }
    }

    if (derivedStatus === 'DELIVERED') {
      const lastDelivered = legs
        .filter((l) => l.deliveredAt)
        .sort((a, b) => new Date(b.deliveredAt).getTime() - new Date(a.deliveredAt).getTime())[0];
      if (lastDelivered?.deliveredAt) {
        loadUpdate.deliveredAt = lastDelivered.deliveredAt;
      }
    }

    await tx.load.update({
      where: { id: loadId },
      data: loadUpdate,
    });
  }

  // ─── Get Active Leg (PURE FUNCTION) ─────────────────────────────────────────

  static getActiveLeg<T extends { status: string; sequence: number }>(legs: T[]): T | null {
    const sorted = [...legs].sort((a, b) => a.sequence - b.sequence);
    return sorted.find((l) => l.status !== LEG_STATUS.DELIVERED && l.status !== LEG_STATUS.CANCELLED) ?? null;
  }

  // ─── Validate Leg Transition (PURE FUNCTION) ───────────────────────────────

  static validateLegTransition(currentStatus: string, targetStatus: string): boolean {
    // SQ-103 tripwire: coerce both sides through the enum schema before lookup.
    // develop is canonically uppercase end-to-end (PR #687), but a stale frontend
    // build or a legacy row that escaped migration 20260428192707 can send mixed
    // case. Defending here is cheaper than another staging incident.
    const from = LoadLegStatusSchema.safeParse(currentStatus.toUpperCase());
    const to = LoadLegStatusSchema.safeParse(targetStatus.toUpperCase());
    if (!from.success || !to.success) return false;
    const allowed = LEG_STATUS_TRANSITIONS[from.data];
    if (!allowed) return false;
    return (allowed as readonly string[]).includes(to.data);
  }

  // ─── Get Dispatch Sheet ─────────────────────────────────────────────────────

  async getDispatchSheet(legId: string, tenantId: number) {
    const leg = await this.prisma.loadLeg.findFirst({
      where: { legId, tenantId },
      include: {
        load: {
          select: {
            loadNumber: true,
            referenceNumber: true,
            commodityType: true,
            weightLbs: true,
            requiredEquipmentType: true,
            specialRequirements: true,
            customerName: true,
            pieces: true,
            hazmatClass: true,
            minTempF: true,
            maxTempF: true,
          },
        },
        driver: { select: { driverId: true, name: true, phone: true } },
        vehicle: {
          select: {
            vehicleId: true,
            unitNumber: true,
            make: true,
            model: true,
          },
        },
        originStop: {
          include: {
            stop: {
              select: {
                name: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                lat: true,
                lon: true,
              },
            },
          },
        },
        destStop: {
          include: {
            stop: {
              select: {
                name: true,
                address: true,
                city: true,
                state: true,
                zipCode: true,
                lat: true,
                lon: true,
              },
            },
          },
        },
        routePlan: {
          select: {
            planId: true,
            totalDistanceMiles: true,
            totalDriveTimeHours: true,
            departureTime: true,
            estimatedArrival: true,
          },
        },
      },
    });

    if (!leg) throw new NotFoundException(`Leg not found: ${legId}`);

    // Get total legs for context
    const totalLegs = await this.prisma.loadLeg.count({
      where: { loadId: leg.loadId, tenantId },
    });

    // Get all stops in this leg's range
    const legStops = await this.prisma.loadStop.findMany({
      where: {
        loadId: leg.loadId,
        sequenceOrder: {
          gte: leg.originStop.sequenceOrder,
          lte: leg.destStop.sequenceOrder,
        },
      },
      include: { stop: true },
      orderBy: { sequenceOrder: 'asc' },
    });

    return {
      // Leg context
      legId: leg.legId,
      legSequence: leg.sequence,
      totalLegs,
      isFinalLeg: leg.sequence === totalLegs,
      status: leg.status,

      // Load info (no rate — drivers don't see revenue)
      loadNumber: leg.load.loadNumber,
      referenceNumber: leg.load.referenceNumber,
      customerName: leg.load.customerName,
      commodityType: leg.load.commodityType,
      weightLbs: leg.load.weightLbs,
      requiredEquipmentType: leg.load.requiredEquipmentType ?? null,
      specialRequirements: leg.load.specialRequirements,
      pieces: leg.load.pieces,
      hazmatClass: leg.load.hazmatClass,
      tempRange: leg.load.minTempF || leg.load.maxTempF ? { minF: leg.load.minTempF, maxF: leg.load.maxTempF } : null,

      // Driver & vehicle
      driver: leg.driver,
      vehicle: leg.vehicle,

      // Stops for this leg
      stops: legStops.map((ls) => ({
        sequence: ls.sequenceOrder,
        actionType: ls.actionType,
        facility: ls.stop.name,
        address: ls.stop.address,
        city: ls.stop.city,
        state: ls.stop.state,
        zipCode: ls.stop.zipCode,
        appointmentDate: ls.appointmentDate,
        earliestArrival: ls.earliestArrival,
        latestArrival: ls.latestArrival,
        dockHours: ls.estimatedDockHours,
        notes: ls.dispatcherNotes,
        contactName: ls.facilityContactName,
        contactPhone: ls.facilityContactPhone,
        bolNumber: ls.bolNumber,
      })),

      // Route plan summary (if generated)
      route: leg.routePlan
        ? {
            planId: leg.routePlan.planId,
            miles: leg.routePlan.totalDistanceMiles,
            driveTimeHours: leg.routePlan.totalDriveTimeHours,
            departure: leg.routePlan.departureTime,
            eta: leg.routePlan.estimatedArrival,
          }
        : null,
    };
  }

  // ─── Get Dispatch Sheet for Load (non-relay) ───────────────────────────────

  async getDispatchSheetForLoad(loadNumber: string, tenantId: number) {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      select: {
        id: true,
        loadNumber: true,
        referenceNumber: true,
        customerName: true,
        commodityType: true,
        weightLbs: true,
        requiredEquipmentType: true,
        specialRequirements: true,
        pieces: true,
        hazmatClass: true,
        minTempF: true,
        maxTempF: true,
        status: true,
        driverId: true,
        vehicleId: true,
        driver: { select: { driverId: true, name: true, phone: true } },
        vehicle: {
          select: {
            vehicleId: true,
            unitNumber: true,
            make: true,
            model: true,
          },
        },
        estimatedMiles: true,
        actualMiles: true,
      },
    });

    if (!load) throw new NotFoundException(`Load not found: ${loadNumber}`);

    const stops = await this.prisma.loadStop.findMany({
      where: { loadId: load.id },
      include: { stop: true },
      orderBy: { sequenceOrder: 'asc' },
    });

    // Find the most recent active route plan linked to this load via RoutePlanLoad
    const routePlanLink = await this.prisma.routePlanLoad.findFirst({
      where: { loadId: load.id },
      include: {
        plan: {
          select: {
            planId: true,
            totalDistanceMiles: true,
            totalDriveTimeHours: true,
            departureTime: true,
            estimatedArrival: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    const routePlan = routePlanLink?.plan ?? null;

    return {
      legId: `load-${load.loadNumber}`,
      legSequence: 1,
      totalLegs: 1,
      isFinalLeg: true,
      status: load.status,

      loadNumber: load.loadNumber,
      referenceNumber: load.referenceNumber,
      customerName: load.customerName,
      commodityType: load.commodityType,
      weightLbs: load.weightLbs,
      requiredEquipmentType: load.requiredEquipmentType ?? null,
      specialRequirements: load.specialRequirements,
      pieces: load.pieces,
      hazmatClass: load.hazmatClass,
      tempRange: load.minTempF || load.maxTempF ? { minF: load.minTempF, maxF: load.maxTempF } : null,

      driver: load.driver,
      vehicle: load.vehicle,

      stops: stops.map((ls) => ({
        sequence: ls.sequenceOrder,
        actionType: ls.actionType,
        facility: ls.stop.name,
        address: ls.stop.address,
        city: ls.stop.city,
        state: ls.stop.state,
        zipCode: ls.stop.zipCode,
        appointmentDate: ls.appointmentDate,
        earliestArrival: ls.earliestArrival,
        latestArrival: ls.latestArrival,
        dockHours: ls.estimatedDockHours,
        notes: ls.dispatcherNotes,
        contactName: ls.facilityContactName,
        contactPhone: ls.facilityContactPhone,
        bolNumber: ls.bolNumber,
      })),

      route: routePlan
        ? {
            planId: routePlan.planId,
            miles: routePlan.totalDistanceMiles,
            driveTimeHours: routePlan.totalDriveTimeHours,
            departure: routePlan.departureTime,
            eta: routePlan.estimatedArrival,
          }
        : null,
    };
  }

  // ─── Get Legs for Load ──────────────────────────────────────────────────────

  async getLegsForLoad(loadId: number, tenantId: number) {
    const legs = await this.prisma.loadLeg.findMany({
      where: { loadId, tenantId },
      orderBy: { sequence: 'asc' },
      include: {
        driver: true,
        vehicle: true,
        originStop: { include: { stop: true } },
        destStop: { include: { stop: true } },
      },
    });

    return legs;
  }
}
