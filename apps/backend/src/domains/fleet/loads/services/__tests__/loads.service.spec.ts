import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { LoadsService } from '../loads.service';
import { LoadEventsService } from '../load-events.service';
import { LoadChargesService } from '../load-charges.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../../infrastructure/database/counter.service';
import { GeocodingService } from '../../../../platform-services/geocoding/geocoding.service';
import { StopsService } from '../../../stops/stops.service';
import { StopMatchService } from '../../../stops/stop-match.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { LoadLegService } from '../load-leg.service';
import { LoadTrackingService } from '../load-tracking.service';
import { LoadShareLinkService } from '../load-share-link.service';
import { CustomerLoadService } from '../customer-load.service';
import { LoadQueryService } from '../load-query.service';
import { StopGeocodingService } from '../stop-geocoding.service';
import { LoadCreationService } from '../load-creation.service';
import { LoadDraftService } from '../load-draft.service';
import { LoadStatusService } from '../load-status.service';
import { LoadAssignmentService } from '../load-assignment.service';
import { StopStatusService } from '../stop-status.service';
import { CustomFieldValidatorService } from '../../../custom-fields/custom-field-validator.service';
import { LoadMileageService } from '../../../../routing/load-mileage/load-mileage.service';

describe('LoadsService', () => {
  let service: LoadsService;
  let prisma: any;
  let counterService: any;
  let eventEmitter: any;
  let loadEventsService: any;
  let loadChargesService: any;
  let geocodingService: any;
  let stopsService: any;
  let loadLegService: any;
  let loadMileageService: { enqueueRecalc: jest.Mock };

  const baseMockLoad = {
    id: 1,
    loadNumber: 'LD-20260223-001',
    status: 'PENDING',
    weightLbs: 40000,
    commodityType: 'dry_goods',
    specialRequirements: null,
    customerName: 'ACME Corp',
    equipmentType: 'dry_van',
    referenceNumber: 'REF-123',
    rateCents: 320000,
    pieces: 10,
    intakeSource: 'manual',
    intakeMetadata: null,
    customerId: null,
    driverId: null,
    vehicleId: null,
    isActive: true,
    pickupDate: new Date('2026-02-25'),
    deliveryDate: new Date('2026-02-27'),
    originCity: 'Chicago',
    originState: 'IL',
    destinationCity: 'Dallas',
    destinationState: 'TX',
    estimatedMiles: null,
    actualMiles: null,
    routePlanLoads: [],
    assignedAt: null,
    inTransitAt: null,
    deliveredAt: null,
    cancelledAt: null,
    onHoldAt: null,
    onHoldReason: null,
    tonuAt: null,
    tonuReason: null,
    minTempF: null,
    maxTempF: null,
    hazmatClass: null,
    unNumber: null,
    placardRequired: null,
    recurringLaneId: null,
    externalLoadId: null,
    externalSource: null,
    lastSyncedAt: null,
    createdAt: new Date('2026-02-23T10:00:00Z'),
    updatedAt: new Date('2026-02-23T10:00:00Z'),
    stops: [],
  };

  beforeEach(async () => {
    prisma = {
      load: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      stop: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      loadStop: {
        create: jest.fn(),
        createMany: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      loadEvent: {
        deleteMany: jest.fn(),
      },
      loadNote: {
        deleteMany: jest.fn(),
      },
      routePlanLoad: {
        findFirst: jest.fn(),
      },
      routePlan: {
        update: jest.fn(),
      },
      routeSegment: {
        updateMany: jest.fn(),
      },
      alert: {
        updateMany: jest.fn(),
      },
      document: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      loadCharge: {
        create: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
        update: jest.fn(),
      },
      driver: {
        findFirst: jest.fn(),
      },
      vehicle: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      driverUnavailability: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      vehicleUnavailability: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      loadLeg: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      trailer: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      moneyCode: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      loadShareLink: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ companyName: 'ACME' }),
      },
      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        // For interactive transactions, call the function with prisma itself as tx
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        // For array transactions, return results
        return fn;
      }),
    };

    counterService = {
      nextValue: jest.fn().mockResolvedValue(1),
    };

    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    loadEventsService = {
      logEvent: jest.fn().mockResolvedValue(undefined),
    };

    loadChargesService = {
      addCharge: jest.fn().mockResolvedValue({ id: 1 }),
    };

    geocodingService = {
      geocodeStop: jest.fn().mockResolvedValue(undefined),
    };

    stopsService = {
      findOrCreate: jest.fn().mockResolvedValue({ stop: { id: 1 }, isNew: false }),
      createImportStop: jest
        .fn()
        .mockImplementation((_t: number, d: any) => Promise.resolve({ id: 1, name: d.name, lat: null, lon: null })),
    };

    const mockCache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
      getOrSet: jest.fn().mockImplementation((_key: string, fn: () => any) => fn()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CounterService, useValue: counterService },
        { provide: DomainEventService, useValue: eventEmitter },
        { provide: LoadEventsService, useValue: loadEventsService },
        { provide: LoadChargesService, useValue: loadChargesService },
        { provide: GeocodingService, useValue: geocodingService },
        { provide: StopsService, useValue: stopsService },
        { provide: StopMatchService, useValue: { suggestMerge: jest.fn().mockResolvedValue(undefined) } },
        { provide: SallyCacheService, useValue: mockCache },
        {
          provide: LoadLegService,
          useValue: {
            getActiveLeg: jest.fn(),
            assignLeg: jest.fn().mockResolvedValue({}),
          },
        },
        LoadTrackingService,
        LoadShareLinkService,
        CustomerLoadService,
        LoadQueryService,
        StopGeocodingService,
        LoadCreationService,
        LoadDraftService,
        LoadStatusService,
        LoadAssignmentService,
        StopStatusService,
        {
          provide: CustomFieldValidatorService,
          useValue: {
            validate: jest.fn().mockResolvedValue({ values: {}, warnings: [] }),
            getDefinitions: jest.fn().mockResolvedValue([]),
            invalidateCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoadMileageService,
          useValue: { enqueueRecalc: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<LoadsService>(LoadsService);
    loadLegService = module.get(LoadLegService);
    loadMileageService = module.get(LoadMileageService);
  });

  // ─── findAll ───────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated loads for a tenant', async () => {
      prisma.load.findMany.mockResolvedValue([baseMockLoad]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
          skip: 0,
          take: 20,
        }),
      );
      expect(prisma.load.count).toHaveBeenCalledWith({
        where: { tenantId: 1 },
      });
      expect(result).toEqual(
        expect.objectContaining({
          total: 1,
          limit: 50,
          offset: 0,
        }),
      );
      expect(result.data).toHaveLength(1);
    });

    it('should filter by status', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { status: 'DELIVERED' });

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, status: 'DELIVERED' },
        }),
      );
    });

    it('should filter by customerName (case-insensitive)', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { customerName: 'ACME' });

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 1,
            customerName: {
              contains: 'ACME',
              mode: 'insensitive',
            },
          },
        }),
      );
    });

    it('should filter by equipmentType', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { equipmentType: 'reefer' });

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            requiredEquipmentType: 'reefer',
          }),
        }),
      );
    });

    it('should filter by driverId (resolved to DB id)', async () => {
      prisma.driver.findFirst.mockResolvedValue({
        id: 42,
        driverId: 'DRV-001',
      });
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { driverId: 'DRV-001' });

      expect(prisma.driver.findFirst).toHaveBeenCalledWith({
        where: { driverId: 'DRV-001' },
      });
      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, driverId: 42 },
        }),
      );
    });

    it('should return empty result when driverId not found', async () => {
      prisma.driver.findFirst.mockResolvedValue(null);

      const result = await service.findAll(1, { driverId: 'NONEXISTENT' });

      expect(result).toEqual({
        data: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
      expect(prisma.load.findMany).not.toHaveBeenCalled();
    });

    it('should apply search across load_number, customer_name, reference_number, driver name', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { search: 'ACME' });

      const callArgs = prisma.load.findMany.mock.calls[0][0];
      expect(callArgs.where.OR).toEqual([
        { loadNumber: { contains: 'ACME', mode: 'insensitive' } },
        { customerName: { contains: 'ACME', mode: 'insensitive' } },
        { referenceNumber: { contains: 'ACME', mode: 'insensitive' } },
        { driver: { name: { contains: 'ACME', mode: 'insensitive' } } },
      ]);
    });

    it('should apply dateFrom/dateTo for delivered loads using deliveredAt', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, {
        status: 'DELIVERED',
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      });

      const callArgs = prisma.load.findMany.mock.calls[0][0];
      expect(callArgs.where.deliveredAt).toBeDefined();
      expect(callArgs.where.deliveredAt.gte).toEqual(new Date('2026-02-01'));
      // date_to is inclusive: adds 1 day
      expect(callArgs.where.deliveredAt.lt).toEqual(new Date('2026-03-01'));
    });

    it('should apply dateFrom/dateTo for cancelled loads using cancelledAt', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, {
        status: 'CANCELLED',
        dateFrom: '2026-01-01',
      });

      const callArgs = prisma.load.findMany.mock.calls[0][0];
      expect(callArgs.where.cancelledAt).toBeDefined();
      expect(callArgs.where.cancelledAt.gte).toEqual(new Date('2026-01-01'));
    });

    it('should apply date range on pickupDate for non-delivered/cancelled statuses', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, {
        status: 'PENDING',
        dateFrom: '2026-02-20',
      });

      const callArgs = prisma.load.findMany.mock.calls[0][0];
      expect(callArgs.where.pickupDate).toBeDefined();
      expect(callArgs.where.pickupDate.gte).toEqual(new Date('2026-02-20'));
    });

    it('should sort by mapped field name', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { sortBy: 'pickupDate', sortOrder: 'asc' });

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { pickupDate: 'asc' },
        }),
      );
    });

    it('should default sort to createdAt desc', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1);

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should apply pagination offset and limit', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, {}, { limit: 10, offset: 20 });

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
      expect((await service.findAll(1, {}, { limit: 10, offset: 20 })).limit).toBe(10);
    });

    it('should map load fields to camelCase response shape', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          driver: { name: 'John Doe', driverId: 'DRV-001' },
          vehicle: { unitNumber: 'TRK-42', vehicleId: 'VEH-001' },
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          loadNumber: 'LD-20260223-001',
          status: 'PENDING',
          customerName: 'ACME Corp',
          weightLbs: 40000,
          pickupDate: '2026-02-25',
          deliveryDate: '2026-02-27',
          originCity: 'Chicago',
          destinationCity: 'Dallas',
          driverName: 'John Doe',
          vehicleUnitNumber: 'TRK-42',
        }),
      );
    });

    it('should format relay load in list with legs and activeLeg', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          isRelay: true,
          billingStatus: 'DRAFT',
          routePlanLoads: [{ plan: { planId: 'PLAN-1', status: 'ACTIVE' } }],
          settlementLineItems: [
            { payAmountCents: 100000, settlement: { status: 'DRAFT' } },
            { payAmountCents: 50000, settlement: { status: 'DRAFT' } },
          ],
          trip: {
            tripId: 'TRIP-001',
            loadCount: 3,
          },
          tripOrder: 1,
          legs: [
            {
              legId: 'LEG-1',
              sequence: 1,
              status: 'DELIVERED',
              driverId: 5,
              actualMiles: 300,
              driver: { name: 'John' },
              vehicle: { unitNumber: 'TRK-1' },
            },
            {
              legId: 'LEG-2',
              sequence: 2,
              status: 'IN_TRANSIT',
              driverId: 6,
              actualMiles: null,
              driver: { name: 'Jane' },
              vehicle: { unitNumber: 'TRK-2' },
            },
          ],
          stops: [
            {
              actionType: 'pickup',
              sequenceOrder: 1,
              earliestArrival: '08:00',
              stop: { lat: 32.7, lon: -96.8 },
            },
            {
              actionType: 'delivery',
              sequenceOrder: 2,
              earliestArrival: '14:00',
              stop: { lat: null, lon: null },
            },
          ],
          driver: { name: 'John Doe' },
          vehicle: { unitNumber: 'TRK-42' },
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(result.data[0]).toEqual(
        expect.objectContaining({
          isRelay: true,
          tripId: 'TRIP-001',
          tripOrder: 1,
          tripLoadCount: 3,
          driverPayCents: 150000,
          stopCount: 2,
          missingCoordinates: 1,
        }),
      );
      expect(result.data[0].legs).toHaveLength(2);
      expect(result.data[0].activeLeg).toBeDefined();
      expect(result.data[0].activeLeg.legId).toBe('LEG-2');
      expect(result.data[0].routePlan).toEqual({
        planId: 'PLAN-1',
        status: 'ACTIVE',
      });
    });
  });

  // ─── findActiveBoard ───────────────────────────────────────────────

  describe('findActiveBoard', () => {
    it('queries the full active set with the platform max page limit', async () => {
      prisma.load.findMany.mockResolvedValue([baseMockLoad]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findActiveBoard(1);

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 1,
            status: { in: ['DRAFT', 'PENDING', 'ASSIGNED', 'IN_TRANSIT', 'ON_HOLD'] },
          },
          take: 500,
          skip: 0,
        }),
      );
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });

    it('logs a warning when the active set approaches the cap', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      prisma.load.findMany.mockResolvedValue([baseMockLoad]);
      prisma.load.count.mockResolvedValue(450);

      await service.findActiveBoard(1);

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('450 loads'));
      warnSpy.mockRestore();
    });

    it('does not warn for typical fleet sizes', async () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      prisma.load.findMany.mockResolvedValue([baseMockLoad]);
      prisma.load.count.mockResolvedValue(50);

      await service.findActiveBoard(1);

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  // ─── findOne ───────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return formatted load when found', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
      });

      const result = await service.findOne('LOAD-LD-20260223-001');
    });

    it('should scope by tenantId when provided', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
      });

      await service.findOne('LD-20260223-001', 5);

      expect(prisma.load.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loadNumber: 'LD-20260223-001', tenantId: 5 },
        }),
      );
    });

    it('should throw NotFoundException when not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.findOne('NONEXISTENT')).rejects.toThrow(NotFoundException);
    });

    it('should format relay load with legs and activeLeg', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        isRelay: true,
        legs: [
          {
            legId: 'LEG-1',
            sequence: 1,
            status: 'DELIVERED',
            driverId: 5,
            vehicleId: 3,
            actualMiles: 450,
            originStopId: 100,
            destStopId: 101,
            driver: { name: 'John', driverId: 'DRV-1' },
            vehicle: { unitNumber: 'TRK-42', vehicleId: 'VEH-1' },
            assignedAt: new Date('2026-04-01'),
            pickedUpAt: new Date('2026-04-02'),
            deliveredAt: new Date('2026-04-03'),
          },
          {
            legId: 'LEG-2',
            sequence: 2,
            status: 'IN_TRANSIT',
            driverId: 6,
            vehicleId: 3,
            actualMiles: null,
            originStopId: 101,
            destStopId: 102,
            driver: { name: 'Jane', driverId: 'DRV-2' },
            vehicle: { unitNumber: 'TRK-42', vehicleId: 'VEH-1' },
            assignedAt: new Date('2026-04-03'),
            pickedUpAt: new Date('2026-04-04'),
            deliveredAt: null,
          },
        ],
        stops: [],
        driver: null,
        vehicle: null,
        trip: null,
        invoices: [
          {
            id: 1,
            invoiceNumber: 'INV-001',
            status: 'sent',
            totalCents: 320000,
            balanceCents: 320000,
            dueDate: new Date('2026-05-01'),
            paidDate: null,
            createdAt: new Date('2026-04-05'),
          },
        ],
        billingStatus: null,
        requiredEquipmentType: null,
      });

      const result = await service.findOne('LOAD-LD-20260223-001');

      expect(result.legs).toBeDefined();
      expect(result.legs).toHaveLength(2);
      expect(result.legs[0].legId).toBe('LEG-1');
      expect(result.legs[0].driverName).toBe('John');
      expect(result.activeLeg).toBeDefined();
      expect(result.activeLeg.legId).toBe('LEG-2');
      expect(result.activeLeg.driverName).toBe('Jane');
      expect(result.invoices).toBeDefined();
      expect(result.invoices).toHaveLength(1);
    });
  });

  // ─── create (auto-linehaul charge) ─────────────────────────────────

  describe('create', () => {
    const createData = {
      tenantId: 1,
      weightLbs: 40000,
      commodityType: 'dry_goods',
      customerId: 1,
      customerName: 'ACME Corp',
      rateCents: 320000,
      stops: [
        {
          stopId: 'STOP-1',
          sequenceOrder: 1,
          actionType: 'pickup',
          estimatedDockHours: 2,
          name: 'Warehouse A',
          city: 'Chicago',
          state: 'IL',
        },
      ],
    };

    beforeEach(() => {
      prisma.load.create.mockResolvedValue({ ...baseMockLoad });
      prisma.stop.findFirst.mockResolvedValue(null);
      prisma.stop.create.mockResolvedValue({ id: 10, stopId: 'STOP-1' });
      prisma.loadStop.create.mockResolvedValue({});
      prisma.loadStop.findMany.mockResolvedValue([]);
      prisma.load.update.mockResolvedValue(baseMockLoad);
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
        tenant: { tenantId: 'tenant-abc' },
      });
    });

    it('should auto-create linehaul charge when rate_cents provided', async () => {
      await service.create(createData);

      // Charge is now created inside the $transaction via tx.loadCharge.create
      expect(prisma.loadCharge.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          chargeType: 'linehaul',
          description: 'Linehaul rate',
          unitPriceCents: 320000,
        }),
      });
    });

    it('should NOT create linehaul charge when rate_cents is not provided', async () => {
      await service.create({ ...createData, rateCents: undefined });

      expect(prisma.loadCharge.create).not.toHaveBeenCalled();
    });

    it('should NOT create linehaul charge when rateCents is 0', async () => {
      await service.create({ ...createData, rateCents: 0 });

      expect(prisma.loadCharge.create).not.toHaveBeenCalled();
    });

    it('shares one Stop record across two LoadStops at the same place (no clone-on-collision)', async () => {
      // Both stops resolve to the same Stop id — yard pickup + yard drop.
      stopsService.findOrCreate.mockResolvedValue({ stop: { id: 1, name: 'Yard' }, isNew: false });
      prisma.stop.findFirst.mockResolvedValue(null);

      await service.create({
        ...createData,
        stops: [
          { stopId: 'STOP-Y1', sequenceOrder: 1, actionType: 'pickup', estimatedDockHours: 2, name: 'Yard' },
          { stopId: 'STOP-Y2', sequenceOrder: 2, actionType: 'delivery', estimatedDockHours: 2, name: 'Yard' },
        ],
      });

      // The old hack force-created a clone Stop via prisma.stop.create — must NOT happen now.
      expect(prisma.stop.create).not.toHaveBeenCalled();
      // Both LoadStops reference the same shared Stop id.
      const createManyArg = prisma.loadStop.createMany.mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(2);
      expect(createManyArg[0].stopId).toBe(1);
      expect(createManyArg[1].stopId).toBe(1);
    });

    it('import: creates a fresh stop per leg (no dedup) and flags facilityUnverified when no street/name (SQ-112)', async () => {
      prisma.stop.findFirst.mockResolvedValue(null);
      let nextId = 100;
      stopsService.createImportStop.mockImplementation((_t: number, d: any) =>
        Promise.resolve({ id: ++nextId, name: d.name ?? `${d.city}, ${d.state}`, lat: null, lon: null }),
      );
      prisma.stop.update.mockImplementation(({ where }: any) =>
        Promise.resolve({ id: where.id, lat: null, lon: null, locationPrecision: 'UNKNOWN' }),
      );

      await service.create({
        ...createData,
        intakeSource: 'import',
        stops: [
          {
            stopId: 'IMP-1',
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            city: 'Fair Lawn',
            state: 'NJ',
            zipCode: '07410',
          },
          {
            stopId: 'IMP-2',
            sequenceOrder: 2,
            actionType: 'delivery',
            estimatedDockHours: 2,
            city: 'Taunton',
            state: 'MA',
            zipCode: '02780',
          },
        ],
      });

      // Two DISTINCT fresh stops — never the shared-dedup path.
      expect(stopsService.createImportStop).toHaveBeenCalledTimes(2);
      expect(stopsService.findOrCreate).not.toHaveBeenCalled();

      const createManyArg = prisma.loadStop.createMany.mock.calls[0][0].data;
      expect(createManyArg).toHaveLength(2);
      expect(createManyArg[0].stopId).not.toBe(createManyArg[1].stopId); // distinct rows
      // No street + no name → both flagged for facility review.
      expect(createManyArg.every((ls: any) => ls.facilityUnverified === true)).toBe(true);
    });

    it('enqueues an async mileage recompute after the load is created', async () => {
      await service.create(createData);
      expect(loadMileageService.enqueueRecalc).toHaveBeenCalledWith(baseMockLoad.id);
    });
  });

  // ─── updateStatus ──────────────────────────────────────────────────

  describe('updateStatus', () => {
    it('should require reason for on_hold', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'ON_HOLD')).rejects.toThrow(BadRequestException);
    });

    it('should require reason for tonu', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'TONU')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for missing load', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.updateStatus('NONEXISTENT', 'PENDING')).rejects.toThrow(NotFoundException);
    });

    it('should clear assignedAt and driver/vehicle when demoting assigned → pending', async () => {
      const assignedLoad = {
        ...baseMockLoad,
        status: 'ASSIGNED',
        assignedAt: new Date(),
        driverId: 5,
        vehicleId: 3,
      };
      prisma.load.findFirst.mockResolvedValue(assignedLoad);
      prisma.load.update.mockResolvedValue({
        ...assignedLoad,
        status: 'PENDING',
        assignedAt: null,
        driverId: null,
        vehicleId: null,
        stops: [],
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'PENDING');

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            assignedAt: null,
            driverId: null,
            vehicleId: null,
            inTransitAt: null,
          }),
        }),
      );
    });

    it('should clear all forward data when demoting to draft', async () => {
      const onHoldLoad = {
        ...baseMockLoad,
        status: 'ON_HOLD',
        onHoldAt: new Date(),
        onHoldReason: 'Weather delay',
        assignedAt: new Date(),
        driverId: 5,
        vehicleId: 3,
      };
      prisma.load.findFirst.mockResolvedValue(onHoldLoad);
      prisma.load.update.mockResolvedValue({
        ...onHoldLoad,
        status: 'DRAFT',
        stops: [],
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'DRAFT');

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DRAFT',
            assignedAt: null,
            inTransitAt: null,
            onHoldAt: null,
            onHoldReason: null,
            driverId: null,
            vehicleId: null,
          }),
        }),
      );
    });

    it('should clear hold data when resuming from on_hold', async () => {
      const onHoldLoad = {
        ...baseMockLoad,
        status: 'ON_HOLD',
        onHoldAt: new Date(),
        onHoldReason: 'Inspection',
      };
      prisma.load.findFirst.mockResolvedValue(onHoldLoad);
      prisma.load.update.mockResolvedValue({
        ...onHoldLoad,
        status: 'PENDING',
        stops: [],
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'PENDING');

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            onHoldAt: null,
            onHoldReason: null,
          }),
        }),
      );
    });

    // ─── Valid state transitions ────────────────────────────

    it('should allow pending → assigned', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        stops: [],
      });

      const result = await service.updateStatus('LOAD-LD-20260223-001', 'ASSIGNED');

      expect(result.status).toBe('ASSIGNED');
    });

    it('should allow assigned → in_transit', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        driverId: 1,
        vehicleId: 1,
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        stops: [],
      });

      const result = await service.updateStatus('LOAD-LD-20260223-001', 'IN_TRANSIT');

      expect(result.status).toBe('IN_TRANSIT');
    });

    it('should allow in_transit → delivered and set billingStatus', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        driverId: 1,
        vehicleId: 1,
        rateCents: 320000,
      });
      prisma.loadStop.updateMany.mockResolvedValue({ count: 0 });
      prisma.loadCharge.findFirst.mockResolvedValue({ id: 1 }); // existing linehaul
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
      });
      // For completeRoutePlanIfTerminal
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      // For syncVehicleStatusAfterLoadTerminal
      prisma.vehicle.findUnique.mockResolvedValue(null);

      const result = await service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED');

      expect(result.status).toBe('DELIVERED');
      // billingStatus is now set by the shared LoadLegService.applyDeliverySideEffects
      // helper (its own load.update), while the main update sets status — two writes,
      // both correct. Assert each field was written, not that they share one call. (SQ-114)
      const updateData = prisma.load.update.mock.calls.map((c: any) => c[0]?.data ?? {});
      expect(updateData).toEqual(expect.arrayContaining([expect.objectContaining({ status: 'DELIVERED' })]));
      expect(updateData).toEqual(
        expect.arrayContaining([expect.objectContaining({ billingStatus: 'PENDING_DOCUMENTS' })]),
      );
    });

    // ─── Invalid state transitions ──────────────────────────

    it('should reject pending → delivered (invalid transition)', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED')).rejects.toThrow(BadRequestException);
    });

    it('should reject pending → in_transit (invalid transition)', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'IN_TRANSIT')).rejects.toThrow(BadRequestException);
    });

    it('should reject draft → delivered (invalid transition)', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DRAFT',
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED')).rejects.toThrow(BadRequestException);
    });

    // ─── Cancellation flow ──────────────────────────────────

    it('should allow cancellation from assigned status', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        driverId: 1,
        vehicleId: 1,
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'CANCELLED',
        stops: [],
      });
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.vehicle.findUnique.mockResolvedValue(null);

      const result = await service.updateStatus('LOAD-LD-20260223-001', 'CANCELLED');

      expect(result.status).toBe('CANCELLED');
    });

    // ─── TONU flow ──────────────────────────────────────────

    it('should set tonu reason when provided', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        driverId: 1,
        vehicleId: 1,
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'TONU',
        stops: [],
      });
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.vehicle.findUnique.mockResolvedValue(null);

      await service.updateStatus('LOAD-LD-20260223-001', 'TONU', {
        reason: 'Customer cancelled pickup',
      });

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'TONU',
            tonuReason: 'Customer cancelled pickup',
          }),
        }),
      );
    });

    // ─── On-hold flow ───────────────────────────────────────

    it('should set onHoldReason and onHoldAt when putting on hold', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        driverId: 1,
        vehicleId: 1,
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'ON_HOLD',
        stops: [],
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'ON_HOLD', {
        reason: 'Weather delay',
      });

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ON_HOLD',
            onHoldReason: 'Weather delay',
          }),
        }),
      );
    });

    // ─── Reversal block ─────────────────────────────────────

    it('should block reversal transitions through updateStatus (must use /revert)', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        driverId: 1,
        vehicleId: 1,
      });

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'IN_TRANSIT')).rejects.toThrow(BadRequestException);
    });

    // ─── Event emission ─────────────────────────────────────

    it('should emit LOAD_STATUS_CHANGED event on successful transition', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        tenantId: 1,
        stops: [],
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'ASSIGNED');

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'sally.load.status-changed',
        expect.anything(), // tenantId
        expect.objectContaining({
          status: 'ASSIGNED',
          previousStatus: 'PENDING',
        }),
      );
    });

    it('should validate draft → pending field completeness', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DRAFT',
        customerId: null,
        rateCents: null,
        referenceNumber: null,
      });
      prisma.loadStop.findMany.mockResolvedValue([]);

      await expect(service.updateStatus('LOAD-LD-20260223-001', 'PENDING')).rejects.toThrow(BadRequestException);
    });

    it('should delegate relay load in_transit transition to leg service', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'ASSIGNED',
        isRelay: true,
      });
      prisma.loadLeg.findMany.mockResolvedValue([{ legId: 'LEG-1', sequence: 1, status: 'ASSIGNED' }]);
      loadLegService.advanceLegStatus = jest.fn().mockResolvedValue({
        legId: 'LEG-1',
        status: 'IN_TRANSIT',
      });

      await service.updateStatus('LOAD-LD-20260223-001', 'IN_TRANSIT');

      expect(loadLegService.advanceLegStatus).toHaveBeenCalledWith('LEG-1', 'IN_TRANSIT', 1);
    });
  });

  // ─── assignLoad ─────────────────────────────────────────

  describe('assignLoad', () => {
    it('should assign driver and vehicle and auto-transition pending → assigned', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')) as any;

      expect(result.success).toBe(true);
      expect(result.status).toBe('ASSIGNED');
      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            driverId: 1,
            vehicleId: 2,
            status: 'ASSIGNED',
          }),
        }),
      );
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.assignLoad('NONEXISTENT', 'DRV-001', 'VEH-001')).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when driver not found', async () => {
      prisma.load.findFirst.mockResolvedValue(baseMockLoad);
      prisma.driver.findFirst.mockResolvedValue(null);

      await expect(service.assignLoad('LOAD-LD-20260223-001', 'NONEXISTENT', 'VEH-001')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should auto-sync vehicle status AVAILABLE → ASSIGNED', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);

      await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001');

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { status: 'ASSIGNED' },
      });
    });

    it('should include driver unavailability warning when dates overlap', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        tenantId: 1,
        status: 'PENDING',
        pickupDate: new Date('2026-02-25'),
        deliveryDate: new Date('2026-02-27'),
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.driverUnavailability.findFirst.mockResolvedValue({
        id: 1,
        driverId: 1,
        type: 'VACATION',
        startDate: new Date('2026-02-24'),
        endDate: new Date('2026-02-26'),
      });
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')) as any;

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual(expect.objectContaining({ type: 'DRIVER_UNAVAILABLE' }));
    });

    it('should include vehicle unavailability warning when dates overlap', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        tenantId: 1,
        status: 'PENDING',
        pickupDate: new Date('2026-02-25'),
        deliveryDate: new Date('2026-02-27'),
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.driverUnavailability.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.findFirst.mockResolvedValue({
        id: 1,
        vehicleId: 2,
        type: 'MAINTENANCE',
        startDate: new Date('2026-02-26'),
        endDate: new Date('2026-02-28'),
      });

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')) as any;

      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toEqual(expect.objectContaining({ type: 'VEHICLE_UNAVAILABLE' }));
    });

    it('should return empty warnings when no unavailability exists', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        tenantId: 1,
        status: 'PENDING',
        pickupDate: new Date('2026-02-25'),
        deliveryDate: new Date('2026-02-27'),
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.driverUnavailability.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')) as any;

      expect(result.success).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should auto-fill trailer from vehicle currentTrailer', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        tenantId: 1,
        status: 'PENDING',
        requiredEquipmentType: 'DRY_VAN',
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
        currentTrailer: {
          id: 10,
          trailerId: 'TRL-001',
          unitNumber: 'TR-42',
          equipmentType: 'DRY_VAN',
          status: 'AVAILABLE',
        },
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.trailer.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.driverUnavailability.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')) as any;

      expect(result.success).toBe(true);
      expect(result.trailerId).toBe('TRL-001');
      // Trailer status should be auto-synced
      expect(prisma.trailer.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'ASSIGNED' },
      });
    });
  });

  // ─── deleteLoad ─────────────────────────────────────────

  describe('deleteLoad', () => {
    it('should delete a draft load with all related records', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DRAFT',
      });

      const result = await service.deleteLoad('LOAD-LD-20260223-001', 1);

      expect(result.deleted).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject deletion of non-draft loads', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });

      await expect(service.deleteLoad('LOAD-LD-20260223-001', 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.deleteLoad('NONEXISTENT', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── revertDelivery ─────────────────────────────────────

  describe('revertDelivery', () => {
    it('should revert delivered load to in_transit when billing is PENDING_DOCUMENTS', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        stops: [],
      });
      prisma.loadStop.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.revertDelivery(1, 'LOAD-LD-20260223-001', 'Wrong delivery');

      expect(result.status).toBe('IN_TRANSIT');
    });

    it('should throw BadRequestException if load is not delivered', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
      });

      await expect(service.revertDelivery(1, 'LOAD-LD-20260223-001', 'reason')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if billing has progressed', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'INVOICED',
      });

      await expect(service.revertDelivery(1, 'LOAD-LD-20260223-001', 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updateDraft ────────────────────────────────────────

  describe('updateDraft', () => {
    it('should reject updates on in_transit loads', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
      });

      await expect(service.updateDraft('LOAD-LD-20260223-001', { customerName: 'X' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject changing equipmentType on assigned load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
        requiredEquipmentType: 'DRY_VAN',
      });

      await expect(
        service.updateDraft('LOAD-LD-20260223-001', {
          equipmentType: 'reefer',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject stop replacement on assigned load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'ASSIGNED',
      });

      await expect(
        service.updateDraft('LOAD-LD-20260223-001', {
          stops: [
            {
              stopId: 'STOP-1',
              sequenceOrder: 1,
              actionType: 'pickup',
              estimatedDockHours: 2,
            },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update scalar fields on a draft load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
        customerName: 'Updated Corp',
        rateCents: 400000,
      });
      prisma.loadCharge.findFirst.mockResolvedValue({
        id: 5,
        chargeType: 'linehaul',
      });
      prisma.loadCharge.update.mockResolvedValue({});
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
        customerName: 'Updated Corp',
        rateCents: 400000,
        stops: [],
        trip: null,
        driver: null,
        vehicle: null,
        billingStatus: null,
        requiredEquipmentType: null,
      });

      await service.updateDraft('LOAD-LD-20260223-001', {
        customerName: 'Updated Corp',
        rateCents: 400000,
        referenceNumber: 'REF-999',
        weightLbs: 45000,
        commodityType: 'frozen',
        pieces: 20,
        specialRequirements: 'Temperature controlled',
        isRelay: false,
      });

      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          customerName: 'Updated Corp',
          rateCents: 400000,
          referenceNumber: 'REF-999',
          weightLbs: 45000,
        }),
      });
      // Rate change should sync linehaul charge
      expect(prisma.loadCharge.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: expect.objectContaining({
          unitPriceCents: 400000,
          totalCents: 400000,
        }),
      });
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('should replace stops on a draft load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
      });
      prisma.loadStop.deleteMany.mockResolvedValue({});
      prisma.stop.findFirst.mockResolvedValue({
        id: 100,
        stopId: 'STOP-1',
        name: 'Test Stop',
        lat: 32.7,
        lon: -96.8,
        locationType: 'warehouse',
      });
      prisma.loadStop.create.mockResolvedValue({});
      // computeDenormalizedFields mocks
      prisma.loadStop.findMany.mockResolvedValue([
        {
          sequenceOrder: 1,
          actionType: 'pickup',
          appointmentDate: new Date('2026-04-10'),
          stop: { city: 'Dallas', state: 'TX' },
        },
      ]);
      prisma.load.update.mockResolvedValue({});
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        stops: [],
        trip: null,
        driver: null,
        vehicle: null,
        billingStatus: null,
        requiredEquipmentType: null,
      });

      await service.updateDraft('LOAD-LD-20260223-001', {
        stops: [
          {
            stopId: 'STOP-1',
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
          },
        ],
      });

      expect(prisma.loadStop.deleteMany).toHaveBeenCalledWith({
        where: { loadId: 1 },
      });
      expect(prisma.loadStop.create).toHaveBeenCalled();
    });

    it('should update equipmentType and set requiredEquipmentType', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
        equipmentType: 'dry_van',
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        equipmentType: 'reefer',
      });
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        equipmentType: 'reefer',
        stops: [],
        trip: null,
        driver: null,
        vehicle: null,
        billingStatus: null,
        requiredEquipmentType: 'REEFER',
      });

      await service.updateDraft('LOAD-LD-20260223-001', {
        equipmentType: 'reefer',
      });

      expect(prisma.load.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          requiredEquipmentType: 'REEFER',
        }),
      });
    });

    // ─── payload-aware behavior (load-edit experience redesign) ───
    //
    // The save model is now: only send what changed, and the backend reconciles
    // the stops array surgically against current state. These tests pin down
    // each branch of that reconciliation.

    describe('payload-aware behavior', () => {
      const PENDING_LOAD = {
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'PENDING' as const,
      };

      const baseFindUniqueResponse = {
        ...PENDING_LOAD,
        stops: [],
        trip: null,
        driver: null,
        vehicle: null,
        billingStatus: null,
        requiredEquipmentType: null,
      };

      it('rejects an empty payload with NO_CHANGES', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);

        const promise = service.updateDraft('LOAD-LD-20260223-001', {});

        await expect(promise).rejects.toThrow(BadRequestException);
        await expect(promise).rejects.toMatchObject({
          response: { code: 'NO_CHANGES' },
        });
        expect(prisma.load.update).not.toHaveBeenCalled();
      });

      it('skips stops reconciliation when payload matches current stops structurally and field-wise', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);
        // Current LoadStop rows include the underlying Stop reference.
        prisma.loadStop.findMany.mockResolvedValue([
          {
            id: 10,
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            earliestArrival: null,
            latestArrival: null,
            appointmentDate: null,
            stop: { stopId: 'STOP-A' },
          },
          {
            id: 11,
            sequenceOrder: 2,
            actionType: 'delivery',
            estimatedDockHours: 1,
            earliestArrival: null,
            latestArrival: null,
            appointmentDate: null,
            stop: { stopId: 'STOP-B' },
          },
        ]);
        prisma.loadLeg.findMany.mockResolvedValue([]);
        prisma.load.update.mockResolvedValue(PENDING_LOAD);
        prisma.load.findUnique.mockResolvedValue(baseFindUniqueResponse);

        await service.updateDraft('LOAD-LD-20260223-001', {
          stops: [
            { stopId: 'STOP-A', sequenceOrder: 1, actionType: 'pickup', estimatedDockHours: 2 },
            { stopId: 'STOP-B', sequenceOrder: 2, actionType: 'delivery', estimatedDockHours: 1 },
          ],
        });

        // Critical: no destructive deleteMany on stops.
        expect(prisma.loadStop.deleteMany).not.toHaveBeenCalled();
        // Critical: no recreate either — nothing changed.
        expect(prisma.loadStop.create).not.toHaveBeenCalled();
        // Critical: no in-place patches either — nothing changed.
        expect(prisma.loadStop.update).not.toHaveBeenCalled();
      });

      it('updates non-leg-bound stops in place when only field-level data changed', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);
        // Same structure (stopId/seq/action), but estimatedDockHours differs on row 10.
        prisma.loadStop.findMany.mockResolvedValue([
          {
            id: 10,
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            earliestArrival: null,
            latestArrival: null,
            appointmentDate: null,
            stop: { stopId: 'STOP-A' },
          },
        ]);
        prisma.loadLeg.findMany.mockResolvedValue([]);
        prisma.loadStop.update.mockResolvedValue({});
        prisma.load.update.mockResolvedValue(PENDING_LOAD);
        prisma.load.findUnique.mockResolvedValue(baseFindUniqueResponse);

        await service.updateDraft('LOAD-LD-20260223-001', {
          stops: [{ stopId: 'STOP-A', sequenceOrder: 1, actionType: 'pickup', estimatedDockHours: 4 }],
        });

        expect(prisma.loadStop.deleteMany).not.toHaveBeenCalled();
        expect(prisma.loadStop.update).toHaveBeenCalledWith({
          where: { id: 10 },
          data: expect.objectContaining({ estimatedDockHours: 4 }),
        });
      });

      it('rejects a structural stop change with LEGS_BLOCK_ROUTE_CHANGE when legs exist', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);
        prisma.loadStop.findMany.mockResolvedValue([
          {
            id: 10,
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            stop: { stopId: 'STOP-A' },
          },
          {
            id: 11,
            sequenceOrder: 2,
            actionType: 'delivery',
            estimatedDockHours: 1,
            stop: { stopId: 'STOP-B' },
          },
        ]);
        // Legs reference these stops — structural change must be blocked.
        prisma.loadLeg.findMany.mockResolvedValue([{ legId: 'LEG-1', sequence: 1, originStopId: 10, destStopId: 11 }]);

        const promise = service.updateDraft('LOAD-LD-20260223-001', {
          stops: [
            // New stop inserted between A and B.
            { stopId: 'STOP-A', sequenceOrder: 1, actionType: 'pickup', estimatedDockHours: 2 },
            { stopId: 'STOP-NEW', sequenceOrder: 2, actionType: 'delivery', estimatedDockHours: 1 },
            { stopId: 'STOP-B', sequenceOrder: 3, actionType: 'delivery', estimatedDockHours: 1 },
          ],
        });

        await expect(promise).rejects.toThrow(BadRequestException);
        await expect(promise).rejects.toMatchObject({
          response: { code: 'LEGS_BLOCK_ROUTE_CHANGE' },
        });
        expect(prisma.loadStop.deleteMany).not.toHaveBeenCalled();
      });

      it('allows a structural stop change when no legs exist (legacy delete+recreate path)', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);
        prisma.loadStop.findMany.mockResolvedValueOnce([
          {
            id: 10,
            sequenceOrder: 1,
            actionType: 'pickup',
            estimatedDockHours: 2,
            stop: { stopId: 'STOP-A' },
          },
        ]);
        prisma.loadLeg.findMany.mockResolvedValue([]);
        prisma.loadStop.deleteMany.mockResolvedValue({});
        // Resolve each incoming stopId to a distinct Stop record.
        prisma.stop.findFirst.mockImplementation(({ where }: any) => {
          if (where?.stopId === 'STOP-A') {
            return Promise.resolve({
              id: 100,
              stopId: 'STOP-A',
              name: 'A',
              lat: 32.7,
              lon: -96.8,
              locationType: 'warehouse',
            });
          }
          if (where?.stopId === 'STOP-NEW') {
            return Promise.resolve({
              id: 101,
              stopId: 'STOP-NEW',
              name: 'New Stop',
              lat: 33.0,
              lon: -97.0,
              locationType: 'warehouse',
            });
          }
          return Promise.resolve(null);
        });
        prisma.loadStop.create.mockResolvedValue({});
        // computeDenormalizedFields re-reads stops after recreate
        prisma.loadStop.findMany.mockResolvedValue([
          {
            sequenceOrder: 1,
            actionType: 'pickup',
            appointmentDate: null,
            stop: { city: 'Dallas', state: 'TX' },
          },
          {
            sequenceOrder: 2,
            actionType: 'delivery',
            appointmentDate: null,
            stop: { city: 'Houston', state: 'TX' },
          },
        ]);
        prisma.load.update.mockResolvedValue(PENDING_LOAD);
        prisma.load.findUnique.mockResolvedValue(baseFindUniqueResponse);

        await service.updateDraft('LOAD-LD-20260223-001', {
          stops: [
            { stopId: 'STOP-A', sequenceOrder: 1, actionType: 'pickup', estimatedDockHours: 2 },
            { stopId: 'STOP-NEW', sequenceOrder: 2, actionType: 'delivery', estimatedDockHours: 1 },
          ],
        });

        // No legs → legacy path is the right call.
        expect(prisma.loadStop.deleteMany).toHaveBeenCalledWith({ where: { loadId: 1 } });
      });

      it('updates only scalar fields without touching stops or legs queries', async () => {
        prisma.load.findFirst.mockResolvedValue(PENDING_LOAD);
        prisma.load.update.mockResolvedValue({ ...PENDING_LOAD, customerName: 'New Co' });
        prisma.load.findUnique.mockResolvedValue({ ...baseFindUniqueResponse, customerName: 'New Co' });

        await service.updateDraft('LOAD-LD-20260223-001', { customerName: 'New Co' });

        expect(prisma.loadStop.deleteMany).not.toHaveBeenCalled();
        expect(prisma.loadStop.update).not.toHaveBeenCalled();
        expect(prisma.loadStop.create).not.toHaveBeenCalled();
        // No leg-presence check needed when stops aren't in the payload.
        expect(prisma.loadLeg.findMany).not.toHaveBeenCalled();
      });
    });
  });

  // ─── duplicate ──────────────────────────────────────────

  describe('duplicate', () => {
    it('should create a copy of the load in draft status', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
      });
      prisma.load.create.mockResolvedValue({
        ...baseMockLoad,
        id: 2,
        loadNumber: 'LD-20260223-001-COPY',
        status: 'DRAFT',
      });
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        id: 2,
        loadNumber: 'LD-20260223-001-COPY',
        status: 'DRAFT',
        stops: [],
      });

      const result = await service.duplicate('LOAD-LD-20260223-001', 1);

      expect(result.status).toBe('DRAFT');
      expect(result.loadNumber).toBe('LD-20260223-001-COPY');
    });

    it('should throw NotFoundException when original load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.duplicate('NONEXISTENT', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── enrichStopsWithDocuments ────────────────────────────

  describe('enrichStopsWithDocuments', () => {
    it('should return empty array for empty stops', async () => {
      const result = await service.enrichStopsWithDocuments([], 1);
      expect(result).toEqual([]);
    });

    it('should enrich stops with document data', async () => {
      const stops = [
        { id: 10, name: 'Pickup', actionType: 'pickup' },
        { id: 20, name: 'Delivery', actionType: 'delivery' },
      ];
      prisma.document.findMany.mockResolvedValue([
        { relatedStopId: 10, documentType: 'BOL', id: 100 },
        { relatedStopId: 10, documentType: 'photo', id: 101 },
        { relatedStopId: 20, documentType: 'POD', id: 102 },
      ]);

      const result = await service.enrichStopsWithDocuments(stops, 1);

      expect(result[0].uploadedDocuments).toHaveLength(2);
      expect(result[1].uploadedDocuments).toHaveLength(1);
    });

    it('should handle stops with no documents', async () => {
      const stops = [{ id: 30, name: 'Stop' }];
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.enrichStopsWithDocuments(stops, 1);

      expect(result[0].uploadedDocuments).toEqual([]);
    });
  });

  // ─── findByCustomerId ────────────────────────────────────

  describe('findByCustomerId', () => {
    it('should return customer-visible loads with formatted response', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          customerId: 10,
          status: 'IN_TRANSIT',
          createdAt: new Date('2026-03-01'),
          stops: [
            { actionType: 'pickup', stop: { city: 'Chicago', state: 'IL' } },
            { actionType: 'delivery', stop: { city: 'Dallas', state: 'TX' } },
          ],
          routePlanLoads: [
            {
              plan: {
                isActive: true,
                estimatedArrival: new Date('2026-03-03'),
              },
            },
          ],
        },
      ]);

      const result = await service.findByCustomerId(10);

      expect(result).toHaveLength(1);
      expect(result[0].originCity).toBe('Chicago');
      expect(result[0].destinationCity).toBe('Dallas');
      expect(result[0].estimatedDelivery).toBeDefined();
    });

    it('should scope by tenantId when provided', async () => {
      prisma.load.findMany.mockResolvedValue([]);

      await service.findByCustomerId(10, 1);

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            customerId: 10,
            tenantId: 1,
          }),
        }),
      );
    });

    it('should handle loads without stops or plans', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          customerId: 10,
          status: 'ASSIGNED',
          createdAt: new Date(),
          stops: [],
          routePlanLoads: [],
        },
      ]);

      const result = await service.findByCustomerId(10);

      expect(result[0].originCity).toBeNull();
      expect(result[0].estimatedDelivery).toBeNull();
    });
  });

  // ─── findOneForCustomer ────────────────────────────────

  describe('findOneForCustomer', () => {
    it('should return formatted load for customer', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        customerId: 10,
        stops: [],
      });

      const result = await service.findOneForCustomer('LOAD-LD-20260223-001', 10);
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.findOneForCustomer('NONEXISTENT', 10)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── generateTrackingToken ─────────────────────────────

  describe('generateTrackingToken', () => {
    it('should mint an opaque token via LoadShareLinkService and return tracking URL', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        tenantId: 1,
        loadNumber: 'LD-20260223-001',
      });
      prisma.loadShareLink.create.mockImplementation(({ data }: any) =>
        Promise.resolve({ id: 1, ...data, viewCount: 0, createdAt: new Date() }),
      );

      const result = await service.generateTrackingToken('LOAD-LD-20260223-001', 1, 42);

      expect(result.trackingToken).toHaveLength(22);
      expect(result.trackingToken).not.toContain('LD-20260223-001');
      expect(result.trackingUrl).toBe(`/track/${result.trackingToken}`);
      expect(prisma.loadShareLink.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loadId: 1,
            tenantId: 1,
            createdBy: 42,
          }),
        }),
      );
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.generateTrackingToken('NONEXISTENT', 1, 42)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── getPublicTracking ─────────────────────────────────

  describe('getPublicTracking', () => {
    const mockActiveLink = (loadId: number) => {
      prisma.loadShareLink.findUnique.mockResolvedValue({
        id: 1,
        loadId,
        token: 't',
        revokedAt: null,
        expiresAt: null,
        viewCount: 0,
      });
      prisma.loadShareLink.update.mockResolvedValue({
        id: 1,
        loadId,
        token: 't',
        viewCount: 1,
        lastViewedAt: new Date(),
      });
    };

    it('should return tracking data with timeline', async () => {
      mockActiveLink(99);
      prisma.load.findFirst.mockResolvedValue({
        id: 99,
        loadNumber: 'LD-001',
        status: 'IN_TRANSIT',
        customerName: 'ACME Corp',
        equipmentType: 'dry_van',
        weightLbs: 40000,
        createdAt: new Date('2026-03-01'),
        tenant: { companyName: 'Fleet Co' },
        stops: [
          {
            sequenceOrder: 1,
            actionType: 'pickup',
            actualDockHours: 1.5,
            stop: { city: 'Chicago', state: 'IL' },
          },
          {
            sequenceOrder: 2,
            actionType: 'delivery',
            actualDockHours: null,
            stop: { city: 'Dallas', state: 'TX' },
          },
        ],
        routePlanLoads: [
          {
            plan: {
              isActive: true,
              estimatedArrival: new Date('2026-03-03'),
              status: 'ACTIVE',
            },
          },
        ],
      });

      const result = await service.getPublicTracking('t');

      expect(result.loadNumber).toBe('LD-001');
      expect(result.status).toBe('IN_TRANSIT');
      expect(result.carrierName).toBe('Fleet Co');
      expect(result.timeline.length).toBeGreaterThan(0);
      expect(result.stops).toHaveLength(2);
      expect(result.estimatedDelivery).toBeDefined();
    });

    it('should throw NotFoundException for invalid token', async () => {
      prisma.loadShareLink.findUnique.mockResolvedValue(null);

      await expect(service.getPublicTracking('INVALID')).rejects.toThrow(NotFoundException);
    });

    it('should handle delivered status timeline', async () => {
      mockActiveLink(100);
      prisma.load.findFirst.mockResolvedValue({
        id: 100,
        loadNumber: 'LD-001',
        status: 'DELIVERED',
        customerName: 'ACME',
        equipmentType: 'flatbed',
        weightLbs: 30000,
        createdAt: new Date(),
        tenant: { companyName: 'Fleet Co' },
        stops: [
          {
            sequenceOrder: 1,
            actionType: 'pickup',
            actualDockHours: 1,
            stop: { city: 'A', state: 'TX' },
          },
          {
            sequenceOrder: 2,
            actionType: 'delivery',
            actualDockHours: 2,
            stop: { city: 'B', state: 'TX' },
          },
        ],
        routePlanLoads: [],
      });

      const result = await service.getPublicTracking('t');

      const delivered = result.timeline.find((e: any) => e.event === 'Delivered');
      expect(delivered).toBeDefined();
      // Tracking timeline uses lowercase UI labels — distinct from DB status enum.
      expect(delivered.status).toBe('completed');
    });
  });

  // ─── Tenant isolation ─────────────────────────────────────

  describe('tenant isolation', () => {
    it('findAll should scope all queries to tenantId', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(42);

      expect(prisma.load.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 42 }),
        }),
      );
      expect(prisma.load.count).toHaveBeenCalledWith({
        where: expect.objectContaining({ tenantId: 42 }),
      });
    });

    it('deleteLoad should scope to tenantId', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.deleteLoad('LD-1', 99)).rejects.toThrow(NotFoundException);
      expect(prisma.load.findFirst).toHaveBeenCalledWith({
        where: { loadNumber: 'LD-1', tenantId: 99 },
      });
    });
  });

  // ─── updateStopStatus ───────────────────────────────────────

  describe('updateStopStatus', () => {
    const loadWithStops = {
      ...baseMockLoad,
      id: 1,
      loadNumber: 'LD-001',
      status: 'IN_TRANSIT',
      driverId: 5,
      tenantId: 1,
      stops: [
        {
          id: 10,
          sequenceOrder: 1,
          actionType: 'pickup',
          status: 'PENDING',
          arrivedAt: null,
          loadingStartedAt: null,
          completedAt: null,
          detentionMinutes: null,
        },
        {
          id: 11,
          sequenceOrder: 2,
          actionType: 'delivery',
          status: 'PENDING',
          arrivedAt: null,
          loadingStartedAt: null,
          completedAt: null,
          detentionMinutes: null,
        },
      ],
    };

    it('should transition stop from pending to arrived', async () => {
      prisma.load.findFirst.mockResolvedValue(loadWithStops);
      prisma.loadStop.update.mockResolvedValue({});

      const result = await service.updateStopStatus('LOAD-LD-001', 10, 'ARRIVED', 'user-1', 1);

      expect(prisma.loadStop.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          status: 'ARRIVED',
          arrivedAt: expect.any(Date),
        }),
      });
      expect(result.status).toBe('ARRIVED');
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('should transition stop from arrived to in_progress', async () => {
      const withArrived = {
        ...loadWithStops,
        stops: [
          {
            ...loadWithStops.stops[0],
            status: 'ARRIVED',
            arrivedAt: new Date(),
          },
          loadWithStops.stops[1],
        ],
      };
      prisma.load.findFirst.mockResolvedValue(withArrived);
      prisma.loadStop.update.mockResolvedValue({});

      const result = await service.updateStopStatus('LOAD-LD-001', 10, 'IN_PROGRESS', 'user-1', 1);

      expect(result.status).toBe('IN_PROGRESS');
    });

    it('should transition stop from in_progress to completed with detention', async () => {
      const arrivedAt = new Date(Date.now() - 120 * 60_000); // 2 hours ago
      const withInProgress = {
        ...loadWithStops,
        stops: [
          {
            ...loadWithStops.stops[0],
            status: 'IN_PROGRESS',
            arrivedAt,
          },
          loadWithStops.stops[1],
        ],
      };
      prisma.load.findFirst.mockResolvedValue(withInProgress);
      prisma.loadStop.update.mockResolvedValue({});

      const result = await service.updateStopStatus('LOAD-LD-001', 10, 'COMPLETED', 'user-1', 1);

      expect(result.status).toBe('COMPLETED');
      expect(result.detentionMinutes).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.updateStopStatus('NOPE', 10, 'ARRIVED', 'user-1', 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when stop not found on load', async () => {
      prisma.load.findFirst.mockResolvedValue(loadWithStops);

      await expect(service.updateStopStatus('LOAD-LD-001', 999, 'ARRIVED', 'user-1', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for invalid transition', async () => {
      prisma.load.findFirst.mockResolvedValue(loadWithStops);

      await expect(
        service.updateStopStatus(
          'LOAD-LD-001',
          10,
          'COMPLETED', // can't go from pending to completed
          'user-1',
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should auto-transition load to in_transit when pickup completed on assigned load', async () => {
      const assignedLoadWithStops = {
        ...loadWithStops,
        status: 'ASSIGNED',
        stops: [
          {
            ...loadWithStops.stops[0],
            status: 'IN_PROGRESS',
            arrivedAt: new Date(Date.now() - 60_000),
          },
          loadWithStops.stops[1],
        ],
      };
      prisma.load.findFirst
        .mockResolvedValueOnce(assignedLoadWithStops) // main load query
        .mockResolvedValueOnce(null); // driverInTransit check in transaction
      prisma.loadStop.update.mockResolvedValue({});
      prisma.load.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.updateStopStatus('LOAD-LD-001', 10, 'COMPLETED', 'user-1', 1);

      expect(result.status).toBe('COMPLETED');
      // The auto-transition should call load.updateMany with status in WHERE for atomicity
      expect(prisma.load.updateMany).toHaveBeenCalledWith({
        where: { id: 1, status: 'ASSIGNED' },
        data: { status: 'IN_TRANSIT', inTransitAt: expect.any(Date) },
      });
    });
  });

  // ─── assignAllLegs ──────────────────────────────────────────

  describe('assignAllLegs', () => {
    it('should throw NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.assignAllLegs('LD-1', [], 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when load is not relay', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: false,
        status: 'PENDING',
      });

      await expect(service.assignAllLegs('LD-1', [], 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when load is in wrong status', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: true,
        status: 'DELIVERED',
      });

      await expect(service.assignAllLegs('LD-1', [], 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw if legId does not belong to load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: true,
        status: 'PENDING',
      });
      prisma.loadLeg = { findMany: jest.fn().mockResolvedValue([]) };

      await expect(service.assignAllLegs('LD-1', [{ legId: 'BAD-LEG', driverId: 'DRV-1' }], 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if driverId not found in tenant', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: true,
        status: 'PENDING',
      });
      prisma.loadLeg = {
        findMany: jest.fn().mockResolvedValue([{ legId: 'LEG-1', sequence: 1, status: 'PENDING' }]),
      };
      prisma.driver.findFirst.mockResolvedValue(null);
      prisma.driver.findMany = jest.fn().mockResolvedValue([]);

      await expect(service.assignAllLegs('LD-1', [{ legId: 'LEG-1', driverId: 'DRV-NOPE' }], 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if same driver assigned to consecutive legs', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: true,
        status: 'PENDING',
      });
      prisma.loadLeg = {
        findMany: jest.fn().mockResolvedValue([
          { legId: 'LEG-1', sequence: 1, status: 'PENDING' },
          { legId: 'LEG-2', sequence: 2, status: 'PENDING' },
        ]),
      };
      prisma.driver.findMany = jest.fn().mockResolvedValue([{ driverId: 'DRV-1' }]);

      await expect(
        service.assignAllLegs(
          'LD-1',
          [
            { legId: 'LEG-1', driverId: 'DRV-1' },
            { legId: 'LEG-2', driverId: 'DRV-1' },
          ],
          1,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should assign all legs and return refreshed load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 1,
        isRelay: true,
        status: 'PENDING',
      });
      prisma.loadLeg = {
        findMany: jest.fn().mockResolvedValue([
          { legId: 'LEG-1', sequence: 1, status: 'PENDING' },
          { legId: 'LEG-2', sequence: 2, status: 'PENDING' },
        ]),
      };
      prisma.driver.findMany = jest.fn().mockResolvedValue([{ driverId: 'DRV-1' }, { driverId: 'DRV-2' }]);
      loadLegService.assignLeg = jest.fn().mockResolvedValue({});
      // findOne mock for refreshed load
      prisma.load.findFirst.mockResolvedValueOnce({
        id: 1,
        isRelay: true,
        status: 'PENDING',
      });
      // Second call to findFirst is within findOne
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        loadNumber: 'LD-1',
        stops: [],
        driver: null,
        vehicle: null,
        trip: null,
        legs: [],
        routePlanLoads: [],
        moneyCode: [],
        settlementLineItems: [],
        isRelay: true,
        billingStatus: null,
        requiredEquipmentType: null,
      });

      const result = await service.assignAllLegs(
        'LD-1',
        [
          { legId: 'LEG-1', driverId: 'DRV-1' },
          { legId: 'LEG-2', driverId: 'DRV-2' },
        ],
        1,
      );

      expect(loadLegService.assignLeg).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
    });
  });

  // ─── createFromCustomerRequest ─────────────────────────────

  describe('createFromCustomerRequest', () => {
    let stopIdCounter: number;

    beforeEach(() => {
      stopIdCounter = 100;
      // Each findOrCreate call returns a unique stop
      stopsService.findOrCreate = jest.fn().mockImplementation(() => {
        const id = stopIdCounter++;
        return Promise.resolve({
          stop: {
            id,
            stopId: `STOP-${id}`,
            name: `Stop ${id}`,
            lat: 32.7,
            lon: -96.8,
          },
          isNew: true,
        });
      });
      prisma.stop.findFirst.mockResolvedValue(null);
      prisma.load.create.mockResolvedValue({ ...baseMockLoad, id: 1 });
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
        tenant: { tenantId: 'tenant-abc' },
      });
      prisma.load.update.mockResolvedValue(baseMockLoad);
      prisma.loadStop.findMany.mockResolvedValue([]);
    });

    it('should create a draft load from customer portal data', async () => {
      await service.createFromCustomerRequest({
        tenantId: 1,
        customerId: 10,
        customerName: 'Customer Corp',
        pickupAddress: '123 Main St',
        pickupCity: 'Chicago',
        pickupState: 'IL',
        deliveryAddress: '456 Oak Ave',
        deliveryCity: 'Dallas',
        deliveryState: 'TX',
        weightLbs: 30000,
      });

      expect(prisma.load.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            intakeSource: 'portal',
            status: 'DRAFT',
            commodityType: 'general',
          }),
        }),
      );
    });

    it('should use provided equipment type and notes', async () => {
      await service.createFromCustomerRequest({
        tenantId: 1,
        customerId: 10,
        customerName: 'Customer Corp',
        pickupAddress: '123 Main St',
        pickupCity: 'Chicago',
        pickupState: 'IL',
        deliveryAddress: '456 Oak Ave',
        deliveryCity: 'Dallas',
        deliveryState: 'TX',
        weightLbs: 30000,
        commodityType: 'frozen',
        notes: 'Keep at -10F',
      });

      expect(prisma.load.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            commodityType: 'frozen',
            specialRequirements: 'Keep at -10F',
          }),
        }),
      );
    });
  });

  // ─── create edge cases ──────────────────────────────────────

  describe('create edge cases', () => {
    beforeEach(() => {
      prisma.load.create.mockResolvedValue({ ...baseMockLoad, id: 1 });
      prisma.load.update.mockResolvedValue(baseMockLoad);
      prisma.load.findUnique.mockResolvedValue({
        ...baseMockLoad,
        stops: [],
        tenant: { tenantId: 'tenant-abc' },
      });
      prisma.loadStop.findMany.mockResolvedValue([]);
    });

    it('should throw BadRequestException when customerId is missing for manual creation', async () => {
      await expect(
        service.create({
          tenantId: 1,
          weightLbs: 40000,
          commodityType: 'dry_goods',
          customerName: 'ACME',
          stops: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow missing customerId for import intake source', async () => {
      prisma.stop.findFirst.mockResolvedValue(null);

      await service.create({
        tenantId: 1,
        weightLbs: 40000,
        commodityType: 'dry_goods',
        customerName: 'ACME',
        intakeSource: 'import',
        stops: [],
      });

      expect(prisma.load.create).toHaveBeenCalled();
    });

    it('should allow missing customerId for recurring_lane intake source', async () => {
      await service.create({
        tenantId: 1,
        weightLbs: 40000,
        commodityType: 'dry_goods',
        customerName: 'ACME',
        intakeSource: 'recurring_lane',
        stops: [],
      });

      expect(prisma.load.create).toHaveBeenCalled();
    });

    it('should allow missing customerId for email intake source', async () => {
      await service.create({
        tenantId: 1,
        weightLbs: 40000,
        commodityType: 'dry_goods',
        customerName: 'ACME',
        intakeSource: 'email',
        stops: [],
      });

      expect(prisma.load.create).toHaveBeenCalled();
    });
  });

  // ─── findOne caching ──────────────────────────────────────

  describe('findOne caching', () => {
    it('should use cache for non-editable loads when tenantId provided', async () => {
      // First call for status check returns in_transit (non-editable)
      prisma.load.findFirst.mockResolvedValueOnce({ status: 'IN_TRANSIT' }).mockResolvedValueOnce({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        stops: [],
      });

      await service.findOne('LOAD-LD-20260223-001', 5);

      // Should have called findFirst twice (status check + computeFindOne from cache miss)
      expect(prisma.load.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should skip cache for draft loads', async () => {
      prisma.load.findFirst.mockResolvedValueOnce({ status: 'DRAFT' }).mockResolvedValueOnce({
        ...baseMockLoad,
        status: 'DRAFT',
        stops: [],
      });

      await service.findOne('LOAD-LD-20260223-001', 5);

      expect(prisma.load.findFirst).toHaveBeenCalledTimes(2);
    });

    it('should skip cache for pending loads', async () => {
      prisma.load.findFirst.mockResolvedValueOnce({ status: 'PENDING' }).mockResolvedValueOnce({
        ...baseMockLoad,
        status: 'PENDING',
        stops: [],
      });

      await service.findOne('LOAD-LD-20260223-001', 5);

      expect(prisma.load.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  // ─── findAll with comma-separated statuses ─────────────────

  describe('findAll with comma-separated statuses', () => {
    it('should split comma-separated status into IN filter', async () => {
      prisma.load.findMany.mockResolvedValue([]);
      prisma.load.count.mockResolvedValue(0);

      await service.findAll(1, { status: 'PENDING,ASSIGNED,IN_TRANSIT' });

      const callArgs = prisma.load.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toEqual({
        in: ['PENDING', 'ASSIGNED', 'IN_TRANSIT'],
      });
    });
  });

  // ─── updateStatus: delivered with no existing linehaul ──────

  describe('updateStatus delivered linehaul creation', () => {
    it('should auto-create linehaul charge when delivered and no existing charge', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        status: 'IN_TRANSIT',
        driverId: 1,
        vehicleId: 1,
        rateCents: 250000,
      });
      prisma.loadStop.updateMany.mockResolvedValue({ count: 0 });
      prisma.loadCharge.findFirst.mockResolvedValue(null); // no existing linehaul
      prisma.loadCharge.create.mockResolvedValue({ id: 1 });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
      });
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.vehicle.findUnique.mockResolvedValue(null);

      await service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED');

      // Charge is now created via the shared LoadLegService.applyDeliverySideEffects
      // helper (prisma.loadCharge.create), not LoadChargesService.addCharge — single
      // source of truth shared with the relay path. (SQ-114)
      expect(prisma.loadCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loadId: 1,
            chargeType: 'linehaul',
            unitPriceCents: 250000,
          }),
        }),
      );
    });
  });

  // ─── updateStatus: syncVehicleStatusAfterLoadTerminal ──────

  describe('updateStatus vehicle sync on terminal states', () => {
    it('should sync vehicle ASSIGNED → AVAILABLE when no active loads remain', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'IN_TRANSIT',
        driverId: 1,
        vehicleId: 5,
      });
      prisma.loadStop.updateMany.mockResolvedValue({ count: 0 });
      prisma.loadCharge.findFirst.mockResolvedValue({ id: 1 });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
      });
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 5,
        vehicleId: 'VEH-001',
        status: 'ASSIGNED',
      });
      prisma.load.count.mockResolvedValue(0); // no active loads

      await service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED');

      // Wait for fire-and-forget to complete
      await new Promise((r) => setTimeout(r, 50));

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { status: 'AVAILABLE' },
      });
    });
  });

  // ─── deleteLoad with tripId ──────────────────────────────

  describe('deleteLoad with tripId', () => {
    it('should reject deleting a load that is part of a trip', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'DRAFT',
        tripId: 42,
      });

      await expect(service.deleteLoad('LOAD-LD-20260223-001', 1)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── assignLoad edge cases ─────────────────────────────────

  describe('assignLoad edge cases', () => {
    it('should reject assignment when load is in a trip', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
        tripId: 42,
      });

      await expect(service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should delegate relay load assignment to loadLegService', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'PENDING',
        isRelay: true,
      });
      prisma.loadLeg.findMany.mockResolvedValue([{ legId: 'LEG-1', sequence: 1, status: 'PENDING' }]);
      loadLegService.assignLeg = jest.fn().mockResolvedValue({
        success: true,
        legId: 'LEG-1',
      });

      await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001');

      expect(loadLegService.assignLeg).toHaveBeenCalledWith('LEG-1', 'DRV-001', 'VEH-001', 1, undefined);
    });

    it('should throw when relay load has no assignable legs', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'PENDING',
        isRelay: true,
      });
      prisma.loadLeg.findMany.mockResolvedValue([{ legId: 'LEG-1', sequence: 1, status: 'DELIVERED' }]);

      await expect(service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw when vehicle not found', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001')).rejects.toThrow(NotFoundException);
    });

    it('should resolve explicit trailer by trailerId', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
        tenantId: 1,
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
        currentTrailer: null,
      });
      prisma.trailer.findFirst.mockResolvedValue({
        id: 10,
        trailerId: 'TRL-001',
        unitNumber: 'TRL-1',
        equipmentType: 'DRY_VAN',
        status: 'AVAILABLE',
      });
      prisma.load.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue({});
      prisma.trailer.update.mockResolvedValue({});
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);
      prisma.driverUnavailability.findFirst.mockResolvedValue(null);
      prisma.vehicleUnavailability.findFirst.mockResolvedValue(null);

      const result = (await service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001', 'TRL-001')) as any;

      expect(result.trailerId).toBe('TRL-001');
      expect(prisma.trailer.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'ASSIGNED' },
      });
    });

    it('should throw when explicit trailer not found', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        status: 'PENDING',
        tenantId: 1,
      });
      prisma.driver.findFirst.mockResolvedValue({
        id: 1,
        driverId: 'DRV-001',
        name: 'John',
      });
      prisma.vehicle.findFirst.mockResolvedValue({
        id: 2,
        vehicleId: 'VEH-001',
        unitNumber: 'TRK-42',
        status: 'AVAILABLE',
        currentTrailer: null,
      });
      prisma.trailer.findFirst.mockResolvedValue(null);

      await expect(service.assignLoad('LOAD-LD-20260223-001', 'DRV-001', 'VEH-001', 'TRL-BAD')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── updateDraft with customFieldValues ────────────────────

  describe('updateDraft with customFieldValues', () => {
    it('should validate and store custom field values', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        status: 'DRAFT',
      });
      prisma.load.findUnique.mockResolvedValue({
        customFieldValues: {},
      });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
      });
      prisma.load.findUnique.mockResolvedValueOnce({ customFieldValues: {} }).mockResolvedValueOnce({
        ...baseMockLoad,
        id: 1,
        tenantId: 1,
        stops: [],
        trip: null,
        driver: null,
        vehicle: null,
        billingStatus: null,
        requiredEquipmentType: null,
      });

      await service.updateDraft('LOAD-LD-20260223-001', {
        customFieldValues: { field1: 'value1' },
      });

      expect(prisma.load.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customFieldValues: expect.any(Object),
          }),
        }),
      );
    });
  });

  // ─── findOneForCustomer exchange stop filtering ────────────

  describe('findOneForCustomer', () => {
    it('should filter out exchange stops', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        customerId: 10,
        stops: [
          {
            id: 1,
            sequenceOrder: 1,
            actionType: 'pickup',
            stop: { name: 'Origin', city: 'Dallas', state: 'TX' },
          },
          {
            id: 2,
            sequenceOrder: 2,
            actionType: 'exchange',
            stop: { name: 'Relay Point', city: 'OKC', state: 'OK' },
          },
          {
            id: 3,
            sequenceOrder: 3,
            actionType: 'delivery',
            stop: { name: 'Dest', city: 'Chicago', state: 'IL' },
          },
        ],
      });

      const result = await service.findOneForCustomer('LOAD-LD-20260223-001', 10);

      // Exchange stops should be filtered out
      expect(result.stops).toHaveLength(2);
      expect(result.stops.every((s: any) => s.actionType !== 'exchange')).toBe(true);
    });
  });

  // ─── derivePayStatus ───────────────────────────────────────

  describe('findAll payStatus derivation', () => {
    it('should derive payStatus as paid when all settlements are PAID', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          settlementLineItems: [
            {
              payAmountCents: 100000,
              settlement: { status: 'PAID', paidAt: new Date() },
            },
          ],
          stops: [],
          routePlanLoads: [],
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(result.data[0].payStatus).toBe('paid');
    });

    it('should derive payStatus as approved when some are APPROVED', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          settlementLineItems: [
            {
              payAmountCents: 100000,
              settlement: { status: 'APPROVED', paidAt: null },
            },
            {
              payAmountCents: 50000,
              settlement: { status: 'DRAFT', paidAt: null },
            },
          ],
          stops: [],
          routePlanLoads: [],
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(result.data[0].payStatus).toBe('approved');
    });

    it('should derive payStatus as pending when all are DRAFT', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          settlementLineItems: [
            {
              payAmountCents: 100000,
              settlement: { status: 'DRAFT', paidAt: null },
            },
          ],
          stops: [],
          routePlanLoads: [],
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      // payStatus is a derived UI label (lowercase), not a DB column status.
      expect(result.data[0].payStatus).toBe('pending');
    });

    it('should derive payStatus as null when no settlement items', async () => {
      prisma.load.findMany.mockResolvedValue([
        {
          ...baseMockLoad,
          settlementLineItems: [],
          stops: [],
          routePlanLoads: [],
        },
      ]);
      prisma.load.count.mockResolvedValue(1);

      const result = await service.findAll(1);

      expect(result.data[0].payStatus).toBeNull();
    });
  });

  // ─── updateStatus: completeRoutePlanIfTerminal ──────────────

  describe('updateStatus route plan completion', () => {
    it('should complete route plan when all loads are terminal', async () => {
      prisma.load.findFirst.mockResolvedValue({
        ...baseMockLoad,
        id: 1,
        status: 'IN_TRANSIT',
        driverId: 1,
        vehicleId: 1,
        rateCents: 320000,
      });
      prisma.loadStop.updateMany.mockResolvedValue({ count: 0 });
      prisma.loadCharge.findFirst.mockResolvedValue({ id: 1 });
      prisma.load.update.mockResolvedValue({
        ...baseMockLoad,
        status: 'DELIVERED',
        billingStatus: 'PENDING_DOCUMENTS',
        stops: [],
      });
      prisma.vehicle.findUnique.mockResolvedValue(null);

      // completeRoutePlanIfTerminal: plan found with all loads terminal
      prisma.routePlanLoad.findFirst.mockResolvedValue({
        loadId: 1,
        plan: {
          id: 100,
          planId: 'PLAN-1',
          tenantId: 1,
          loads: [
            {
              loadId: 1,
              load: { status: 'DELIVERED', loadNumber: 'LD-20260223-001' },
            },
          ],
          segments: [],
        },
      });
      prisma.routePlan.update.mockResolvedValue({});
      prisma.routeSegment.updateMany.mockResolvedValue({});
      prisma.alert.updateMany.mockResolvedValue({});

      await service.updateStatus('LOAD-LD-20260223-001', 'DELIVERED');

      expect(prisma.routePlan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
            isActive: false,
          }),
        }),
      );
    });
  });

  // ─── updateStopStatus: auto-deliver ─────────────────────────

  describe('updateStopStatus auto-deliver', () => {
    it('should auto-deliver when last delivery stop is completed', async () => {
      const loadForAutoDeliver = {
        ...baseMockLoad,
        id: 1,
        loadNumber: 'LD-001',
        status: 'IN_TRANSIT',
        driverId: 5,
        vehicleId: 3,
        rateCents: 200000,
        tenantId: 1,
        stops: [
          {
            id: 10,
            sequenceOrder: 1,
            actionType: 'pickup',
            status: 'COMPLETED',
            arrivedAt: new Date(Date.now() - 7200000),
            loadingStartedAt: new Date(Date.now() - 3600000),
            completedAt: new Date(Date.now() - 1800000),
            detentionMinutes: null,
          },
          {
            id: 11,
            sequenceOrder: 2,
            actionType: 'delivery',
            status: 'IN_PROGRESS',
            arrivedAt: new Date(Date.now() - 600000),
            loadingStartedAt: new Date(Date.now() - 300000),
            completedAt: null,
            detentionMinutes: null,
          },
        ],
      };

      prisma.load.findFirst.mockResolvedValue(loadForAutoDeliver);
      prisma.loadStop.update.mockResolvedValue({});

      // Inside auto-deliver transaction
      prisma.load.findUnique.mockResolvedValue({ status: 'IN_TRANSIT' });
      prisma.loadStop.count.mockResolvedValue(0); // no incomplete stops besides current
      prisma.load.update.mockResolvedValue({
        ...loadForAutoDeliver,
        status: 'DELIVERED',
      });

      // For linehaul charge check after auto-deliver
      prisma.loadCharge.findFirst.mockResolvedValue(null); // no existing charge
      prisma.vehicle.findUnique.mockResolvedValue(null);

      const result = await service.updateStopStatus('LOAD-LD-001', 11, 'COMPLETED', 'user-1', 1);

      expect(result.status).toBe('COMPLETED');
      // Should have auto-created linehaul charge
      expect(loadChargesService.addCharge).toHaveBeenCalledWith(
        expect.objectContaining({
          loadId: 1,
          chargeType: 'linehaul',
          unitPriceCents: 200000,
        }),
      );
    });
  });
});
