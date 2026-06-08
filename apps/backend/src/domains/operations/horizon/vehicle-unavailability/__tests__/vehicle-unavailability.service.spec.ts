import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { VehicleUnavailabilityService } from '../vehicle-unavailability.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';

/** Helper: return a YYYY-MM-DD string N days from today */
function futureDateStr(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

describe('VehicleUnavailabilityService', () => {
  let service: VehicleUnavailabilityService;
  let prisma: { vehicleUnavailability: any; vehicle: any; load: any };
  let domainEventService: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      vehicleUnavailability: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      vehicle: { findFirst: jest.fn() },
      load: { findFirst: jest.fn() },
    };
    domainEventService = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleUnavailabilityService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: domainEventService },
      ],
    }).compile();

    service = module.get(VehicleUnavailabilityService);
  });

  describe('create', () => {
    const tenantId = 1;
    const userId = 10;
    const dto = {
      vehicleId: 5,
      type: 'MAINTENANCE' as const,
      startDate: futureDateStr(5),
      endDate: futureDateStr(10),
    };

    it('should create unavailability when no overlap exists', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.create.mockResolvedValue({
        id: 1,
        ...dto,
        tenantId,
      });

      const result = await service.create(tenantId, userId, dto);
      expect(result).toEqual({ id: 1, ...dto, tenantId });
      expect(domainEventService.emit).toHaveBeenCalledWith(
        'sally.vehicle-unavailability.created',
        tenantId,
        expect.objectContaining({ vehicleId: dto.vehicleId }),
      );
    });

    it('should reject when dates overlap with existing unavailability', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue({
        id: 99,
      });

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(ConflictException);
    });

    it('should reject when vehicle is on in-transit load', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);
      prisma.load.findFirst.mockResolvedValue({
        loadNumber: '001',
        status: 'IN_TRANSIT',
      });

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(ConflictException);
    });

    it('should reject when startDate is in the past', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      const pastDto = { ...dto, startDate: '2020-01-01' };

      await expect(service.create(tenantId, userId, pastDto)).rejects.toThrow(BadRequestException);
    });

    it('should reject when endDate is before startDate', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 5, tenantId: 1 });
      const badDto = {
        ...dto,
        startDate: futureDateStr(10),
        endDate: futureDateStr(5),
      };

      await expect(service.create(tenantId, userId, badDto)).rejects.toThrow(BadRequestException);
    });

    it('should reject when vehicle does not belong to tenant', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    const futureStart = futureDateStr(5);
    const futureEnd = futureDateStr(10);

    it('should update unavailability and emit event', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
        startDate: new Date(futureStart),
        endDate: new Date(futureEnd),
      });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);
      prisma.load.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.update.mockResolvedValue({
        id: 1,
        note: 'Updated',
      });

      const result = await service.update(1, 1, { note: 'Updated' });

      expect(result.note).toBe('Updated');
      expect(domainEventService.emit).toHaveBeenCalledWith(
        'sally.vehicle-unavailability.updated',
        1,
        expect.objectContaining({ id: 1, vehicleId: 5 }),
      );
    });

    it('should reject when record not found', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue(null);

      await expect(service.update(1, 1, { note: 'test' })).rejects.toThrow(NotFoundException);
    });

    it('should reject when record belongs to different tenant', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
        vehicleId: 5,
      });

      await expect(service.update(1, 1, { note: 'test' })).rejects.toThrow(NotFoundException);
    });

    it('should reject when endDate is before startDate', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
        startDate: new Date(futureStart),
        endDate: new Date(futureEnd),
      });

      await expect(
        service.update(1, 1, {
          startDate: futureDateStr(15),
          endDate: futureDateStr(10),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject when updated dates overlap with existing', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
        startDate: new Date(futureStart),
        endDate: new Date(futureEnd),
      });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue({
        id: 2,
        startDate: futureDateStr(14),
      });

      await expect(
        service.update(1, 1, {
          startDate: futureDateStr(13),
          endDate: futureDateStr(16),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject when updated dates conflict with in-transit load', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
        startDate: new Date(futureStart),
        endDate: new Date(futureEnd),
      });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);
      prisma.load.findFirst.mockResolvedValue({
        loadNumber: '001',
        status: 'in_transit',
      });

      await expect(
        service.update(1, 1, {
          startDate: futureDateStr(13),
          endDate: futureDateStr(16),
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject when startDate is in the past', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
        startDate: new Date(futureStart),
        endDate: new Date(futureEnd),
      });

      await expect(service.update(1, 1, { startDate: '2020-01-01' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('delete', () => {
    it('should delete and emit event', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 1,
        vehicleId: 5,
      });
      prisma.vehicleUnavailability.delete.mockResolvedValue({ id: 1 });

      await service.delete(1, 1);
      expect(prisma.vehicleUnavailability.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(domainEventService.emit).toHaveBeenCalledWith(
        'sally.vehicle-unavailability.deleted',
        1,
        expect.objectContaining({ vehicleId: 5 }),
      );
    });

    it('should reject when record does not belong to tenant', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue({
        id: 1,
        tenantId: 999,
      });

      await expect(service.delete(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should reject when record not found', async () => {
      prisma.vehicleUnavailability.findUnique.mockResolvedValue(null);

      await expect(service.delete(999, 1)).rejects.toThrow(NotFoundException);
    });
  });
});
