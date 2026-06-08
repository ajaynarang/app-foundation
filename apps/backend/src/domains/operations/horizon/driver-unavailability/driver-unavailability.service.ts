import { Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { CreateDriverUnavailabilityDto, UpdateDriverUnavailabilityDto } from './driver-unavailability.dto';
import { format } from 'date-fns';

/** Parse YYYY-MM-DD to a Date at UTC midnight — safe for @db.Date columns */
function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

@Injectable()
export class DriverUnavailabilityService {
  private readonly logger = new Logger(DriverUnavailabilityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async create(tenantId: number, userId: number, dto: CreateDriverUnavailabilityDto) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (dto.startDate < today) {
      throw new BadRequestException('Start date cannot be in the past');
    }

    const driver = await this.prisma.driver.findFirst({
      where: { id: dto.driverId, tenantId },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    // IMPORTANT: Use parseISO — never new Date(dateString) — prevents off-by-one
    const overlap = await this.prisma.driverUnavailability.findFirst({
      where: {
        tenantId,
        driverId: dto.driverId,
        startDate: { lte: parseDateOnly(dto.endDate) },
        endDate: { gte: parseDateOnly(dto.startDate) },
      },
    });
    if (overlap) {
      throw new ConflictException('Driver already has unavailability for overlapping dates');
    }

    const inTransitLoad = await this.prisma.load.findFirst({
      where: {
        tenantId,
        driverId: dto.driverId,
        status: 'IN_TRANSIT',
        pickupDate: { lte: parseDateOnly(dto.endDate) },
        deliveryDate: { gte: parseDateOnly(dto.startDate) },
      },
    });
    if (inTransitLoad) {
      throw new ConflictException(`Driver has in-transit load #${inTransitLoad.loadNumber} on requested dates`);
    }

    const record = await this.prisma.driverUnavailability.create({
      data: {
        tenantId,
        driverId: dto.driverId,
        type: dto.type,
        startDate: parseDateOnly(dto.startDate),
        endDate: parseDateOnly(dto.endDate),
        note: dto.note ?? null,
        createdById: userId,
      },
    });

    await this.events.emit(SALLY_EVENTS.DRIVER_UNAVAILABILITY_CREATED, tenantId, {
      entityId: String(record.id),
      entityType: 'driver-unavailability',
      id: record.id,
      driverId: dto.driverId,
      type: dto.type,
      startDate: dto.startDate,
      endDate: dto.endDate,
    });

    this.logger.log(`Created driver unavailability #${record.id} for driver ${dto.driverId}`);
    return record;
  }

  async update(id: number, tenantId: number, dto: UpdateDriverUnavailabilityDto) {
    const existing = await this.prisma.driverUnavailability.findUnique({
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

    const overlap = await this.prisma.driverUnavailability.findFirst({
      where: {
        tenantId,
        driverId: existing.driverId,
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
        driverId: existing.driverId,
        status: 'IN_TRANSIT',
        pickupDate: { lte: parseDateOnly(endDate) },
        deliveryDate: { gte: parseDateOnly(startDate) },
      },
    });
    if (inTransitLoad) {
      throw new ConflictException(`Driver has in-transit load #${inTransitLoad.loadNumber} on requested dates`);
    }

    const updated = await this.prisma.driverUnavailability.update({
      where: { id },
      data: {
        type: dto.type,
        startDate: dto.startDate ? parseDateOnly(dto.startDate) : undefined,
        endDate: dto.endDate ? parseDateOnly(dto.endDate) : undefined,
        note: dto.note,
      },
    });

    await this.events.emit(SALLY_EVENTS.DRIVER_UNAVAILABILITY_UPDATED, tenantId, { id, driverId: existing.driverId });

    return updated;
  }

  async delete(id: number, tenantId: number) {
    const existing = await this.prisma.driverUnavailability.findUnique({
      where: { id },
    });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundException('Unavailability record not found');
    }

    await this.prisma.driverUnavailability.delete({ where: { id } });

    await this.events.emit(SALLY_EVENTS.DRIVER_UNAVAILABILITY_DELETED, tenantId, { id, driverId: existing.driverId });
  }
}
