import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { LoadStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { StopsService } from '../../stops/stops.service';
import { StopMatchService } from '../../stops/stop-match.service';
import { derivePrecision } from '../../stops/stop-precision';
import { CustomFieldValidatorService } from '../../custom-fields/custom-field-validator.service';
import { LoadMileageService } from '../../../routing/load-mileage/load-mileage.service';
import { LoadEventsService } from './load-events.service';
import { LoadQueryService } from './load-query.service';
import { StopGeocodingService } from './stop-geocoding.service';
import { formatLoadResponse } from '../utils/format-load-response';
import { parseEquipmentType } from '../utils/parse-equipment-type';

@Injectable()
export class LoadCreationService {
  private readonly logger = new Logger(LoadCreationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
    private readonly stopsService: StopsService,
    private readonly stopMatchService: StopMatchService,
    private readonly loadQueryService: LoadQueryService,
    private readonly stopGeocodingService: StopGeocodingService,
    private readonly customFieldValidator: CustomFieldValidatorService,
    private readonly loadMileage: LoadMileageService,
  ) {}

  /**
   * Create a new load with stops
   * Supports inline stop creation for manual entry (when stop doesn't exist yet)
   */
  async create(data: {
    tenantId: number;
    loadNumber?: string;
    weightLbs: number;
    commodityType: string;
    specialRequirements?: string;
    customerName: string;
    equipmentType?: string;
    referenceNumber?: string;
    rateCents?: number;
    pieces?: number;
    intakeSource?: string;
    intakeMetadata?: any;
    customerId?: number;
    status?: string;
    minTempF?: number;
    maxTempF?: number;
    hazmatClass?: string;
    unNumber?: string;
    placardRequired?: boolean;
    customFieldValues?: Record<string, unknown>;
    stops: Array<{
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
  }) {
    // Generate load number using atomic counter — race-free even with
    // concurrent BullMQ workers. Counter key includes date for daily reset.
    let loadNumber = data.loadNumber;
    if (!loadNumber) {
      const dateStr = new Date().toISOString().slice(0, 10);
      const seq = await this.counterService.nextValue(data.tenantId, `load:${dateStr}`);
      loadNumber = `LD-${dateStr.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;
    }

    // Require customerId for manual load creation (imports and lane-generated loads may not have it yet)
    if (
      !data.customerId &&
      data.intakeSource !== 'import' &&
      data.intakeSource !== 'recurring_lane' &&
      data.intakeSource !== 'email'
    ) {
      throw new BadRequestException('Customer is required. Select a customer before creating a load.');
    }

    // Phase 1: Resolve all stops outside transaction (external service calls)
    const isImport = data.intakeSource === 'import';
    const resolvedStops: Array<{
      stopId: number;
      stopData: (typeof data.stops)[number];
      facilityUnverified: boolean;
    }> = [];
    for (const stopData of data.stops) {
      let stop = await this.prisma.stop.findFirst({
        where: { stopId: stopData.stopId },
      });

      if (!stop && isImport) {
        // Import: always create a fresh stop (no tenant dedup) so each parsed
        // location keeps its own record. Merging is offered later as a reviewed
        // suggestion, never forced at write time — see StopMatchService.
        stop = await this.stopsService.createImportStop(data.tenantId, {
          name: stopData.name,
          address: stopData.address,
          city: stopData.city,
          state: stopData.state,
          zipCode: stopData.zipCode,
        });
        this.logger.log(`import stop created fresh (id=${stop.id}, ${stopData.city ?? '?'}, ${stopData.state ?? '?'})`);
      } else if (!stop && stopData.name) {
        // Manual entry: dedup-aware find-or-create against the tenant stop book.
        const result = await this.stopsService.findOrCreate(data.tenantId, {
          name: stopData.name,
          address: stopData.address,
          city: stopData.city,
          state: stopData.state,
          zipCode: stopData.zipCode,
        });
        stop = result.stop;
        this.logger.log(
          `create stop "${stopData.name}": ${result.isNew ? 'created new' : 'matched existing'} (id=${stop.id})`,
        );
      }

      if (!stop) {
        throw new NotFoundException(`Stop not found: ${stopData.stopId}`);
      }

      // A single Stop record may back multiple LoadStops in one load (e.g. yard
      // pickup + yard drop). LoadStop is the join — each row carries its own
      // sequence/timing/dock data, so sharing the Stop is correct, not a bug.

      // Best-effort geocode any stop missing coordinates
      let geocodeConfidence: number | null = stop.lat != null && stop.lon != null ? 1 : null;
      if (!stop.lat && !stop.lon) {
        this.logger.log(`Geocoding stop "${stop.name}" (id=${stop.id}) — missing coordinates`);
        const geo = await this.stopGeocodingService.geocodeAndUpdateStopReturning(stop.id, {
          address: stopData.address || stop.address,
          city: stopData.city || stop.city,
          state: stopData.state || stop.state,
          zipCode: stopData.zipCode || stop.zipCode,
          name: stopData.name || stop.name,
        });
        geocodeConfidence = geo?.confidence ?? null;
      }

      // Import-only: classify precision + offer a (non-binding) merge suggestion.
      // A location-known-but-dock-unconfirmed stop (no street OR no name) is flagged
      // so the dispatcher verifies the facility before dispatch.
      let facilityUnverified = false;
      if (isImport) {
        const hasStreet = !!stopData.address?.trim();
        const precision = derivePrecision({ hasStreet, geocodeConfidence });
        const refreshed = await this.prisma.stop.update({
          where: { id: stop.id },
          data: { locationPrecision: precision },
          select: { id: true, lat: true, lon: true, locationPrecision: true },
        });
        await this.stopMatchService.suggestMerge(data.tenantId, refreshed);
        facilityUnverified = !hasStreet || !stopData.name?.trim();
      }

      resolvedStops.push({ stopId: stop.id, stopData, facilityUnverified });
    }

    // Phase 2: Atomic creation — load + loadStops + linehaul charge in one transaction
    let validatedCustomFields = {};
    if (data.customFieldValues) {
      const result = await this.customFieldValidator.validate(data.tenantId, 'LOAD', data.customFieldValues, {
        isCreate: true,
      });
      validatedCustomFields = result.values;
    }

    const load = await this.prisma.$transaction(async (tx) => {
      const created = await tx.load.create({
        data: {
          loadNumber,
          status: (data.status as LoadStatus) || LoadStatus.PENDING,
          weightLbs: data.weightLbs,
          commodityType: data.commodityType,
          specialRequirements: data.specialRequirements || null,
          customerName: data.customerName,
          requiredEquipmentType: parseEquipmentType(data.equipmentType),
          referenceNumber: data.referenceNumber || null,
          rateCents: data.rateCents ?? null,
          pieces: data.pieces ?? null,
          intakeSource: data.intakeSource || 'manual',
          intakeMetadata: data.intakeMetadata || null,
          customerId: data.customerId ?? null,
          minTempF: data.minTempF ?? null,
          maxTempF: data.maxTempF ?? null,
          hazmatClass: data.hazmatClass || null,
          unNumber: data.unNumber || null,
          placardRequired: data.placardRequired ?? null,
          tenantId: data.tenantId,
          isActive: true,
          customFieldValues: Object.keys(validatedCustomFields).length > 0 ? validatedCustomFields : undefined,
        },
      });

      // Batch create all loadStops in a single query (N+1 fix)
      await tx.loadStop.createMany({
        data: resolvedStops.map(({ stopId, stopData, facilityUnverified }) => ({
          loadId: created.id,
          stopId,
          sequenceOrder: stopData.sequenceOrder,
          actionType: stopData.actionType,
          appointmentDate: stopData.appointmentDate ? new Date(stopData.appointmentDate) : null,
          earliestArrival: stopData.earliestArrival || null,
          latestArrival: stopData.latestArrival || null,
          estimatedDockHours: stopData.estimatedDockHours,
          facilityUnverified,
        })),
      });

      // Auto-create linehaul charge when rateCents is provided
      // Linehaul is revenue (billable to customer), not a cost
      if (data.rateCents) {
        const quantity = 1;
        const totalCents = Math.round(quantity * data.rateCents);
        await tx.loadCharge.create({
          data: {
            loadId: created.id,
            chargeType: 'linehaul',
            description: 'Linehaul rate',
            quantity,
            unitPriceCents: data.rateCents,
            totalCents,
            isBillable: true,
            isPayable: false,
          },
        });
      }

      return created;
    });

    // Phase 3: Post-transaction — denormalized fields, events, logging
    await this.loadQueryService.computeDenormalizedFields(load.id);

    // Fire-and-forget: async HERE Routing mileage. Never blocks the response.
    void this.loadMileage
      .enqueueRecalc(load.id)
      .catch((e) => this.logger.warn(`Failed to enqueue mileage for load ${load.id}: ${(e as Error).message}`));

    // Return load with stops and tenant (tenant needed for string tenantId in event)
    const result = await this.prisma.load.findUnique({
      where: { id: load.id },
      include: {
        stops: {
          include: { stop: true },
          orderBy: { sequenceOrder: 'asc' },
        },
        tenant: { select: { tenantId: true } },
      },
    });

    this.logger.log(`Load created: ${load.loadNumber}`);

    // Fire-and-forget event for outbound webhooks + SSE bridge
    if (result) {
      await this.events.emit(SALLY_EVENTS.LOAD_CREATED, result.tenantId, {
        entityId: result.loadNumber,
        entityType: 'load',
        loadNumber: result.loadNumber,
        status: result.status,
        customerName: result.customerName,
        createdAt: result.createdAt,
      });
    }

    // Log creation event (fire-and-forget)
    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'created',
        toValue: result.status,
        description: `Load ${result.loadNumber} created via ${result.intakeSource}`,
      })
      .catch((err) => this.logger.error(`Failed to log create event: ${err.message}`));

    return formatLoadResponse(result);
  }
}
