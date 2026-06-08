import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { LoadEventsService } from './load-events.service';
import { LoadLegService } from './load-leg.service';
import { LoadStatusService } from './load-status.service';
import { LoadQueryService } from './load-query.service';

@Injectable()
export class LoadAssignmentService {
  private readonly logger = new Logger(LoadAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
    private readonly loadEventsService: LoadEventsService,
    private readonly loadLegService: LoadLegService,
    private readonly loadStatusService: LoadStatusService,
    private readonly loadQueryService: LoadQueryService,
  ) {}

  /**
   * Assign driver and vehicle to load
   */
  async assignLoad(loadNumber: string, driverId: string, vehicleId: string, trailerId?: string) {
    const load = await this.prisma.load.findFirst({ where: { loadNumber } });
    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }

    // If load belongs to a trip, block direct assignment
    if (load.tripId) {
      throw new BadRequestException('This load is part of a trip. Assign the driver via the trip instead.');
    }

    // If relay load, delegate to LoadLegService for the active (next unassigned/pending) leg
    if (load.isRelay) {
      const legs = await this.prisma.loadLeg.findMany({
        where: { loadId: load.id },
        orderBy: { sequence: 'asc' },
      });
      const activeLeg = LoadLegService.getActiveLeg(legs);
      if (!activeLeg) {
        throw new BadRequestException(
          'No assignable leg found on this relay load. All legs may be delivered or cancelled.',
        );
      }
      return this.loadLegService.assignLeg(activeLeg.legId, driverId, vehicleId || undefined, load.tenantId, trailerId);
    }

    const driver = await this.prisma.driver.findFirst({ where: { driverId } });
    if (!driver) {
      throw new NotFoundException(`Driver not found: ${driverId}`);
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { vehicleId },
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
      throw new NotFoundException(`Vehicle not found: ${vehicleId}`);
    }

    // Resolve trailer
    let resolvedTrailerDbId: number | null = null;
    let resolvedTrailerStringId: string | null = null;
    let resolvedTrailerUnitNumber: string | null = null;

    if (load.requiredEquipmentType === 'POWER_ONLY') {
      // POWER_ONLY loads must have no trailer
      resolvedTrailerDbId = null;
    } else if (trailerId) {
      // Explicit trailer provided — look it up
      const trailer = await this.prisma.trailer.findFirst({
        where: { trailerId, tenantId: load.tenantId },
      });
      if (!trailer) {
        throw new NotFoundException(`Trailer not found: ${trailerId}`);
      }
      // Warn if equipment type mismatch but don't block
      if (load.requiredEquipmentType && trailer.equipmentType !== load.requiredEquipmentType) {
        this.logger.warn(
          `Trailer ${trailerId} equipment type ${trailer.equipmentType} does not match load required type ${load.requiredEquipmentType}`,
        );
      }
      resolvedTrailerDbId = trailer.id;
      resolvedTrailerStringId = trailer.trailerId;
      resolvedTrailerUnitNumber = trailer.unitNumber;

      // Auto-sync trailer status: AVAILABLE → ASSIGNED
      if (trailer.status === 'AVAILABLE') {
        await this.prisma.trailer.update({
          where: { id: trailer.id },
          data: { status: 'ASSIGNED' },
        });
        this.logger.log(`Trailer ${trailerId} status auto-updated: AVAILABLE → ASSIGNED`);
      }
    } else if (vehicle.currentTrailer) {
      // Auto-fill from vehicle's current trailer
      const ct = vehicle.currentTrailer;
      if (load.requiredEquipmentType && ct.equipmentType !== load.requiredEquipmentType) {
        this.logger.warn(
          `Vehicle current trailer ${ct.trailerId} equipment type ${ct.equipmentType} does not match load required type ${load.requiredEquipmentType}`,
        );
      }
      resolvedTrailerDbId = ct.id;
      resolvedTrailerStringId = ct.trailerId;
      resolvedTrailerUnitNumber = ct.unitNumber;

      // Auto-sync trailer status: AVAILABLE → ASSIGNED
      if (ct.status === 'AVAILABLE') {
        await this.prisma.trailer.update({
          where: { id: ct.id },
          data: { status: 'ASSIGNED' },
        });
        this.logger.log(`Trailer ${ct.trailerId} status auto-updated: AVAILABLE → ASSIGNED`);
      }
    }

