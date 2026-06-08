import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DriverUnavailabilityController } from '../driver-unavailability.controller';
import { DriverUnavailabilityService } from '../driver-unavailability.service';

describe('DriverUnavailabilityController', () => {
  let controller: DriverUnavailabilityController;

  const mockService = {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockUser = {
    tenantDbId: 1,
    dbId: 10,
    userId: 'user-1',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriverUnavailabilityController],
      providers: [{ provide: DriverUnavailabilityService, useValue: mockService }],
    }).compile();

    controller = module.get<DriverUnavailabilityController>(DriverUnavailabilityController);
    jest.clearAllMocks();
  });

  // ── POST / (create) ──

  describe('create', () => {
    const dto = {
      driverId: 5,
      type: 'PTO' as const,
      startDate: '2026-04-10',
      endDate: '2026-04-12',
      note: 'Family vacation',
    };

    it('passes user.tenantDbId as first arg, user.dbId as second arg, and full dto to service', async () => {
      const createdRecord = {
        id: 1,
        tenantId: 1,
        driverId: 5,
        type: 'PTO',
        startDate: new Date('2026-04-10'),
        endDate: new Date('2026-04-12'),
        note: 'Family vacation',
        createdById: 10,
      };
      mockService.create.mockResolvedValue(createdRecord);

      const result = await controller.create(mockUser, dto as any);

      expect(mockService.create).toHaveBeenCalledTimes(1);
      expect(mockService.create).toHaveBeenCalledWith(1, 10, dto);
      expect(result).toEqual(createdRecord);
      expect(result.id).toBe(1);
      expect(result.driverId).toBe(5);
      expect(result.type).toBe('PTO');
      expect(result.note).toBe('Family vacation');
      expect(result.createdById).toBe(10);
    });

    it('uses tenantDbId from user object, not dbId or userId', async () => {
      const differentUser = { tenantDbId: 99, dbId: 55, userId: 'user-other' };
      const record = { id: 2, tenantId: 99, driverId: 5, createdById: 55 };
      mockService.create.mockResolvedValue(record);

      await controller.create(differentUser, dto as any);

      const [tenantArg, userArg] = mockService.create.mock.calls[0];
      expect(tenantArg).toBe(99);
      expect(userArg).toBe(55);
    });

    it('returns the exact service result without transformation', async () => {
      const serviceResult = {
        id: 3,
        tenantId: 1,
        driverId: 5,
        type: 'SICK_LEAVE',
        startDate: new Date('2026-05-01'),
        endDate: new Date('2026-05-03'),
        note: null,
        createdById: 10,
      };
      mockService.create.mockResolvedValue(serviceResult);

      const result = await controller.create(mockUser, {
        driverId: 5,
        type: 'SICK_LEAVE',
        startDate: '2026-05-01',
        endDate: '2026-05-03',
      } as any);

      expect(result).toBe(serviceResult);
      expect(result.type).toBe('SICK_LEAVE');
      expect(result.note).toBeNull();
    });

    it('propagates ConflictException from service', async () => {
      const error = new Error('Driver already has unavailability for overlapping dates');
      mockService.create.mockRejectedValue(error);

      await expect(controller.create(mockUser, dto as any)).rejects.toThrow(
        'Driver already has unavailability for overlapping dates',
      );
    });

    it('propagates NotFoundException when driver not found', async () => {
      mockService.create.mockRejectedValue(new NotFoundException('Driver not found'));

      await expect(controller.create(mockUser, dto as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /:id (update) ──

  describe('update', () => {
    it('passes id as first arg, user.tenantDbId as second arg, and dto as third', async () => {
      const dto = {
        type: 'SICK_LEAVE' as const,
        note: 'Updated to sick leave',
      };
      const updatedRecord = {
        id: 1,
        tenantId: 1,
        driverId: 5,
        type: 'SICK_LEAVE',
        startDate: new Date('2026-04-10'),
        endDate: new Date('2026-04-12'),
        note: 'Updated to sick leave',
      };
      mockService.update.mockResolvedValue(updatedRecord);

      const result = await controller.update(mockUser, 1, dto as any);

      expect(mockService.update).toHaveBeenCalledTimes(1);
      expect(mockService.update).toHaveBeenCalledWith(1, 1, dto);
      expect(result).toEqual(updatedRecord);
      expect(result.type).toBe('SICK_LEAVE');
      expect(result.note).toBe('Updated to sick leave');
    });

    it('passes the parsed integer id, not a string', async () => {
      mockService.update.mockResolvedValue({ id: 42 });

      await controller.update(mockUser, 42, { note: 'test' } as any);

      const [idArg] = mockService.update.mock.calls[0];
      expect(idArg).toBe(42);
      expect(typeof idArg).toBe('number');
    });

    it('uses tenantDbId for tenant scoping on update', async () => {
      const otherUser = { tenantDbId: 77, dbId: 33, userId: 'user-77' };
      mockService.update.mockResolvedValue({ id: 5 });

      await controller.update(otherUser, 5, { note: 'x' } as any);

      expect(mockService.update).toHaveBeenCalledWith(5, 77, { note: 'x' });
    });

    it('propagates NotFoundException when record not found or wrong tenant', async () => {
      mockService.update.mockRejectedValue(new NotFoundException('Unavailability record not found'));

      await expect(controller.update(mockUser, 999, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('propagates service errors on update', async () => {
      mockService.update.mockRejectedValue(new Error('Overlapping unavailability exists'));

      await expect(controller.update(mockUser, 1, { startDate: '2026-04-10' } as any)).rejects.toThrow(
        'Overlapping unavailability exists',
      );
    });
  });

  // ── DELETE /:id ──

  describe('delete', () => {
    it('passes id and user.tenantDbId to service and returns success message', async () => {
      mockService.delete.mockResolvedValue(undefined);

      const result = await controller.delete(mockUser, 1);

      expect(mockService.delete).toHaveBeenCalledTimes(1);
      expect(mockService.delete).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ message: 'Unavailability deleted' });
      expect(result.message).toBe('Unavailability deleted');
    });

    it('always returns the fixed success message regardless of service return', async () => {
      mockService.delete.mockResolvedValue({ some: 'data' });

      const result = await controller.delete(mockUser, 5);

      // Controller does `await service.delete(...)` then returns its own message
      expect(result).toEqual({ message: 'Unavailability deleted' });
    });

    it('uses tenantDbId for tenant scoping on delete', async () => {
      const otherUser = { tenantDbId: 88, dbId: 44, userId: 'user-88' };
      mockService.delete.mockResolvedValue(undefined);

      await controller.delete(otherUser, 12);

      expect(mockService.delete).toHaveBeenCalledWith(12, 88);
    });

    it('propagates NotFoundException when record not found or wrong tenant', async () => {
      mockService.delete.mockRejectedValue(new NotFoundException('Unavailability record not found'));

      await expect(controller.delete(mockUser, 999)).rejects.toThrow(NotFoundException);
    });

    it('propagates unexpected errors from service', async () => {
      mockService.delete.mockRejectedValue(new Error('Database error'));

      await expect(controller.delete(mockUser, 1)).rejects.toThrow('Database error');
    });
  });
});
