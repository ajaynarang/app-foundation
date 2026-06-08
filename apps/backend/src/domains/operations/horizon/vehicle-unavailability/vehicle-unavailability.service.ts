import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { CreateVehicleUnavailabilityDto, UpdateVehicleUnavailabilityDto } from './vehicle-unavailability.dto';
import { format } from 'date-fns';

/** Parse YYYY-MM-DD to a Date at UTC midnight — safe for @db.Date columns */
function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

@Injectable()
export class VehicleUnavailabilityService {
  private readonly logger = new Logger(VehicleUnavailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async create(tenantId: number, userId: number, dto: CreateVehicleUnavailabilityDto) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.startDate < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, tenantId },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const overlap = await this.prisma.vehicleUnavailability.findFirst({
      where: {
        tenantId,
        vehicleId: dto.vehicleId,
        startDate: { lte: parseDateOnly(dto.endDate) },
        endDate: { gte: parseDateOnly(dto.startDate) },
      },
    });
    if (overlap) {
      throw new ConflictException('Vehicle already has unavailability for overlapping dates');
    }

    const inTransitLoad = await this.prisma.load.findFirst({
      where: {
        tenantId,
        vehicleId: dto.vehicleId,
        status: 'IN_TRANSIT',
        pickupDate: { lte: parseDateOnly(dto.endDate) },
        deliveryDate: { gte: parseDateOnly(dto.startDate) },
      },
    });
    if (inTransitLoad) {
      throw new ConflictException(`Vehicle is on in-transit load #${inTransitLoad.loadNumber} on requested dates`);
    }

    const record = await this.prisma.vehicleUnavailability.create({
      data: {
        tenantId,
        vehicleId: dto.vehicleId,
        type: dto.type,
        startDate: parseDateOnly(dto.startDate),
        endDate: parseDateOnly(dto.endDate),
        note: dto.note,
        createdById: userId,
      },
    });

    await this.events.emit(SALLY_EVENTS.VEHICLE_UNAVAILABILITY_CREATED, tenantId, {
      entityId: String(record.id),
      entityType: 'vehicle-unavailability',
      id: record.id,
      vehicleId: dto.vehicleId,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    this.logger.log(`Created vehicle unavailability #${record.id} for vehicle ${dto.vehicleId}`);
    return record;
  }

  async update(id: number, tenantId: number, dto: UpdateVehicleUnavailabilityDto) {
    const existing = await this.prisma.vehicleUnavailability.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Unavailability record not found');
    }

    const startDate = dto.startDate ?? format(existing.startDate, 'yyyy-MM-dd');
    const endDate = dto.endDate ?? format(existing.endDate, 'yyyy-MM-dd');

    if (endDate < startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }

    if (dto.startDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (dto.startDate < today) {
        throw new BadRequestException('Start date cannot be in the past');
      }
    }

    const overlap = await this.prisma.vehicleUnavailability.findFirst({
      where: {
        tenantId,
        vehicleId: existing.vehicleId,
        id: { not: id },
        startDate: { lte: parseDateOnly(endDate) },
        endDate: { gte: parseDateOnly(startDate) },
      },
    });
    if (overlap) {
      throw new ConflictException('Overlapping unavailability exists');
    }

    const inTransitLoad = await this.prisma.load.findFirst({
      where: {
        tenantId,
        vehicleId: existing.vehicleId,
        status: 'IN_TRANSIT',
        pickupDate: { lte: parseDateOnly(endDate) },
        deliveryDate: { gte: parseDateOnly(startDate) },
      },
    });
    if (inTransitLoad) {
      throw new ConflictException(`Vehicle is on in-transit load #${inTransitLoad.loadNumber} on requested dates`);
    }

    const updated = await this.prisma.vehicleUnavailability.update({
      where: { id },
      data: {
        type: dto.type,
        startDate: dto.startDate ? parseDateOnly(dto.startDate) : undefined,
        endDate: dto.endDate ? parseDateOnly(dto.endDate) : undefined,
        note: dto.note,
      },
    });

    await this.events.emit(SALLY_EVENTS.VEHICLE_UNAVAILABILITY_UPDATED, tenantId, {
      id,
      vehicleId: existing.vehicleId,
    });

    return updated;
  }

  async delete(id: number, tenantId: number) {
    const existing = await this.prisma.vehicleUnavailability.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Unavailability record not found');
    }

    await this.prisma.vehicleUnavailability.delete({ where: { id } });

    await this.events.emit(SALLY_EVENTS.VEHICLE_UNAVAILABILITY_DELETED, tenantId, {
      id,
      vehicleId: existing.vehicleId,
    });
  }
}
