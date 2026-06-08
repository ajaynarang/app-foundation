import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { TripController } from '../trip.controller';
import { TripService } from '../trip.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('TripController', () => {
  let controller: TripController;

  const mockTenant = { id: 7, tenantId: 'tenant-abc' };

  const mockUser = {
    userId: 'user-42',
    tenantId: 'tenant-abc',
    dbId: 42,
    role: 'DISPATCHER',
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
  };

  const mockTripService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    assign: jest.fn(),
    addLoad: jest.fn(),
    removeLoad: jest.fn(),
    cancel: jest.fn(),
  };

  beforeEach(async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TripController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TripService, useValue: mockTripService },
      ],
    }).compile();

    controller = module.get<TripController>(TripController);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Tenant resolution ──

  describe('tenant resolution', () => {
    it('resolves tenantDbId from user.tenantId via Prisma', async () => {
      mockTripService.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.list(mockUser, {} as any);

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-abc' },
      });
    });

    it('throws NotFoundException when tenant is not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(controller.list(mockUser, {} as any)).rejects.toThrow(NotFoundException);
    });

    it('uses tenant.id (not user.dbId) as first argument to service', async () => {
      mockTripService.findAll.mockResolvedValue({ data: [], total: 0 });

      await controller.list(mockUser, {} as any);

      expect(mockTripService.findAll).toHaveBeenCalledWith(
        7, // tenant.id, not user.dbId (42)
        expect.anything(),
      );
    });
  });

  // ── POST / (create) ──

  describe('create', () => {
    const dto = { loadIds: ['LD-1', 'LD-2'], name: 'East Coast Run' } as any;

    it('passes tenantDbId, dto, and user.dbId to service', async () => {
      const trip = {
        id: 'cnv-1',
        tripId: 'TRIP-001',
        status: 'draft',
        name: 'East Coast Run',
        loadCount: 2,
      };
      mockTripService.create.mockResolvedValue(trip);

      const result = await controller.create(mockUser, dto);

      expect(mockTripService.create).toHaveBeenCalledWith(7, dto, 42);
      expect(result).toEqual(trip);
      expect(result.tripId).toBe('TRIP-001');
      expect(result.status).toBe('draft');
      expect(result.loadCount).toBe(2);
    });

    it('propagates service errors', async () => {
      mockTripService.create.mockRejectedValue(new Error('Load LD-1 already in a trip'));

      await expect(controller.create(mockUser, dto)).rejects.toThrow('Load LD-1 already in a trip');
    });
  });

  // ── GET / (list) ──

  describe('list', () => {
    it('passes tenantDbId and full query DTO to service', async () => {
      const query = { status: 'draft', limit: 10, offset: 0 } as any;
      const response = {
        data: [
          { tripId: 'TRIP-001', status: 'draft', loadCount: 2 },
          { tripId: 'TRIP-002', status: 'draft', loadCount: 1 },
        ],
        total: 2,
      };
      mockTripService.findAll.mockResolvedValue(response);

      const result = await controller.list(mockUser, query);

      expect(mockTripService.findAll).toHaveBeenCalledWith(7, query);
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.data[0].tripId).toBe('TRIP-001');
    });

    it('returns empty list when no trips exist', async () => {
      mockTripService.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await controller.list(mockUser, {} as any);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ── GET /:trip_id (getOne) ──

  describe('getOne', () => {
    it('passes tenantDbId and tripId to service', async () => {
      const trip = {
        tripId: 'TRIP-001',
        status: 'assigned',
        driverId: 5,
        driverName: 'John Doe',
        loads: [
          { loadNumber: 'LD-1', tripOrder: 1 },
          { loadNumber: 'LD-2', tripOrder: 2 },
        ],
      };
      mockTripService.findOne.mockResolvedValue(trip);

      const result = await controller.getOne('TRIP-001', mockUser);

      expect(mockTripService.findOne).toHaveBeenCalledWith(7, 'TRIP-001');
      expect(result.tripId).toBe('TRIP-001');
      expect(result.loads).toHaveLength(2);
      expect(result.loads[0].loadNumber).toBe('LD-1');
      expect(result.driverName).toBe('John Doe');
    });

    it('propagates NotFoundException from service', async () => {
      mockTripService.findOne.mockRejectedValue(new NotFoundException('Trip not found'));

      await expect(controller.getOne('TRIP-NONEXISTENT', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── PATCH /:trip_id (update) ──

  describe('update', () => {
    it('passes tenantDbId, tripId, and dto to service', async () => {
      const dto = { loadOrder: [2, 1] } as any;
      const updated = {
        tripId: 'TRIP-001',
        loads: [
          { loadNumber: 'LD-2', order: 1 },
          { loadNumber: 'LD-1', order: 2 },
        ],
      };
      mockTripService.update.mockResolvedValue(updated);

      const result = await controller.update('TRIP-001', mockUser, dto);

      expect(mockTripService.update).toHaveBeenCalledWith(7, 'TRIP-001', dto);
      expect(result.tripId).toBe('TRIP-001');
      expect(result.loads[0].loadNumber).toBe('LD-2');
    });

    it('propagates NotFoundException when trip does not exist', async () => {
      mockTripService.update.mockRejectedValue(new NotFoundException('Trip not found'));

      await expect(controller.update('TRIP-GONE', mockUser, {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:trip_id/assign ──

  describe('assign', () => {
    it('passes tenantDbId, tripId, dto, and user.dbId to service', async () => {
      const dto = { driverId: 'DRV-1', vehicleId: 'VEH-1' } as any;
      const assigned = {
        tripId: 'TRIP-001',
        status: 'assigned',
        driverId: 5,
        vehicleId: 3,
      };
      mockTripService.assign.mockResolvedValue(assigned);

      const result = await controller.assign('TRIP-001', mockUser, dto);

      expect(mockTripService.assign).toHaveBeenCalledWith(7, 'TRIP-001', dto, 42);
      expect(result.status).toBe('assigned');
      expect(result.driverId).toBe(5);
      expect(result.vehicleId).toBe(3);
    });

    it('propagates errors when assignment fails', async () => {
      mockTripService.assign.mockRejectedValue(new Error('Driver already assigned to another trip'));

      await expect(controller.assign('TRIP-001', mockUser, {} as any)).rejects.toThrow(
        'Driver already assigned to another trip',
      );
    });
  });

  // ── POST /:trip_id/loads ──

  describe('addLoad', () => {
    it('extracts loadId from dto and passes it along with tenantDbId, tripId, user.dbId', async () => {
      const dto = { loadId: 'LD-3' } as any;
      const updated = { tripId: 'TRIP-001', loadCount: 3 };
      mockTripService.addLoad.mockResolvedValue(updated);

      const result = await controller.addLoad('TRIP-001', mockUser, dto);

      expect(mockTripService.addLoad).toHaveBeenCalledWith(
        7,
        'TRIP-001',
        'LD-3', // extracted from dto.loadId
        42,
      );
      expect(result.loadCount).toBe(3);
    });

    it('propagates NotFoundException for non-existent trip', async () => {
      mockTripService.addLoad.mockRejectedValue(new NotFoundException('Trip not found'));

      await expect(controller.addLoad('TRIP-GONE', mockUser, { loadId: 'LD-1' } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── DELETE /:trip_id/loads/:load_id ──

  describe('removeLoad', () => {
    it('passes tenantDbId, tripId, loadId, and user.dbId to service', async () => {
      const removed = { tripId: 'TRIP-001', loadCount: 1 };
      mockTripService.removeLoad.mockResolvedValue(removed);

      const result = await controller.removeLoad('TRIP-001', 'LD-2', mockUser);

      expect(mockTripService.removeLoad).toHaveBeenCalledWith(7, 'TRIP-001', 'LD-2', 42);
      expect(result.loadCount).toBe(1);
    });

    it('propagates errors when load is not in trip', async () => {
      mockTripService.removeLoad.mockRejectedValue(new NotFoundException('Load not found in trip'));

      await expect(controller.removeLoad('TRIP-001', 'LD-MISSING', mockUser)).rejects.toThrow(NotFoundException);
    });
  });

  // ── POST /:trip_id/cancel ──

  describe('cancel', () => {
    it('passes tenantDbId, tripId, and user.dbId to service', async () => {
      const cancelled = { tripId: 'TRIP-001', status: 'cancelled' };
      mockTripService.cancel.mockResolvedValue(cancelled);

      const result = await controller.cancel('TRIP-001', mockUser);

      expect(mockTripService.cancel).toHaveBeenCalledWith(7, 'TRIP-001', 42);
      expect(result.status).toBe('cancelled');
    });

    it('propagates errors when trip cannot be cancelled', async () => {
      mockTripService.cancel.mockRejectedValue(new Error('Trip already in transit'));

      await expect(controller.cancel('TRIP-001', mockUser)).rejects.toThrow('Trip already in transit');
    });
  });

  // ── Cross-cutting: different users produce different tenant lookups ──

  describe('tenant isolation', () => {
    it('uses the correct tenantId from the user object', async () => {
      const otherTenant = { id: 99, tenantId: 'tenant-other' };
      mockPrisma.tenant.findUnique.mockResolvedValue(otherTenant);
      mockTripService.findAll.mockResolvedValue({ data: [], total: 0 });

      const otherUser = { ...mockUser, tenantId: 'tenant-other', dbId: 55 };
      await controller.list(otherUser, {} as any);

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith({
        where: { tenantId: 'tenant-other' },
      });
      expect(mockTripService.findAll).toHaveBeenCalledWith(99, expect.anything());
    });
  });
});
