import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LoadUpdateErrorCode } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { StopsService } from '../../stops/stops.service';
import { CustomFieldValidatorService } from '../../custom-fields/custom-field-validator.service';
import { LoadMileageService } from '../../../routing/load-mileage/load-mileage.service';
import { LoadEventsService } from './load-events.service';
import { LoadQueryService } from './load-query.service';
import { StopGeocodingService } from './stop-geocoding.service';
import { formatLoadResponse } from '../utils/format-load-response';
import { parseEquipmentType } from '../utils/parse-equipment-type';

/** Throw a 400 carrying a domain error code in the response body. */
function domainError(code: (typeof LoadUpdateErrorCode)[keyof typeof LoadUpdateErrorCode], detail: string) {
  return new BadRequestException({ detail, code });
}

type IncomingStop = {
  stopId: string;
  sequenceOrder: number;
  actionType: string;
  appointmentDate?: string;
  earliestArrival?: string;
  latestArrival?: string;
  estimatedDockHours: number;
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
};

type CurrentLoadStop = {
  id: number;
  sequenceOrder: number;
  actionType: string;
  estimatedDockHours: number;
  earliestArrival: string | null;
  latestArrival: string | null;
  appointmentDate: Date | null;
  stop: { stopId: string };
};

type StopsDiff =
  | { kind: 'identical' }
  | { kind: 'field-only'; updates: Array<{ id: number; data: Record<string, unknown> }> }
  | { kind: 'structural' };

@Injectable()
export class LoadDraftService {
  private readonly logger = new Logger(LoadDraftService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
    private readonly stopsService: StopsService,
    private readonly loadQueryService: LoadQueryService,
    private readonly stopGeocodingService: StopGeocodingService,
    private readonly customFieldValidator: CustomFieldValidatorService,
    private readonly loadMileage: LoadMileageService,
  ) {}

