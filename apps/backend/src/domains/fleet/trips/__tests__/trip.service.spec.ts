import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { TripService } from '../trip.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

describe('TripService', () => {
  let service: TripService;
  let prisma: any;
  let counterService: any;
  let eventEmitter: any;
  let cache: any;

  const mockLoad = (overrides: any = {}) => ({
    id: 1,
    loadNumber: 'LD-20260409-001',
    status: 'PENDING',
    tripId: null,
    tripOrder: null,
    isRelay: false,
    pickupDate: new Date('2026-04-10'),
    deliveryDate: new Date('2026-04-12'),
    tenantId: 1,
    rateCents: 150000,
    estimatedMiles: 500,
    customerName: 'ACME Corp',
    originCity: 'Chicago',
    originState: 'IL',
    destinationCity: 'Dallas',
    destinationState: 'TX',
    driverId: null,
    vehicleId: null,
    ...overrides,
  });

  const mockTrip = (overrides: any = {}) => ({
    id: 1,
    tripId: 'TRIP-20260409-001',
    tenantId: 1,
    driverId: null,
    vehicleId: null,
    status: 'DRAFT',
    loadCount: 2,
    totalMiles: 1000,
    totalRevenueCents: 300000,
    createdAt: new Date('2026-04-09T10:00:00Z'),
    createdBy: 1,
    updatedAt: new Date('2026-04-09T10:00:00Z'),
    assignedAt: null,
    startedAt: null,
    completedAt: null,
    cancelledAt: null,
    loads: [
      mockLoad({ id: 1, loadNumber: 'LD-20260409-001', tripOrder: 1 }),
      mockLoad({
        id: 2,
        loadNumber: 'LD-20260409-002',
        tripOrder: 2,
      }),
    ],
    driver: null,
    vehicle: null,
    routePlans: [],
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      load: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      trip: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn(),
      },
      driver: {
        findFirst: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
      },
      routePlan: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((fn: any) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return Promise.all(fn);
      }),
    };

    counterService = {
      nextValue: jest.fn().mockResolvedValue(1),
    };

    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    cache = {
      getOrSet: jest.fn(),
      del: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterService, useValue: counterService },
        { provide: DomainEventService, useValue: eventEmitter },
        { provide: SallyCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<TripService>(TripService);
  });

  describe('create', () => {
    it('should create a trip with 2 loads', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({
        id: 2,
        loadNumber: 'LD-002',
      });

      prisma.load.findMany
        .mockResolvedValueOnce([load1, load2]) // validate loads
        .mockResolvedValueOnce([
          { id: 1, rateCents: 150000, estimatedMiles: 500 },
          { id: 2, rateCents: 200000, estimatedMiles: 600 },
        ]); // rate/miles calc

      const created = mockTrip();
      prisma.trip.create.mockResolvedValue(created);
      prisma.load.update.mockResolvedValue({});

      // findOne mock
      prisma.trip.findFirst.mockResolvedValue(mockTrip());

      const result = await service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'] }, 1);

      expect(result).toBeDefined();
      expect(result.tripId).toBe('TRIP-20260409-001');
      expect(counterService.nextValue).toHaveBeenCalledWith(1, expect.stringContaining('trip:'));
      expect(prisma.trip.create).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_CREATED,
        expect.anything(), // tenantId
        expect.objectContaining({
          entityType: 'trip',
        }),
      );
    });

    it('should reject if fewer than 2 loads provided', async () => {
      await expect(service.create(1, { loadIds: ['LOAD-001'] }, 1)).rejects.toThrow();
    });

    it('should reject if a load is not found', async () => {
      prisma.load.findMany.mockResolvedValue([mockLoad({ id: 1, loadNumber: 'LOAD-001' })]);

      await expect(service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'] }, 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject if a load is already in a trip', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({
        id: 2,
        loadNumber: 'LOAD-002',
        tripId: 99, // already in trip
      });

      prisma.load.findMany.mockResolvedValue([load1, load2]);

      await expect(service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'] }, 1)).rejects.toThrow('already in a trip');
    });

    it('should reject relay loads', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({
        id: 2,
        loadNumber: 'LOAD-002',
        isRelay: true,
      });

      prisma.load.findMany.mockResolvedValue([load1, load2]);

      await expect(service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'] }, 1)).rejects.toThrow('relay load');
    });

    it('should reject loads with non-eligible status', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({
        id: 2,
        loadNumber: 'LOAD-002',
        status: 'DELIVERED',
      });

      prisma.load.findMany.mockResolvedValue([load1, load2]);

      await expect(service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'] }, 1)).rejects.toThrow(
        'Only draft or pending',
      );
    });

    it('should reject if driverId provided without vehicleId', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({ id: 2, loadNumber: 'LOAD-002' });

      prisma.load.findMany.mockResolvedValueOnce([load1, load2]).mockResolvedValueOnce([
        { id: 1, rateCents: 150000, estimatedMiles: 500 },
        { id: 2, rateCents: 200000, estimatedMiles: 600 },
      ]);

      await expect(service.create(1, { loadIds: ['LOAD-001', 'LOAD-002'], driverId: 'DRV-001' }, 1)).rejects.toThrow(
        'Both driverId and vehicleId',
      );
    });
  });

  describe('findOne', () => {
    it('should return trip detail with loads', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip());

      const result = await service.findOne(1, 'TRIP-20260409-001');

      expect(result.tripId).toBe('TRIP-20260409-001');
      expect(result.loads).toHaveLength(2);
      expect(result.loads[0].tripOrder).toBe(1);
    });

    it('should throw NotFoundException if trip not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.findOne(1, 'TRIP-NONEXISTENT')).rejects.toThrow(NotFoundException);
    });
  });

  describe('assign', () => {
    it('should assign driver and vehicle to trip and sync to loads', async () => {
      const trip = mockTrip({
        loads: [mockLoad({ id: 1, status: 'PENDING' }), mockLoad({ id: 2, status: 'PENDING' })],
      });
      prisma.trip.findFirst
        .mockResolvedValueOnce(trip) // assign lookup
        .mockResolvedValueOnce(mockTrip({ status: 'ASSIGNED' })); // findOne after
      prisma.driver.findFirst.mockResolvedValue({
        id: 10,
        driverId: 'DRV-001',
        name: 'Mike Smith',
        status: 'ACTIVE',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 20,
        vehicleId: 'VH-001',
        unitNumber: 'T-101',
        status: 'AVAILABLE',
      });
      prisma.trip.update.mockResolvedValue({});
      prisma.load.update.mockResolvedValue({});
      prisma.routePlan.findFirst.mockResolvedValue(null);

      await service.assign(1, 'TRIP-20260409-001', { driverId: 'DRV-001', vehicleId: 'VH-001' }, 1);

      expect(prisma.trip.update).toHaveBeenCalled();
      expect(prisma.load.update).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_ASSIGNED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should reject assigning to IN_PROGRESS trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'IN_PROGRESS' }));

      await expect(service.assign(1, 'TRIP-001', { driverId: 'DRV-001', vehicleId: 'VH-001' }, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject inactive driver', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip());
      prisma.driver.findFirst.mockResolvedValue({
        id: 10,
        driverId: 'DRV-001',
        name: 'Mike',
        status: 'INACTIVE',
      });

      await expect(
        service.assign(1, 'TRIP-20260409-001', { driverId: 'DRV-001', vehicleId: 'VH-001' }, 1),
      ).rejects.toThrow('not active');
    });
  });

  describe('addLoad', () => {
    it('should add a load to an existing trip', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(mockTrip({ loads: [{ id: 1 }, { id: 2 }] }))
        .mockResolvedValueOnce(mockTrip({ loadCount: 3 }));
      prisma.load.findFirst.mockResolvedValue(mockLoad({ id: 3, loadNumber: 'LOAD-003', status: 'PENDING' }));
      prisma.load.update.mockResolvedValue({});
      prisma.load.findMany.mockResolvedValue([
        { rateCents: 100000, estimatedMiles: 300 },
        { rateCents: 100000, estimatedMiles: 300 },
        { rateCents: 100000, estimatedMiles: 300 },
      ]);
      prisma.trip.update.mockResolvedValue({});
      prisma.routePlan.findFirst.mockResolvedValue(null);

      await service.addLoad(1, 'TRIP-20260409-001', 'LOAD-003', 1);

      expect(prisma.load.update).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_LOAD_ADDED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should reject adding to a COMPLETED trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'COMPLETED' }));

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-003', 1)).rejects.toThrow('COMPLETED');
    });

    it('should reject if trip already has 10 loads', async () => {
      prisma.trip.findFirst.mockResolvedValue(
        mockTrip({
          loads: Array.from({ length: 10 }, (_, i) => ({ id: i + 1 })),
        }),
      );

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-011', 1)).rejects.toThrow('maximum of 10');
    });

    it('should reject a load already in another trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ loads: [{ id: 1 }, { id: 2 }] }));
      prisma.load.findFirst.mockResolvedValue(mockLoad({ id: 3, loadNumber: 'LOAD-003', tripId: 99 }));

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-003', 1)).rejects.toThrow('already in a trip');
    });
  });

  describe('removeLoad', () => {
    it('should remove a load from trip', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(
          mockTrip({
            loads: [
              { id: 1, loadNumber: 'LOAD-001' },
              { id: 2, loadNumber: 'LOAD-002' },
              { id: 3, loadNumber: 'LOAD-003' },
            ],
          }),
        )
        .mockResolvedValueOnce(mockTrip({ loadCount: 2 }));
      prisma.load.findFirst.mockResolvedValue(
        mockLoad({ id: 3, loadNumber: 'LOAD-003', tripId: 1, status: 'PENDING' }),
      );
      prisma.load.update.mockResolvedValue({});
      prisma.load.findMany.mockResolvedValue([]);
      prisma.trip.update.mockResolvedValue({});
      prisma.routePlan.findFirst.mockResolvedValue(null);

      await service.removeLoad(1, 'TRIP-20260409-001', 'LOAD-003', 1);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_LOAD_REMOVED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should reject removing if only 2 loads remain', async () => {
      prisma.trip.findFirst.mockResolvedValue(
        mockTrip({
          loads: [
            { id: 1, loadNumber: 'LOAD-001' },
            { id: 2, loadNumber: 'LOAD-002' },
          ],
        }),
      );
      prisma.load.findFirst.mockResolvedValue(mockLoad({ id: 1, loadNumber: 'LOAD-001', tripId: 1 }));

      await expect(service.removeLoad(1, 'TRIP-001', 'LOAD-001', 1)).rejects.toThrow('at least 2 loads');
    });
  });

  describe('cancel', () => {
    it('should cancel a DRAFT trip and release loads', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(
          mockTrip({
            status: 'DRAFT',
            loads: [
              { id: 1, status: 'PENDING' },
              { id: 2, status: 'PENDING' },
            ],
          }),
        )
        .mockResolvedValueOnce(mockTrip({ status: 'CANCELLED' }));
      prisma.trip.update.mockResolvedValue({});
      prisma.load.update.mockResolvedValue({});

      await service.cancel(1, 'TRIP-20260409-001', 1);

      expect(prisma.trip.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_CANCELLED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should reject cancelling a COMPLETED trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'COMPLETED' }));

      await expect(service.cancel(1, 'TRIP-001', 1)).rejects.toThrow(BadRequestException);
    });

    it('should reject cancelling an IN_PROGRESS trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'IN_PROGRESS' }));

      await expect(service.cancel(1, 'TRIP-001', 1)).rejects.toThrow('Cancel individual loads');
    });
  });

  describe('syncTripStatusFromLoads', () => {
    it('should transition to IN_PROGRESS when a load goes in_transit', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        mockTrip({
          status: 'ASSIGNED',
          loads: [{ status: 'IN_TRANSIT' }, { status: 'ASSIGNED' }],
        }),
      );

      await service.syncTripStatusFromLoads(1);

      expect(prisma.trip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ASSIGNED' }),
          data: expect.objectContaining({ status: 'IN_PROGRESS' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_STARTED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should transition to COMPLETED when all loads delivered', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        mockTrip({
          status: 'IN_PROGRESS',
          loads: [{ status: 'DELIVERED' }, { status: 'DELIVERED' }],
        }),
      );

      await service.syncTripStatusFromLoads(1);

      expect(prisma.trip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'IN_PROGRESS' }),
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.TRIP_COMPLETED,
        expect.anything(), // tenantId
        expect.objectContaining({ entityType: 'trip' }),
      );
    });

    it('should cancel trip when all loads cancelled', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        mockTrip({
          status: 'ASSIGNED',
          loads: [{ status: 'CANCELLED' }, { status: 'CANCELLED' }],
        }),
      );

      await service.syncTripStatusFromLoads(1);

      expect(prisma.trip.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('should not change status if trip is already COMPLETED', async () => {
      prisma.trip.findUnique.mockResolvedValue(mockTrip({ status: 'COMPLETED' }));

      await service.syncTripStatusFromLoads(1);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });

    it('should not transition if no relevant status change detected', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        mockTrip({
          status: 'ASSIGNED',
          loads: [{ status: 'ASSIGNED' }, { status: 'ASSIGNED' }],
        }),
      );

      await service.syncTripStatusFromLoads(1);

      expect(prisma.trip.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated trip list', async () => {
      prisma.trip.findMany.mockResolvedValue([
        mockTrip({
          driver: { name: 'Mike', driverId: 'DRV-001' },
          vehicle: { unitNumber: 'T-101', vehicleId: 'VH-001' },
        }),
      ]);
      prisma.trip.count.mockResolvedValue(1);

      const result = await service.findAll(1, {});

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.data[0].driverName).toBe('Mike');
    });

    it('should filter by status', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, { status: 'DRAFT' });

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'DRAFT' }),
        }),
      );
    });

    it('should resolve driver filter by string ID', async () => {
      prisma.driver.findFirst.mockResolvedValue({ id: 10 });
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, { driverId: 'DRV-001' });

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: 10 }),
        }),
      );
    });

    it('should return empty if driver not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      const result = await service.findAll(1, { driverId: 'DRV-UNKNOWN' });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('update (reorder loads)', () => {
    it('should reorder loads within trip', async () => {
      prisma.trip.findFirst
        .mockResolvedValueOnce(
          mockTrip({
            loads: [
              { id: 1, loadNumber: 'LOAD-001' },
              { id: 2, loadNumber: 'LOAD-002' },
            ],
          }),
        )
        .mockResolvedValueOnce(mockTrip());
      prisma.load.update.mockResolvedValue({});
      prisma.routePlan.findFirst.mockResolvedValue(null);

      await service.update(1, 'TRIP-20260409-001', {
        loadOrder: [
          { loadId: 'LOAD-002', tripOrder: 1 },
          { loadId: 'LOAD-001', tripOrder: 2 },
        ],
      });

      expect(prisma.load.update).toHaveBeenCalledTimes(2);
    });

    it('should reject reorder of COMPLETED trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'COMPLETED' }));

      await expect(
        service.update(1, 'TRIP-001', {
          loadOrder: [{ loadId: 'LOAD-001', tripOrder: 1 }],
        }),
      ).rejects.toThrow('COMPLETED');
    });

    it('should reject if load not in trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(
        mockTrip({
          loads: [
            { id: 1, loadNumber: 'LOAD-001' },
            { id: 2, loadNumber: 'LOAD-002' },
          ],
        }),
      );

      await expect(
        service.update(1, 'TRIP-20260409-001', {
          loadOrder: [{ loadId: 'LOAD-999', tripOrder: 1 }],
        }),
      ).rejects.toThrow('not in this trip');
    });

    it('should throw NotFoundException if trip not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.update(1, 'TRIP-NONE', { loadOrder: [] })).rejects.toThrow(NotFoundException);
    });

    it('should return trip without changes when no loadOrder provided', async () => {
      prisma.trip.findFirst.mockResolvedValueOnce(mockTrip()).mockResolvedValueOnce(mockTrip());

      const result = await service.update(1, 'TRIP-20260409-001', {});

      // Should not call load.update since no loadOrder was provided
      expect(prisma.load.update).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findAll advanced filters', () => {
    it('should resolve vehicle filter by string ID', async () => {
      prisma.vehicle.findFirst.mockResolvedValue({ id: 20 });
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, { vehicleId: 'VH-001' });

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ vehicleId: 20 }),
        }),
      );
    });

    it('should return empty if vehicle not found', async () => {
      prisma.vehicle.findFirst.mockResolvedValue(null);

      const result = await service.findAll(1, { vehicleId: 'VH-UNKNOWN' });

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should apply date range filter', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, {
        dateFrom: '2026-04-01',
        dateTo: '2026-04-30',
      });

      const callArgs = prisma.trip.findMany.mock.calls[0][0];
      expect(callArgs.where.createdAt).toBeDefined();
      expect(callArgs.where.createdAt.gte).toEqual(new Date('2026-04-01'));
      expect(callArgs.where.createdAt.lt).toBeDefined();
    });

    it('should apply search filter across tripId and driver name', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, { search: 'Mike' });

      const callArgs = prisma.trip.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR).toHaveLength(2);
    });

    it('should apply sort field mapping', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, {
        sortBy: 'totalRevenueCents',
        sortOrder: 'asc',
      });

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { totalRevenueCents: 'asc' },
        }),
      );
    });

    it('should default to createdAt desc sort', async () => {
      prisma.trip.findMany.mockResolvedValue([]);
      prisma.trip.count.mockResolvedValue(0);

      await service.findAll(1, {});

      expect(prisma.trip.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('create with driver and vehicle', () => {
    it('should create an assigned trip when driverId and vehicleId provided', async () => {
      const load1 = mockLoad({ id: 1, loadNumber: 'LOAD-001' });
      const load2 = mockLoad({ id: 2, loadNumber: 'LOAD-002' });

      prisma.load.findMany.mockResolvedValue([load1, load2]);
      prisma.driver.findFirst.mockResolvedValue({
        id: 10,
        driverId: 'DRV-001',
        name: 'Mike',
        status: 'ACTIVE',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 20,
        vehicleId: 'VH-001',
        unitNumber: 'T-101',
        status: 'AVAILABLE',
      });
      prisma.trip.create.mockResolvedValue(mockTrip({ status: 'ASSIGNED', driverId: 10, vehicleId: 20 }));
      prisma.load.update.mockResolvedValue({});
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'ASSIGNED' }));

      await service.create(
        1,
        {
          loadIds: ['LOAD-001', 'LOAD-002'],
          driverId: 'DRV-001',
          vehicleId: 'VH-001',
        },
        1,
      );

      expect(prisma.trip.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ASSIGNED',
            driverId: 10,
            vehicleId: 20,
          }),
        }),
      );
    });
  });

  describe('removeLoad edge cases', () => {
    it('should throw NotFoundException if trip not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.removeLoad(1, 'TRIP-NONE', 'LOAD-001', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw if trip is completed', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ status: 'COMPLETED' }));

      await expect(service.removeLoad(1, 'TRIP-001', 'LOAD-001', 1)).rejects.toThrow('COMPLETED');
    });

    it('should throw if load is not in trip', async () => {
      prisma.trip.findFirst.mockResolvedValue(
        mockTrip({
          loads: [
            { id: 1, loadNumber: 'LOAD-001' },
            { id: 2, loadNumber: 'LOAD-002' },
            { id: 3, loadNumber: 'LOAD-003' },
          ],
        }),
      );
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.removeLoad(1, 'TRIP-001', 'LOAD-999', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('syncTripStatusFromLoads edge cases', () => {
    it('should not transition when trip is null', async () => {
      prisma.trip.findUnique.mockResolvedValue(null);

      await service.syncTripStatusFromLoads(999);

      expect(prisma.trip.updateMany).not.toHaveBeenCalled();
    });

    it('should handle updateMany returning count 0 (optimistic concurrency miss)', async () => {
      prisma.trip.findUnique.mockResolvedValue(
        mockTrip({
          status: 'ASSIGNED',
          loads: [{ status: 'IN_TRANSIT' }, { status: 'ASSIGNED' }],
        }),
      );
      prisma.trip.updateMany.mockResolvedValue({ count: 0 });

      await service.syncTripStatusFromLoads(1);

      // Event should NOT be emitted when count is 0
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(SALLY_EVENTS.TRIP_STARTED, expect.anything());
    });
  });

  describe('addLoad edge cases', () => {
    it('should throw if load not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ loads: [{ id: 1 }] }));
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-UNKNOWN', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw if load status is not eligible', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ loads: [{ id: 1 }] }));
      prisma.load.findFirst.mockResolvedValue(mockLoad({ id: 3, loadNumber: 'LOAD-003', status: 'DELIVERED' }));

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-003', 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw if load is a relay', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip({ loads: [{ id: 1 }] }));
      prisma.load.findFirst.mockResolvedValue(
        mockLoad({
          id: 3,
          loadNumber: 'LOAD-003',
          isRelay: true,
          status: 'PENDING',
        }),
      );

      await expect(service.addLoad(1, 'TRIP-001', 'LOAD-003', 1)).rejects.toThrow('relay');
    });
  });

  describe('cancel edge cases', () => {
    it('should throw NotFoundException if trip not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.cancel(1, 'TRIP-NONE', 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('assign edge cases', () => {
    it('should throw NotFoundException if trip not found', async () => {
      prisma.trip.findFirst.mockResolvedValue(null);

      await expect(service.assign(1, 'TRIP-NONE', { driverId: 'DRV-1', vehicleId: 'VH-1' }, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject unavailable vehicle', async () => {
      prisma.trip.findFirst.mockResolvedValue(mockTrip());
      prisma.driver.findFirst.mockResolvedValue({
        id: 10,
        driverId: 'DRV-001',
        name: 'Mike',
        status: 'ACTIVE',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 20,
        vehicleId: 'VH-001',
        unitNumber: 'T-101',
        status: 'OUT_OF_SERVICE',
      });

      await expect(
        service.assign(1, 'TRIP-20260409-001', { driverId: 'DRV-001', vehicleId: 'VH-001' }, 1),
      ).rejects.toThrow('not available');
    });
  });
});
