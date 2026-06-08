import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { CreateTrailerDto } from '../dto/create-trailer.dto';
import { UpdateTrailerDto } from '../dto/update-trailer.dto';

const trailerIncludes = {
  assignedVehicle: {
    select: { id: true, vehicleId: true, unitNumber: true },
  },
};

@Injectable()
export class TrailersService {
  private readonly logger = new Logger(TrailersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Find all active trailers for a tenant.
   * Pass includeInactive=true to include all lifecycle statuses.
   */
  async findAll(tenantId: number, includeInactive: boolean = false) {
    const where: any = { tenantId };
    if (!includeInactive) {
      where.lifecycleStatus = 'ACTIVE';
    }

    const trailers = await this.prisma.trailer.findMany({
      where,
      include: trailerIncludes,
      orderBy: { unitNumber: 'asc' },
    });

    return trailers.map((t) => this.formatResponse(t));
  }

  /**
   * Find inactive and decommissioned trailers for a tenant.
   */
  async findInactive(tenantId: number) {
    const trailers = await this.prisma.trailer.findMany({
      where: {
        tenantId,
        lifecycleStatus: { in: ['INACTIVE', 'DECOMMISSIONED'] },
      },
      include: trailerIncludes,
      orderBy: { unitNumber: 'asc' },
    });

    return trailers.map((t) => this.formatResponse(t));
  }

  /**
   * Find a single trailer by trailerId and tenantId.
   */
  async findOne(trailerId: string, tenantId: number) {
    const trailer = await this.prisma.trailer.findFirst({
      where: { trailerId, tenantId },
      include: trailerIncludes,
    });

    if (!trailer) {
      throw new NotFoundException('Trailer not found');
    }

    return trailer;
  }

  /**
   * Create a new trailer.
   */
  async create(tenantId: number, dto: CreateTrailerDto) {
    const trailerId = 'TRL-' + Date.now().toString(36).toUpperCase();

    // Validate reefer fields
    this.validateReeferFields(dto);

    // Validate vehicle assignment if provided
    if (dto.assignedVehicleId) {
      await this.validateVehicleForAssignment(dto.assignedVehicleId, tenantId, null);
    }

    const trailer = await this.prisma.$transaction(async (tx) => {
      const created = await tx.trailer.create({
        data: {
          trailerId,
          unitNumber: dto.unitNumber,
          equipmentType: dto.equipmentType as any,
          vin: dto.vin || null,
          licensePlate: dto.licensePlate || null,
          licensePlateState: dto.licensePlateState || null,
          make: dto.make || null,
          model: dto.model || null,
          year: dto.year || null,
          lengthFeet: dto.lengthFeet || null,
          maxPayloadLbs: dto.maxPayloadLbs || null,
          ownershipType: (dto.ownershipType as any) || null,
          reeferMake: dto.reeferMake || null,
          reeferModel: dto.reeferModel || null,
          reeferSerial: dto.reeferSerial || null,
          // Calendar dates: pass ISO strings directly to Prisma for @db.Date fields
          // NEVER use new Date(dateString) — causes off-by-one in US timezones
          registrationExpiry: dto.registrationExpiry || null,
          insuranceExpiry: dto.insuranceExpiry || null,
          annualInspectionDate: dto.annualInspectionDate || null,
          nextMaintenanceDate: dto.nextMaintenanceDate || null,
          notes: dto.notes || null,
          assignedVehicleId: dto.assignedVehicleId || null,
          status: dto.assignedVehicleId ? 'ASSIGNED' : 'AVAILABLE',
          tenantId,
        },
        include: trailerIncludes,
      });

      return created;
    });

    this.logger.log(`Trailer created: ${trailerId} - ${dto.unitNumber}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_CREATED, tenantId, {
      entityId: trailer.trailerId,
      entityType: 'trailer',
      trailerId: trailer.trailerId,
    });

    return this.formatResponse(trailer);
  }

  /**
   * Update an existing trailer.
   */
  async update(trailerId: string, tenantId: number, dto: UpdateTrailerDto) {
    const existing = await this.findOne(trailerId, tenantId);

    // Validate reefer fields against resolved equipment type
    const resolvedEquipmentType = dto.equipmentType || existing.equipmentType;
    if ((dto.reeferMake || dto.reeferModel || dto.reeferSerial) && resolvedEquipmentType !== 'REEFER') {
      throw new BadRequestException(
        'Reefer fields (reeferMake, reeferModel, reeferSerial) can only be set on REEFER trailers',
      );
    }

    const trailer = await this.prisma.trailer.update({
      where: { id: existing.id },
      data: {
        ...(dto.unitNumber !== undefined ? { unitNumber: dto.unitNumber } : {}),
        ...(dto.equipmentType !== undefined ? { equipmentType: dto.equipmentType as any } : {}),
        ...(dto.vin !== undefined ? { vin: dto.vin } : {}),
        ...(dto.licensePlate !== undefined ? { licensePlate: dto.licensePlate } : {}),
        ...(dto.licensePlateState !== undefined ? { licensePlateState: dto.licensePlateState } : {}),
        ...(dto.make !== undefined ? { make: dto.make } : {}),
        ...(dto.model !== undefined ? { model: dto.model } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.lengthFeet !== undefined ? { lengthFeet: dto.lengthFeet } : {}),
        ...(dto.maxPayloadLbs !== undefined ? { maxPayloadLbs: dto.maxPayloadLbs } : {}),
        ...(dto.ownershipType !== undefined ? { ownershipType: dto.ownershipType as any } : {}),
        ...(dto.reeferMake !== undefined ? { reeferMake: dto.reeferMake } : {}),
        ...(dto.reeferModel !== undefined ? { reeferModel: dto.reeferModel } : {}),
        ...(dto.reeferSerial !== undefined ? { reeferSerial: dto.reeferSerial } : {}),
        ...(dto.registrationExpiry !== undefined ? { registrationExpiry: dto.registrationExpiry || null } : {}),
        ...(dto.insuranceExpiry !== undefined ? { insuranceExpiry: dto.insuranceExpiry || null } : {}),
        ...(dto.annualInspectionDate !== undefined ? { annualInspectionDate: dto.annualInspectionDate || null } : {}),
        ...(dto.nextMaintenanceDate !== undefined ? { nextMaintenanceDate: dto.nextMaintenanceDate || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
      include: trailerIncludes,
    });

    this.logger.log(`Trailer updated: ${trailerId}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_UPDATED, tenantId, {
      entityId: trailer.trailerId,
      entityType: 'trailer',
      trailerId: trailer.trailerId,
    });

    return this.formatResponse(trailer);
  }

  /**
   * Deactivate an active trailer.
   */
  async deactivate(trailerId: string, tenantId: number, userId: number, reason: string) {
    const trailer = await this.findOne(trailerId, tenantId);

    if (trailer.lifecycleStatus !== 'ACTIVE') {
      throw new BadRequestException('Trailer is not active');
    }

    // Check for active loads before deactivation
    const activeLoads = await this.prisma.load.count({
      where: {
        trailerId: trailer.id,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
      },
    });
    if (activeLoads > 0) {
      throw new ConflictException(
        `Cannot deactivate trailer with ${activeLoads} active load(s). Complete or reassign them first.`,
      );
    }

    // Unassign vehicle if currently assigned
    if (trailer.assignedVehicleId) {
      await this.prisma.trailer.update({
        where: { id: trailer.id },
        data: { assignedVehicleId: null },
      });
    }

    const updated = await this.prisma.trailer.update({
      where: { id: trailer.id },
      data: {
        lifecycleStatus: 'INACTIVE',
        previousStatus: trailer.status,
        status: 'OUT_OF_SERVICE',
        deactivatedAt: new Date(),
        deactivatedBy: userId,
        deactivationReason: reason,
      },
      include: trailerIncludes,
    });

    this.logger.log(`Trailer deactivated: ${trailerId}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_DEACTIVATED, tenantId, {
      entityId: updated.trailerId,
      entityType: 'trailer',
      trailerId: updated.trailerId,
      reason,
    });

    return this.formatResponse(updated);
  }

  /**
   * Reactivate an inactive trailer.
   */
  async reactivate(trailerId: string, tenantId: number, userId: number) {
    const trailer = await this.findOne(trailerId, tenantId);

    if (trailer.lifecycleStatus !== 'INACTIVE') {
      throw new BadRequestException('Trailer is not inactive');
    }

    const updated = await this.prisma.trailer.update({
      where: { id: trailer.id },
      data: {
        lifecycleStatus: 'ACTIVE',
        status: 'AVAILABLE',
        previousStatus: null,
        reactivatedAt: new Date(),
        reactivatedBy: userId,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      },
      include: trailerIncludes,
    });

    this.logger.log(`Trailer reactivated: ${trailerId}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_REACTIVATED, tenantId, {
      entityId: updated.trailerId,
      entityType: 'trailer',
      trailerId: updated.trailerId,
    });

    return this.formatResponse(updated);
  }

  /**
   * Decommission a trailer (permanent lifecycle end).
   */
  async decommission(trailerId: string, tenantId: number, userId: number, reason: string) {
    const trailer = await this.findOne(trailerId, tenantId);

    if (trailer.lifecycleStatus === 'DECOMMISSIONED') {
      throw new BadRequestException('Trailer is already decommissioned');
    }

    // Check for active loads before decommission
    const activeLoads = await this.prisma.load.count({
      where: {
        trailerId: trailer.id,
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
      },
    });
    if (activeLoads > 0) {
      throw new ConflictException(
        `Cannot decommission trailer with ${activeLoads} active load(s). Complete or reassign them first.`,
      );
    }

    // Unassign vehicle if currently assigned
    if (trailer.assignedVehicleId) {
      await this.prisma.trailer.update({
        where: { id: trailer.id },
        data: { assignedVehicleId: null },
      });
    }

    const updated = await this.prisma.trailer.update({
      where: { id: trailer.id },
      data: {
        lifecycleStatus: 'DECOMMISSIONED',
        previousStatus: trailer.status,
        status: 'OUT_OF_SERVICE',
        deactivatedAt: new Date(),
        deactivatedBy: userId,
        deactivationReason: reason,
      },
      include: trailerIncludes,
    });

    this.logger.log(`Trailer decommissioned: ${trailerId}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_DECOMMISSIONED, tenantId, {
      entityId: updated.trailerId,
      entityType: 'trailer',
      trailerId: updated.trailerId,
      reason,
    });

    return this.formatResponse(updated);
  }

  /**
   * Assign a vehicle to a trailer (hook trailer).
   */
  async assignVehicle(trailerId: string, tenantId: number, vehicleId: number) {
    const trailer = await this.findOne(trailerId, tenantId);

    // Check trailer not already assigned to a different vehicle
    if (trailer.assignedVehicleId && trailer.assignedVehicleId !== vehicleId) {
      throw new ConflictException('Trailer is already assigned to a different vehicle. Unassign it first.');
    }

    // Wrap validation + update in transaction to prevent race conditions
    // on the 1:1 vehicle-trailer constraint
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.validateVehicleForAssignment(vehicleId, tenantId, trailer.id);

      try {
        return await tx.trailer.update({
          where: { id: trailer.id },
          data: {
            assignedVehicleId: vehicleId,
            status: 'ASSIGNED',
          },
          include: trailerIncludes,
        });
      } catch (error: any) {
        // Handle unique constraint violation on assignedVehicleId
        if (error?.code === 'P2002') {
          throw new ConflictException('This vehicle is already assigned to another trailer');
        }
        throw error;
      }
    });

    this.logger.log(`Trailer ${trailerId} assigned to vehicle ID ${vehicleId}`);

    await this.events.emit(SALLY_EVENTS.TRAILER_ASSIGNED, tenantId, {
      entityId: updated.trailerId,
      entityType: 'trailer',
      trailerId: updated.trailerId,
      vehicleId,
    });

    return this.formatResponse(updated);
  }

  /**
   * Unassign the current vehicle from a trailer (unhook trailer).
   */
  async unassignVehicle(trailerId: string, tenantId: number) {
    const trailer = await this.findOne(trailerId, tenantId);

    if (!trailer.assignedVehicleId) {
      throw new BadRequestException('Trailer is not assigned to any vehicle');
    }

    const previousVehicleId = trailer.assignedVehicleId;

    const updated = await this.prisma.trailer.update({
      where: { id: trailer.id },
      data: {
        assignedVehicleId: null,
        ...(trailer.status === 'ASSIGNED' ? { status: 'AVAILABLE' } : {}),
      },
      include: trailerIncludes,
    });

    this.logger.log(`Trailer ${trailerId} unassigned from vehicle`);

    await this.events.emit(SALLY_EVENTS.TRAILER_UNASSIGNED, tenantId, {
      entityId: updated.trailerId,
      entityType: 'trailer',
      trailerId: updated.trailerId,
      previousVehicleId,
    });

    return this.formatResponse(updated);
  }

  /**
   * Validate that reefer-specific fields are only set on REEFER trailers.
   */
  private validateReeferFields(dto: CreateTrailerDto) {
    if ((dto.reeferMake || dto.reeferModel || dto.reeferSerial) && dto.equipmentType !== 'REEFER') {
      throw new BadRequestException(
        'Reefer fields (reeferMake, reeferModel, reeferSerial) can only be set on REEFER trailers',
      );
    }
  }

  /**
   * Validate that a vehicle exists, belongs to the same tenant,
   * and is not already assigned to a different trailer.
   */
  private async validateVehicleForAssignment(vehicleId: number, tenantId: number, currentTrailerId: number | null) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, tenantId },
    });

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    // Check if vehicle is already assigned to another trailer
    const existingAssignment = await this.prisma.trailer.findFirst({
      where: {
        assignedVehicleId: vehicleId,
        tenantId,
        ...(currentTrailerId ? { id: { not: currentTrailerId } } : {}),
      },
    });

    if (existingAssignment) {
      throw new ConflictException('This vehicle is already assigned to another trailer. Unassign it first.');
    }
  }

  /**
   * Format a Prisma trailer result for the API response.
   */
  formatResponse(trailer: any) {
    return {
      id: trailer.id,
      trailerId: trailer.trailerId,
      unitNumber: trailer.unitNumber,
      equipmentType: trailer.equipmentType,
      vin: trailer.vin,
      licensePlate: trailer.licensePlate,
      licensePlateState: trailer.licensePlateState,
      make: trailer.make,
      model: trailer.model,
      year: trailer.year,
      lengthFeet: trailer.lengthFeet,
      maxPayloadLbs: trailer.maxPayloadLbs,
      ownershipType: trailer.ownershipType,
      reeferMake: trailer.reeferMake,
      reeferModel: trailer.reeferModel,
      reeferSerial: trailer.reeferSerial,
      registrationExpiry: trailer.registrationExpiry ? trailer.registrationExpiry.toISOString().split('T')[0] : null,
      insuranceExpiry: trailer.insuranceExpiry ? trailer.insuranceExpiry.toISOString().split('T')[0] : null,
      annualInspectionDate: trailer.annualInspectionDate
        ? trailer.annualInspectionDate.toISOString().split('T')[0]
        : null,
      nextMaintenanceDate: trailer.nextMaintenanceDate ? trailer.nextMaintenanceDate.toISOString().split('T')[0] : null,
      notes: trailer.notes,
      status: trailer.status,
      lifecycleStatus: trailer.lifecycleStatus,
      previousStatus: trailer.previousStatus || null,
      eldTelematicsMetadata: trailer.eldTelematicsMetadata,
      assignedVehicleId: trailer.assignedVehicleId,
      assignedVehicle: trailer.assignedVehicle
        ? {
            id: trailer.assignedVehicle.id,
            vehicleId: trailer.assignedVehicle.vehicleId,
            unitNumber: trailer.assignedVehicle.unitNumber,
          }
        : null,
      externalTrailerId: trailer.externalTrailerId,
      externalSource: trailer.externalSource,
      lastSyncedAt: trailer.lastSyncedAt?.toISOString() || null,
      deactivatedAt: trailer.deactivatedAt?.toISOString() || null,
      deactivatedBy: trailer.deactivatedBy || null,
      deactivationReason: trailer.deactivationReason || null,
      reactivatedAt: trailer.reactivatedAt?.toISOString() || null,
      reactivatedBy: trailer.reactivatedBy || null,
      createdAt: trailer.createdAt?.toISOString(),
      updatedAt: trailer.updatedAt?.toISOString(),
    };
  }
}