  /**
   * Update a draft load (scalar fields and/or stops)
   */
  async updateDraft(
    loadNumber: string,
    data: {
      customerName?: string;
      customerId?: number;
      referenceNumber?: string;
      rateCents?: number;
      weightLbs?: number;
      equipmentType?: string;
      commodityType?: string;
      pieces?: number;
      specialRequirements?: string;
      isRelay?: boolean;
      customFieldValues?: Record<string, unknown>;
      stops?: Array<{
        stopId: string;
        sequenceOrder: number;
        actionType: string;
        appointmentDate?: string;
        earliestArrival?: string;
        latestArrival?: string;
        estimatedDockHours: number;
        name?: string;
        address?: string;
        city?: string;
        state?: string;
        zipCode?: string;
      }>;
    },
  ) {
    const load = await this.prisma.load.findFirst({ where: { loadNumber } });
    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    // Reject empty payloads up front — saves a round trip and gives the UI
    // a clear domain code to surface ("No changes to save.").
    if (Object.keys(data).length === 0) {
      throw domainError(LoadUpdateErrorCode.NO_CHANGES, 'No changes to save.');
    }

    const editableStatuses = ['DRAFT', 'PENDING', 'ASSIGNED'];
    if (!editableStatuses.includes(load.status)) {
      throw new BadRequestException('Only draft, pending, or assigned loads can be updated');
    }

    // For assigned loads: restrict which fields can change
    if (load.status === 'ASSIGNED') {
      if (
        data.equipmentType !== undefined &&
        parseEquipmentType(data.equipmentType) !== (load as any).requiredEquipmentType
      ) {
        throw new BadRequestException('Cannot change equipmentType on an assigned load');
      }
      if (data.commodityType !== undefined && data.commodityType !== load.commodityType) {
        throw new BadRequestException('Cannot change commodityType on an assigned load');
      }
      if (data.stops) {
        throw new BadRequestException('Cannot replace stops on an assigned load. Move to draft first.');
      }
    }

    // Build update payload from provided fields only
    const updateData: any = { updatedAt: new Date() };
    if (data.customerName !== undefined) updateData.customerName = data.customerName;
    if (data.customerId !== undefined) updateData.customerId = data.customerId;
    if (data.referenceNumber !== undefined) updateData.referenceNumber = data.referenceNumber;
    if (data.rateCents !== undefined) updateData.rateCents = data.rateCents;
    if (data.weightLbs !== undefined) updateData.weightLbs = data.weightLbs;
    if (data.equipmentType !== undefined) {
      updateData.requiredEquipmentType = parseEquipmentType(data.equipmentType);
    }
    if (data.commodityType !== undefined) updateData.commodityType = data.commodityType;
    if (data.pieces !== undefined) updateData.pieces = data.pieces;
    if (data.specialRequirements !== undefined) updateData.specialRequirements = data.specialRequirements;
    if (data.isRelay !== undefined) updateData.isRelay = data.isRelay;

    if (data.customFieldValues !== undefined) {
      const existing = await this.prisma.load.findUnique({
        where: { id: load.id },
        select: { customFieldValues: true },
      });
      const result = await this.customFieldValidator.validate(load.tenantId, 'LOAD', data.customFieldValues, {
        existingValues: existing?.customFieldValues as any,
      });
      updateData.customFieldValues = result.values;
    }

    const updated = await this.prisma.load.update({
      where: { id: load.id },
      data: updateData,
    });

    // Write-through: keep linehaul LoadCharge in sync with rateCents
    if (data.rateCents !== undefined) {
      const existingLinehaul = await this.prisma.loadCharge.findFirst({
        where: { loadId: updated.id, chargeType: 'linehaul' },
      });
      if (existingLinehaul) {
        await this.prisma.loadCharge.update({
          where: { id: existingLinehaul.id },
          data: {
            unitPriceCents: data.rateCents,
            totalCents: data.rateCents,
          },
        });
      }
    }

    // Reconcile stops if provided.
    //
    // The PATCH payload is the desired final state. We compare it to current and:
    //   - identical structure + identical fields → no-op
    //   - identical structure + field edits only → in-place patch
    //   - structural change + legs exist → 422 LEGS_BLOCK_ROUTE_CHANGE
    //   - structural change + no legs → legacy delete+recreate
    let stopsChanged = false;
    if (data.stops) {
      const currentStops = (await this.prisma.loadStop.findMany({
        where: { loadId: load.id },
        select: {
          id: true,
          sequenceOrder: true,
          actionType: true,
          estimatedDockHours: true,
          earliestArrival: true,
          latestArrival: true,
          appointmentDate: true,
          stop: { select: { stopId: true } },
        },
        orderBy: { sequenceOrder: 'asc' },
      })) as unknown as CurrentLoadStop[];

      const diff = this.diffStops(currentStops, data.stops);

      if (diff.kind === 'identical') {
        // Defense in depth — frontend shouldn't have sent stops, but if it did,
        // we drop the work silently. No deleteMany, no recreate, no patches.
        this.logger.log(`updateDraft: stops payload identical to current state — skipping reconciliation`);
      } else if (diff.kind === 'field-only') {
        for (const upd of diff.updates) {
          await this.prisma.loadStop.update({ where: { id: upd.id }, data: upd.data });
        }
        stopsChanged = true;
      } else {
        // Structural change. Block if any leg references this load.
        const existingLegs = await this.prisma.loadLeg.findMany({
          where: { loadId: load.id },
          select: { legId: true },
        });
        if (existingLegs.length > 0) {
          throw domainError(
            LoadUpdateErrorCode.LEGS_BLOCK_ROUTE_CHANGE,
            'Reconfigure relay legs first to change the route.',
          );
        }

        // Legacy delete+recreate — safe when no legs reference these stops.
        await this.prisma.loadStop.deleteMany({ where: { loadId: load.id } });
        await this.recreateStops(load.id, load.tenantId, data.stops);
        stopsChanged = true;
      }
    }

    // Recompute denormalized fields only if stops actually changed.
    if (stopsChanged) {
      await this.loadQueryService.computeDenormalizedFields(load.id);

      // Stops changed — route mileage is stale. Fire-and-forget recompute.
      void this.loadMileage
        .enqueueRecalc(load.id)
        .catch((e) => this.logger.warn(`Failed to enqueue mileage for load ${load.id}: ${(e as Error).message}`));
    }

    // Return updated load with stops
    const result = await this.prisma.load.findUnique({
      where: { id: load.id },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        trip: { select: { tripId: true, loadCount: true } },
      },
    });

    this.logger.log(`Load updated (${load.status}): ${loadNumber}`);

    // Emit domain event for draft update
    await this.events.emit(SALLY_EVENTS.LOAD_UPDATED, updated.tenantId, {
      entityId: updated.loadNumber,
      entityType: 'load',
      loadNumber: updated.loadNumber,
    });