    // Cancel active route plan if driver is being reassigned
    if (load.driverId && load.driverId !== driver.id) {
      await this.loadStatusService.cancelRoutePlanForLoad(loadNumber);
    }

    const updateData: any = {
      driverId: driver.id,
      vehicleId: vehicle.id,
      trailerId: resolvedTrailerDbId,
    };

    // Auto-transition pending → assigned
    if (load.status === 'PENDING') {
      updateData.status = 'ASSIGNED';
      updateData.assignedAt = new Date();
    }

    await this.prisma.load.update({
      where: { id: load.id },
      data: updateData,
    });

    // Auto-sync vehicle status: AVAILABLE → ASSIGNED
    if (vehicle.status === 'AVAILABLE') {
      await this.prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { status: 'ASSIGNED' },
      });
      this.logger.log(`Vehicle ${vehicleId} status auto-updated: AVAILABLE → ASSIGNED`);
    }

    this.logger.log(
      `Load ${loadNumber} assigned to driver ${driverId} and vehicle ${vehicleId}` +
        (resolvedTrailerStringId ? ` and trailer ${resolvedTrailerStringId}` : ''),
    );

    // Emit domain event for assignment
    await this.events.emit(SALLY_EVENTS.LOAD_ASSIGNED, load.tenantId, {
      entityId: load.loadNumber,
      entityType: 'load',
      loadNumber: load.loadNumber,
      driverId: driver.driverId,
      vehicleId: vehicle.vehicleId,
      trailerId: resolvedTrailerDbId,
    });

    // Log assignment event (fire-and-forget)
    this.loadEventsService
      .logEvent({
        loadId: load.id,
        eventType: 'assigned',
        description:
          `Assigned to ${driver.name} (${vehicle.unitNumber})` +
          (resolvedTrailerUnitNumber ? ` with trailer ${resolvedTrailerUnitNumber}` : ''),
        metadata: {
          driver_id: driverId,
          vehicle_id: vehicleId,
          trailer_id: resolvedTrailerStringId,
        },
      })
      .catch((err) => this.logger.error(`Failed to log assign event: ${err.message}`));

    // Log auto-transition if it happened
    if (load.status === 'PENDING') {
      this.loadEventsService
        .logEvent({
          loadId: load.id,
          eventType: 'status_changed',
          fromValue: 'PENDING',
          toValue: 'ASSIGNED',
          description: 'Status changed to assigned (auto-transition on driver assignment)',
        })
        .catch(() => {});
    }

    // Check for unavailability warnings (non-blocking)
    const warnings: Array<{ type: string; message: string }> = [];
    if (load.pickupDate && load.deliveryDate) {
      const [driverUnavail, vehicleUnavail] = await Promise.all([
        this.prisma.driverUnavailability.findFirst({
          where: {
            tenantId: load.tenantId,
            driverId: driver.id,
            startDate: { lte: load.deliveryDate },
            endDate: { gte: load.pickupDate },
          },
        }),
        this.prisma.vehicleUnavailability.findFirst({
          where: {
            tenantId: load.tenantId,
            vehicleId: vehicle.id,
            startDate: { lte: load.deliveryDate },
            endDate: { gte: load.pickupDate },
          },
        }),
      ]);
      if (driverUnavail) {
        warnings.push({
          type: 'DRIVER_UNAVAILABLE',
          message: `Driver unavailable ${driverUnavail.startDate.toISOString().slice(0, 10)}–${driverUnavail.endDate.toISOString().slice(0, 10)} (${driverUnavail.type})`,
        });
      }
      if (vehicleUnavail) {
        warnings.push({
          type: 'VEHICLE_UNAVAILABLE',
          message: `Vehicle unavailable ${vehicleUnavail.startDate.toISOString().slice(0, 10)}–${vehicleUnavail.endDate.toISOString().slice(0, 10)} (${vehicleUnavail.type})`,
        });
      }
    }

    return {
      success: true,
      message: 'Load assigned successfully',
      loadNumber,
      driverId,
      vehicleId,
      trailerId: resolvedTrailerStringId,
      driverName: driver.name,
      vehicleUnitNumber: vehicle.unitNumber,
      trailerUnitNumber: resolvedTrailerUnitNumber,
      status: updateData.status || load.status,
      warnings,
    };
  }

  /**
   * Assign drivers (and optionally vehicles) to all legs of a relay load in one call.
   */
  async assignAllLegs(
    loadNumber: string,
    assignments: Array<{
      legId: string;
      driverId: string;
      vehicleId?: string;
      trailerId?: string;
    }>,
    tenantId: number,
  ) {
    // 1. Validate load exists, is relay, and in correct status
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      select: { id: true, isRelay: true, status: true },
    });

    if (!load) {
      throw new NotFoundException(`Load not found: ${loadNumber}`);
    }
    if (!load.isRelay) {
      throw new BadRequestException(`Load ${loadNumber} is not a relay load`);
    }
    if (!['PENDING', 'ASSIGNED'].includes(load.status)) {
      throw new BadRequestException(
        `Cannot assign legs for load in "${load.status}" status. Must be pending or assigned.`,
      );
    }

    // 2. Validation pass — check everything BEFORE any writes
    // 2a. Validate all legIds exist and belong to this load
    const legs = await this.prisma.loadLeg.findMany({
      where: { loadId: load.id, tenantId },
      select: { legId: true, sequence: true, status: true },
      orderBy: { sequence: 'asc' },
    });
    const legIdSet = new Set(legs.map((l) => l.legId));
    for (const assignment of assignments) {
      if (!legIdSet.has(assignment.legId)) {
        throw new BadRequestException(`Leg "${assignment.legId}" does not belong to load ${loadNumber}`);
      }
    }

    // 2b. Validate all driverIds exist and belong to this tenant
    const uniqueDriverIds = [...new Set(assignments.map((a) => a.driverId))];
    const drivers = await this.prisma.driver.findMany({
      where: { driverId: { in: uniqueDriverIds }, tenantId },
      select: { driverId: true },
    });
    const validDriverIds = new Set(drivers.map((d) => d.driverId));
    for (const assignment of assignments) {
      if (!validDriverIds.has(assignment.driverId)) {
        throw new BadRequestException(`Driver "${assignment.driverId}" not found in tenant ${tenantId}`);
      }
    }

    // 2c. Check no same driver on consecutive legs (by assignment order matched to leg sequence)
    const assignmentsByLeg = new Map(assignments.map((a) => [a.legId, a]));
    const sortedLegs = [...legs].sort((a, b) => a.sequence - b.sequence);
    for (let i = 0; i < sortedLegs.length - 1; i++) {
      const currentAssign = assignmentsByLeg.get(sortedLegs[i].legId);
      const nextAssign = assignmentsByLeg.get(sortedLegs[i + 1].legId);
      if (currentAssign && nextAssign && currentAssign.driverId === nextAssign.driverId) {
        throw new BadRequestException(
          `Driver "${currentAssign.driverId}" is assigned to consecutive legs ${sortedLegs[i].legId} and ${sortedLegs[i + 1].legId}. Relay legs must have different drivers on adjacent legs.`,
        );
      }
    }

    // 3. Assign each leg sequentially (validation above ensures they'll all succeed)
    for (const assignment of assignments) {
      await this.loadLegService.assignLeg(
        assignment.legId,
        assignment.driverId,
        assignment.vehicleId,
        tenantId,
        assignment.trailerId,
      );
    }

    // 4. Return refreshed load
    return this.loadQueryService.findOne(loadNumber, tenantId);
  }
}