    // Log update event (fire-and-forget)
    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'updated',
        description: `Load updated (status: ${load.status})`,
      })
      .catch((err) => this.logger.error(`Failed to log draft update event: ${err.message}`));

    return formatLoadResponse(result);
  }

  /**
   * Recreate every LoadStop row for a load from the incoming payload.
   * Used only when stops genuinely changed structurally and no LoadLeg
   * references would be broken (caller has already verified both).
   *
   * Preserves the original behavior: dedup-aware find-or-create against
   * the tenant's Stop catalog, in-load duplicate Stop cloning, and
   * best-effort geocoding for any stop missing coordinates.
   */
  private async recreateStops(loadDbId: number, tenantId: number, stops: IncomingStop[]): Promise<void> {
    for (const stopData of stops) {
      let stop = await this.prisma.stop.findFirst({
        where: { stopId: stopData.stopId },
      });

      if (!stop && stopData.name) {
        const result = await this.stopsService.findOrCreate(tenantId, {
          name: stopData.name,
          address: stopData.address,
          city: stopData.city,
          state: stopData.state,
          zipCode: stopData.zipCode,
        });
        stop = result.stop;
        this.logger.log(
          `updateDraft stop "${stopData.name}": ${result.isNew ? 'created new' : 'matched existing'} (id=${stop.id})`,
        );
      }

      if (!stop) {
        throw new NotFoundException(`Stop not found: ${stopData.stopId}`);
      }

      // A single Stop record may back multiple LoadStops in one load (e.g. yard
      // pickup + yard drop). LoadStop is the join — sharing the Stop is correct.

      if (!stop.lat && !stop.lon) {
        this.logger.log(`Geocoding stop "${stop.name}" (id=${stop.id}) — missing coordinates`);
        await this.stopGeocodingService.geocodeAndUpdateStop(stop.id, {
          address: stopData.address || stop.address,
          city: stopData.city || stop.city,
          state: stopData.state || stop.state,
          zipCode: stopData.zipCode || stop.zipCode,
          name: stopData.name || stop.name,
        });
      }

      await this.prisma.loadStop.create({
        data: {
          loadId: loadDbId,
          stopId: stop.id,
          sequenceOrder: stopData.sequenceOrder,
          actionType: stopData.actionType,
          earliestArrival: stopData.earliestArrival || null,
          latestArrival: stopData.latestArrival || null,
          estimatedDockHours: stopData.estimatedDockHours,
          appointmentDate: stopData.appointmentDate ? new Date(stopData.appointmentDate) : null,
        },
      });
    }
  }

  /**
   * Compare incoming stops payload to current load stops.
   *
   * - `identical` — same length, same Stop refs in same positions, same actionType,
   *   AND every field-level value matches. Caller may skip stop work entirely.
   * - `field-only` — same structure (Stop refs, positions, actionType), but at least
   *   one row's mutable fields (dock hours, arrival windows, appointment) differ.
   *   Returns the in-place patches to apply.
   * - `structural` — length, position, Stop ref, or actionType differs at any index.
   *   Caller must either delete+recreate (if no legs) or reject (if legs exist).
   */
  private diffStops(current: CurrentLoadStop[], incoming: IncomingStop[]): StopsDiff {
    if (current.length !== incoming.length) return { kind: 'structural' };

    const sortedCurrent = [...current].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
    const sortedIncoming = [...incoming].sort((a, b) => a.sequenceOrder - b.sequenceOrder);

    const updates: Array<{ id: number; data: Record<string, unknown> }> = [];

    for (let i = 0; i < sortedCurrent.length; i++) {
      const cur = sortedCurrent[i];
      const inc = sortedIncoming[i];

      if (
        cur.sequenceOrder !== inc.sequenceOrder ||
        cur.actionType !== inc.actionType ||
        cur.stop.stopId !== inc.stopId
      ) {
        return { kind: 'structural' };
      }

      const fieldDiff: Record<string, unknown> = {};
      if ((cur.estimatedDockHours ?? null) !== (inc.estimatedDockHours ?? null)) {
        fieldDiff.estimatedDockHours = inc.estimatedDockHours;
      }
      if ((cur.earliestArrival ?? null) !== (inc.earliestArrival || null)) {
        fieldDiff.earliestArrival = inc.earliestArrival || null;
      }
      if ((cur.latestArrival ?? null) !== (inc.latestArrival || null)) {
        fieldDiff.latestArrival = inc.latestArrival || null;
      }
      const incApt = inc.appointmentDate ? new Date(inc.appointmentDate).toISOString() : null;
      const curApt = cur.appointmentDate ? cur.appointmentDate.toISOString() : null;
      if (incApt !== curApt) {
        fieldDiff.appointmentDate = inc.appointmentDate ? new Date(inc.appointmentDate) : null;
      }

      if (Object.keys(fieldDiff).length > 0) {
        updates.push({ id: cur.id, data: fieldDiff });
      }
    }

    return updates.length === 0 ? { kind: 'identical' } : { kind: 'field-only', updates };
  }
}
