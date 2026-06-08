import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { LoadLegService } from '../load-leg.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';

describe('LoadLegService', () => {
  let service: LoadLegService;
  let prisma: any;
  let eventEmitter: any;
  let cache: any;

  // Shared transaction mock — each test can override as needed
  let txMock: any;

  const buildTxMock = (overrides: any = {}) => ({
    load: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    loadLeg: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      count: jest.fn(),
    },
    loadStop: {
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    loadCharge: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    driver: { findFirst: jest.fn() },
    vehicle: { findFirst: jest.fn() },
    trailer: { findFirst: jest.fn(), update: jest.fn() },
    routePlan: { findUnique: jest.fn(), update: jest.fn() },
    ...overrides,
  });

  beforeEach(async () => {
    txMock = buildTxMock();

    prisma = {
      $transaction: jest.fn((cb: any) => cb(txMock)),
      load: { findFirst: jest.fn() },
      loadLeg: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
      loadStop: { findMany: jest.fn() },
      routePlanLoad: { findFirst: jest.fn() },
    };
    eventEmitter = { emit: jest.fn() };
    cache = { del: jest.fn().mockResolvedValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoadLegService,
        { provide: PrismaService, useValue: prisma },
        { provide: DomainEventService, useValue: eventEmitter },
        { provide: SallyCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<LoadLegService>(LoadLegService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // PURE FUNCTIONS — no mocking needed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('deriveLoadStatus (static)', () => {
    it('returns pending for empty legs', () => {
      expect(LoadLegService.deriveLoadStatus([])).toBe('PENDING');
    });

    it('returns cancelled when all legs are cancelled', () => {
      const legs = [{ status: 'CANCELLED' }, { status: 'CANCELLED' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('CANCELLED');
    });

    it('returns delivered when all non-cancelled legs are delivered', () => {
      const legs = [{ status: 'DELIVERED' }, { status: 'DELIVERED' }, { status: 'CANCELLED' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('DELIVERED');
    });

    it('returns on_hold when any leg is on_hold', () => {
      const legs = [{ status: 'ASSIGNED' }, { status: 'ON_HOLD' }, { status: 'DELIVERED' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('ON_HOLD');
    });

    it('returns in_transit when any leg is in_transit', () => {
      const legs = [{ status: 'DELIVERED' }, { status: 'IN_TRANSIT' }, { status: 'PENDING' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('IN_TRANSIT');
    });

    it('returns assigned when any leg is assigned', () => {
      const legs = [{ status: 'ASSIGNED' }, { status: 'PENDING' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('ASSIGNED');
    });

    it('returns pending when all non-cancelled legs are pending', () => {
      const legs = [{ status: 'PENDING' }, { status: 'PENDING' }, { status: 'CANCELLED' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('PENDING');
    });

    it('prioritizes on_hold over in_transit', () => {
      const legs = [{ status: 'IN_TRANSIT' }, { status: 'ON_HOLD' }];
      expect(LoadLegService.deriveLoadStatus(legs)).toBe('ON_HOLD');
    });
  });

  describe('getActiveLeg (static)', () => {
    it('returns null for empty legs', () => {
      expect(LoadLegService.getActiveLeg([])).toBeNull();
    });

    it('returns first non-delivered non-cancelled leg by sequence', () => {
      const legs = [
        { status: 'DELIVERED', sequence: 1 },
        { status: 'IN_TRANSIT', sequence: 2 },
        { status: 'PENDING', sequence: 3 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toEqual(legs[1]);
    });

    it('returns null when all legs are delivered or cancelled', () => {
      const legs = [
        { status: 'DELIVERED', sequence: 1 },
        { status: 'CANCELLED', sequence: 2 },
      ];
      expect(LoadLegService.getActiveLeg(legs)).toBeNull();
    });

    it('sorts by sequence before finding active', () => {
      const legs = [
        { status: 'PENDING', sequence: 3 },
        { status: 'ASSIGNED', sequence: 1 },
        { status: 'PENDING', sequence: 2 },
      ];
      const active = LoadLegService.getActiveLeg(legs);
      expect(active.sequence).toBe(1);
    });
  });

  describe('validateLegTransition (static)', () => {
    it.each([
      ['PENDING', 'ASSIGNED', true],
      ['PENDING', 'CANCELLED', true],
      ['ASSIGNED', 'IN_TRANSIT', true],
      ['ASSIGNED', 'PENDING', true],
      ['ASSIGNED', 'ON_HOLD', true],
      ['ASSIGNED', 'CANCELLED', true],
      ['IN_TRANSIT', 'DELIVERED', true],
      ['IN_TRANSIT', 'ASSIGNED', true],
      ['IN_TRANSIT', 'ON_HOLD', true],
      ['IN_TRANSIT', 'CANCELLED', true],
      ['ON_HOLD', 'ASSIGNED', true],
      ['ON_HOLD', 'PENDING', true],
      ['ON_HOLD', 'CANCELLED', true],
      ['DELIVERED', 'PENDING', false],
      ['DELIVERED', 'IN_TRANSIT', false],
      ['CANCELLED', 'PENDING', false],
      ['CANCELLED', 'ASSIGNED', false],
      ['PENDING', 'DELIVERED', false],
      ['PENDING', 'IN_TRANSIT', false],
    ])('%s -> %s = %s', (from, to, expected) => {
      expect(LoadLegService.validateLegTransition(from, to)).toBe(expected);
    });

    it('returns false for unknown status', () => {
      expect(LoadLegService.validateLegTransition('unknown', 'PENDING')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createLegsFromExchangePoints
  // ═══════════════════════════════════════════════════════════════════════════

  describe('createLegsFromExchangePoints', () => {
    const makeStop = (id: number, seq: number, actionType: string) => ({
      id,
      sequenceOrder: seq,
      actionType,
    });

    it('creates legs from exchange points on a relay load', async () => {
      const stops = [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')];
      // Validation queries run on this.prisma (not tx)
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'LD-001',
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]); // no existing legs
      // Transaction queries run on tx
      txMock.loadLeg.deleteMany.mockResolvedValue({ count: 0 });
      txMock.loadStop.update.mockResolvedValue({});
      txMock.loadLeg.create.mockImplementation((args: any) => ({
        id: args.data.sequence,
        legId: args.data.legId,
        sequence: args.data.sequence,
        ...args.data,
      }));

      const result = await service.createLegsFromExchangePoints(10, [101], 1);

      expect(result).toHaveLength(2);
      expect(txMock.loadLeg.create).toHaveBeenCalledTimes(2);
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('throws NotFoundException if load does not exist', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.createLegsFromExchangePoints(999, [101], 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if load is not a relay', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: false,
        status: 'DRAFT',
        stops: [],
      });

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException if load is not in draft/pending', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'IN_TRANSIT',
        stops: [],
      });

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if existing legs have drivers or advanced status', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops: [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')],
      });
      prisma.loadLeg.findMany.mockResolvedValue([{ status: 'ASSIGNED', driverId: 5 }]);

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if load has fewer than 2 stops', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops: [makeStop(100, 1, 'pickup')],
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if exchange stop does not belong to the load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops: [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')],
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [999], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if exchange stop is the first stop', async () => {
      const stops = [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [100], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if exchange stop is the last stop', async () => {
      const stops = [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [102], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if first stop is not a pickup', async () => {
      const stops = [makeStop(100, 1, 'delivery'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if last stop is not a delivery', async () => {
      const stops = [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'pickup')];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [101], 1)).rejects.toThrow(BadRequestException);
    });

    it('throws if adjacent exchange stops exist', async () => {
      const stops = [
        makeStop(100, 1, 'pickup'),
        makeStop(101, 2, 'exchange'),
        makeStop(103, 3, 'exchange'),
        makeStop(102, 4, 'delivery'),
      ];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([]);

      await expect(service.createLegsFromExchangePoints(10, [101, 103], 1)).rejects.toThrow(BadRequestException);
    });

    it('re-creates legs when all existing are pending with no driver', async () => {
      const stops = [makeStop(100, 1, 'pickup'), makeStop(101, 2, 'exchange'), makeStop(102, 3, 'delivery')];
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'LD-001',
        isRelay: true,
        status: 'DRAFT',
        stops,
      });
      prisma.loadLeg.findMany.mockResolvedValue([{ status: 'PENDING', driverId: null }]);
      txMock.loadLeg.deleteMany.mockResolvedValue({ count: 1 });
      txMock.loadStop.update.mockResolvedValue({});
      txMock.loadLeg.create.mockImplementation((args: any) => ({
        ...args.data,
        id: args.data.sequence,
      }));

      const result = await service.createLegsFromExchangePoints(10, [101], 1);
      expect(result).toHaveLength(2);
      expect(txMock.loadLeg.deleteMany).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // assignLeg
  // ═══════════════════════════════════════════════════════════════════════════

  describe('assignLeg', () => {
    const baseLeg = {
      id: 1,
      legId: 'LEG-001-1',
      loadId: 10,
      sequence: 1,
      status: 'PENDING',
      driverId: null,
      vehicleId: null,
      load: { loadNumber: 'LD-001', requiredEquipmentType: null },
    };

    it('assigns driver and vehicle to a pending leg', async () => {
      // Chain: findFirst called 3 times in assignLeg tx:
      // 1) leg lookup, 2) in-transit leg check, 3) prev leg vehicle default (skipped because seq=1)
      txMock.loadLeg.findFirst
        .mockResolvedValueOnce({ ...baseLeg }) // 1: the leg
        .mockResolvedValueOnce(null); // 2: no in-transit leg
      txMock.driver.findFirst.mockResolvedValue({ id: 5, driverId: 'DRV-1' });
      txMock.load.findFirst = jest.fn().mockResolvedValue(null); // no in-transit load
      txMock.vehicle.findFirst.mockResolvedValue({
        id: 3,
        vehicleId: 'VEH-1',
        currentTrailer: null,
      });
      // Adjacent legs check then syncLoadFromLegs
      txMock.loadLeg.findMany
        .mockResolvedValueOnce([]) // adjacent legs: none
        .mockResolvedValueOnce([
          // syncLoadFromLegs
          {
            status: 'ASSIGNED',
            sequence: 1,
            driverId: 5,
            vehicleId: 3,
            assignedAt: new Date(),
          },
        ]);
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'ASSIGNED',
        driverId: 5,
        vehicleId: 3,
        loadId: 10,
      });
      txMock.load.update.mockResolvedValue({});

      const result = await service.assignLeg('LEG-001-1', 'DRV-1', 'VEH-1', 1);

      expect(result.status).toBe('ASSIGNED');
      expect(cache.del).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('throws NotFoundException when leg not found', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue(null);

      await expect(service.assignLeg('BAD-LEG', 'DRV-1', 'VEH-1', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when leg is in terminal status', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({
        ...baseLeg,
        status: 'DELIVERED',
      });

      await expect(service.assignLeg('LEG-001-1', 'DRV-1', 'VEH-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when driver not found', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({ ...baseLeg });
      txMock.driver.findFirst.mockResolvedValue(null);

      await expect(service.assignLeg('LEG-001-1', 'DRV-NOPE', 'VEH-1', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when driver has in-transit leg', async () => {
      txMock.loadLeg.findFirst
        .mockResolvedValueOnce({ ...baseLeg })
        .mockResolvedValueOnce({ id: 99, status: 'IN_TRANSIT' }); // in-transit leg
      txMock.driver.findFirst.mockResolvedValue({ id: 5, driverId: 'DRV-1' });
      txMock.load.findFirst = jest.fn().mockResolvedValue(null);

      await expect(service.assignLeg('LEG-001-1', 'DRV-1', 'VEH-1', 1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when vehicle not found', async () => {
      txMock.loadLeg.findFirst.mockResolvedValueOnce({ ...baseLeg }).mockResolvedValueOnce(null); // no in-transit leg
      txMock.driver.findFirst.mockResolvedValue({ id: 5, driverId: 'DRV-1' });
      txMock.load.findFirst = jest.fn().mockResolvedValue(null);
      txMock.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.assignLeg('LEG-001-1', 'DRV-1', 'VEH-1', 1)).rejects.toThrow(NotFoundException);
    });

    it('resolves trailer from explicit trailerId', async () => {
      txMock.loadLeg.findFirst
        .mockResolvedValueOnce({ ...baseLeg }) // the leg
        .mockResolvedValueOnce(null); // no in-transit leg
      txMock.driver.findFirst.mockResolvedValue({ id: 5, driverId: 'DRV-1' });
      txMock.load.findFirst = jest.fn().mockResolvedValue(null);
      txMock.vehicle.findFirst.mockResolvedValue({
        id: 3,
        vehicleId: 'VEH-1',
        currentTrailer: null,
      });
      txMock.trailer.findFirst.mockResolvedValue({
        id: 10,
        trailerId: 'TRL-1',
        equipmentType: 'DRY_VAN',
        status: 'AVAILABLE',
      });
      txMock.trailer.update.mockResolvedValue({});
      txMock.loadLeg.findMany
        .mockResolvedValueOnce([]) // adjacent legs
        .mockResolvedValueOnce([
          // syncLoadFromLegs
          {
            status: 'ASSIGNED',
            sequence: 1,
            driverId: 5,
            vehicleId: 3,
            assignedAt: new Date(),
          },
        ]);
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'ASSIGNED',
        driverId: 5,
        vehicleId: 3,
        trailerId: 10,
        loadId: 10,
      });
      txMock.load.update.mockResolvedValue({});

      const result = await service.assignLeg('LEG-001-1', 'DRV-1', 'VEH-1', 1, 'TRL-1');

      expect(result.trailerId).toBe(10);
      expect(txMock.trailer.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { status: 'ASSIGNED' },
      });
    });

    it('throws ConflictException when driver on adjacent leg', async () => {
      txMock.loadLeg.findFirst.mockResolvedValueOnce({ ...baseLeg, sequence: 2 }).mockResolvedValueOnce(null); // no in-transit leg
      txMock.driver.findFirst.mockResolvedValue({ id: 5, driverId: 'DRV-1' });
      txMock.load.findFirst = jest.fn().mockResolvedValue(null);
      txMock.vehicle.findFirst.mockResolvedValue({
        id: 3,
        vehicleId: 'VEH-1',
        currentTrailer: null,
      });
      txMock.loadLeg.findMany.mockResolvedValue([{ driverId: 5, legId: 'LEG-001-1', sequence: 1 }]);

      await expect(service.assignLeg('LEG-001-2', 'DRV-1', 'VEH-1', 1)).rejects.toThrow(ConflictException);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // advanceLegStatus
  // ═══════════════════════════════════════════════════════════════════════════

  describe('advanceLegStatus', () => {
    const baseLeg = {
      id: 1,
      legId: 'LEG-001-1',
      loadId: 10,
      sequence: 1,
      status: 'ASSIGNED',
      driverId: 5,
      vehicleId: 3,
      load: { loadNumber: 'LD-001' },
    };

    it('advances from assigned to in_transit', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({ ...baseLeg });
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'IN_TRANSIT',
        loadId: 10,
      });
      txMock.loadLeg.findMany.mockResolvedValue([
        {
          status: 'IN_TRANSIT',
          sequence: 1,
          driverId: 5,
          vehicleId: 3,
          pickedUpAt: new Date(),
        },
      ]);
      txMock.load.update.mockResolvedValue({});

      const result = await service.advanceLegStatus('LEG-001-1', 'IN_TRANSIT', 1);

      expect(result.status).toBe('IN_TRANSIT');
      expect(cache.del).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('throws NotFoundException when leg not found', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue(null);

      await expect(service.advanceLegStatus('BAD', 'IN_TRANSIT', 1)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for invalid transition', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({
        ...baseLeg,
        status: 'DELIVERED',
      });

      await expect(service.advanceLegStatus('LEG-001-1', 'IN_TRANSIT', 1)).rejects.toThrow(BadRequestException);
    });

    it('sets pickedUpAt for in_transit transition', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({ ...baseLeg });
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'IN_TRANSIT',
        loadId: 10,
      });
      txMock.loadLeg.findMany.mockResolvedValue([
        {
          status: 'IN_TRANSIT',
          sequence: 1,
          driverId: 5,
          vehicleId: 3,
          pickedUpAt: new Date(),
        },
      ]);
      txMock.load.update.mockResolvedValue({});

      await service.advanceLegStatus('LEG-001-1', 'IN_TRANSIT', 1);

      const updateCall = txMock.loadLeg.update.mock.calls[0][0];
      expect(updateCall.data.pickedUpAt).toBeInstanceOf(Date);
    });

    it('auto-activates next leg route plan on intermediate leg delivery', async () => {
      // Chain findFirst: 1) leg lookup, 2) next leg with route plan
      txMock.loadLeg.findFirst
        .mockResolvedValueOnce({
          ...baseLeg,
          status: 'IN_TRANSIT',
          sequence: 1,
        })
        .mockResolvedValueOnce({
          routePlanId: 42,
        });
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'DELIVERED',
        loadId: 10,
      });
      // allLegs: leg 1 (delivered) + leg 2 (assigned) - NOT final
      txMock.loadLeg.findMany
        .mockResolvedValueOnce([
          {
            status: 'DELIVERED',
            sequence: 1,
            driverId: 5,
            vehicleId: 3,
            deliveredAt: new Date(),
          },
          {
            status: 'ASSIGNED',
            sequence: 2,
            driverId: 6,
            vehicleId: 4,
            assignedAt: new Date(),
          },
        ])
        .mockResolvedValueOnce([
          // syncLoadFromLegs
          {
            status: 'DELIVERED',
            sequence: 1,
            driverId: 5,
            vehicleId: 3,
            deliveredAt: new Date(),
          },
          {
            status: 'ASSIGNED',
            sequence: 2,
            driverId: 6,
            vehicleId: 4,
            assignedAt: new Date(),
          },
        ]);
      txMock.routePlan.findUnique.mockResolvedValue({
        id: 42,
        planId: 'PLAN-2',
        status: 'DRAFT',
      });
      txMock.routePlan.update.mockResolvedValue({});
      txMock.load.update.mockResolvedValue({});

      await service.advanceLegStatus('LEG-001-1', 'DELIVERED', 1);

      expect(txMock.routePlan.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: expect.objectContaining({
          isActive: true,
          status: 'ACTIVE',
        }),
      });
    });

    it('sets deliveredAt for delivered transition', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({
        ...baseLeg,
        status: 'IN_TRANSIT',
      });
      txMock.loadLeg.update.mockResolvedValue({
        ...baseLeg,
        status: 'DELIVERED',
        loadId: 10,
      });
      txMock.loadLeg.findMany.mockResolvedValue([
        {
          status: 'DELIVERED',
          sequence: 1,
          driverId: 5,
          vehicleId: 3,
          deliveredAt: new Date(),
        },
      ]);
      txMock.load.update.mockResolvedValue({});

      await service.advanceLegStatus('LEG-001-1', 'DELIVERED', 1);

      const updateCall = txMock.loadLeg.update.mock.calls[0][0];
      expect(updateCall.data.deliveredAt).toBeInstanceOf(Date);
    });

    // SQ-114 regression: when the FINAL leg delivers (load now fully delivered),
    // the relay path must apply the same billing side-effects a single-driver load
    // gets — otherwise the relay load is DELIVERED with null billingStatus and never
    // reaches Close-Out.
    it('applies delivery side-effects when the final leg delivers the whole load', async () => {
      txMock.loadLeg.findFirst.mockResolvedValue({
        ...baseLeg,
        status: 'IN_TRANSIT',
        load: { id: 10, loadNumber: 'LD-001', billingStatus: null, rateCents: 250000 },
      });
      txMock.loadLeg.update.mockResolvedValue({ ...baseLeg, status: 'DELIVERED', loadId: 10 });
      // Single leg, now delivered → deriveLoadStatus = DELIVERED (final)
      txMock.loadLeg.findMany.mockResolvedValue([
        { status: 'DELIVERED', sequence: 1, driverId: 5, vehicleId: 3, deliveredAt: new Date() },
      ]);
      txMock.loadStop.updateMany.mockResolvedValue({ count: 2 });
      txMock.loadCharge.findFirst.mockResolvedValue(null); // no existing linehaul
      txMock.loadCharge.create.mockResolvedValue({ id: 1 });
      txMock.load.update.mockResolvedValue({});

      await service.advanceLegStatus('LEG-001-1', 'DELIVERED', 1);

      // billingStatus opened
      expect(txMock.load.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ billingStatus: 'PENDING_DOCUMENTS' }) }),
      );
      // stops completed
      expect(txMock.loadStop.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { loadId: 10, status: { not: 'COMPLETED' } } }),
      );
      // linehaul charge created (via tx, inside the transaction)
      expect(txMock.loadCharge.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ loadId: 10, chargeType: 'linehaul', unitPriceCents: 250000 }),
        }),
      );
    });

    it('does NOT apply delivery side-effects on an INTERMEDIATE leg delivery', async () => {
      txMock.loadLeg.findFirst
        .mockResolvedValueOnce({
          ...baseLeg,
          status: 'IN_TRANSIT',
          load: { id: 10, loadNumber: 'LD-001', billingStatus: null, rateCents: 250000 },
        })
        .mockResolvedValueOnce({ routePlanId: 42 }); // next leg lookup
      txMock.loadLeg.update.mockResolvedValue({ ...baseLeg, status: 'DELIVERED', loadId: 10 });
      // Leg 1 delivered, leg 2 still assigned → load NOT fully delivered
      txMock.loadLeg.findMany.mockResolvedValue([
        { status: 'DELIVERED', sequence: 1, driverId: 5, vehicleId: 3, deliveredAt: new Date() },
        { status: 'ASSIGNED', sequence: 2, driverId: 6, vehicleId: 4, assignedAt: new Date() },
      ]);
      txMock.routePlan.findUnique.mockResolvedValue({ id: 42, planId: 'PLAN-2', status: 'DRAFT' });
      txMock.routePlan.update.mockResolvedValue({});
      txMock.load.update.mockResolvedValue({});

      await service.advanceLegStatus('LEG-001-1', 'DELIVERED', 1);

      expect(txMock.loadCharge.create).not.toHaveBeenCalled();
      const billingUpdates = txMock.load.update.mock.calls.filter(
        (c: any) => c[0]?.data && 'billingStatus' in c[0].data,
      );
      expect(billingUpdates).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getDispatchSheet
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getDispatchSheet', () => {
    it('returns dispatch sheet data for a leg', async () => {
      const leg = {
        legId: 'LEG-001-1',
        sequence: 1,
        status: 'ASSIGNED',
        loadId: 10,
        load: {
          loadNumber: 'LD-001',
          referenceNumber: 'REF-1',
          commodityType: 'General',
          weightLbs: 40000,
          equipmentType: 'DRY_VAN',
          requiredEquipmentType: null,
          specialRequirements: null,
          customerName: 'ACME',
          pieces: 10,
          hazmatClass: null,
          minTempF: null,
          maxTempF: null,
        },
        driver: { driverId: 'DRV-1', name: 'John', phone: '555-1234' },
        vehicle: {
          vehicleId: 'VEH-1',
          unitNumber: '101',
          make: 'Freightliner',
          model: 'Cascadia',
        },
        originStop: {
          id: 100,
          sequenceOrder: 1,
          stop: {
            name: 'Origin',
            address: '123 Main',
            city: 'Dallas',
            state: 'TX',
            zipCode: '75201',
            lat: 32.7,
            lon: -96.8,
          },
        },
        destStop: {
          id: 101,
          sequenceOrder: 2,
          stop: {
            name: 'Dest',
            address: '456 Oak',
            city: 'Chicago',
            state: 'IL',
            zipCode: '60601',
            lat: 41.8,
            lon: -87.6,
          },
        },
        routePlan: {
          planId: 'PLAN-1',
          totalDistanceMiles: 920,
          totalDriveTimeHours: 14.5,
          departureTime: new Date('2026-04-10T08:00:00Z'),
          estimatedArrival: new Date('2026-04-10T22:30:00Z'),
        },
      };

      prisma.loadLeg.findFirst.mockResolvedValue(leg);
      prisma.loadLeg.count.mockResolvedValue(2);
      prisma.loadStop.findMany.mockResolvedValue([
        {
          sequenceOrder: 1,
          actionType: 'pickup',
          stop: {
            name: 'Origin',
            address: '123 Main',
            city: 'Dallas',
            state: 'TX',
            zipCode: '75201',
          },
          appointmentDate: null,
          earliestArrival: null,
          latestArrival: null,
          estimatedDockHours: null,
          dispatcherNotes: null,
          facilityContactName: null,
          facilityContactPhone: null,
          bolNumber: null,
        },
      ]);

      const result = await service.getDispatchSheet('LEG-001-1', 1);

      expect(result.legId).toBe('LEG-001-1');
      expect(result.legSequence).toBe(1);
      expect(result.totalLegs).toBe(2);
      expect(result.loadNumber).toBe('LD-001');
      expect(result.driver.name).toBe('John');
      expect(result.route.planId).toBe('PLAN-1');
      expect(result.stops).toHaveLength(1);
    });

    it('throws NotFoundException when leg not found', async () => {
      prisma.loadLeg.findFirst.mockResolvedValue(null);

      await expect(service.getDispatchSheet('BAD', 1)).rejects.toThrow(NotFoundException);
    });

    it('returns null route when no route plan', async () => {
      prisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-1',
        sequence: 1,
        status: 'PENDING',
        loadId: 10,
        load: {
          loadNumber: 'L1',
          referenceNumber: null,
          commodityType: null,
          weightLbs: null,
          equipmentType: 'DRY_VAN',
          requiredEquipmentType: null,
          specialRequirements: null,
          customerName: 'A',
          pieces: null,
          hazmatClass: null,
          minTempF: null,
          maxTempF: null,
        },
        driver: null,
        vehicle: null,
        originStop: {
          id: 100,
          sequenceOrder: 1,
          stop: {
            name: 'A',
            address: '1',
            city: 'X',
            state: 'TX',
            zipCode: '1',
            lat: 0,
            lon: 0,
          },
        },
        destStop: {
          id: 101,
          sequenceOrder: 2,
          stop: {
            name: 'B',
            address: '2',
            city: 'Y',
            state: 'IL',
            zipCode: '2',
            lat: 0,
            lon: 0,
          },
        },
        routePlan: null,
      });
      prisma.loadLeg.count.mockResolvedValue(1);
      prisma.loadStop.findMany.mockResolvedValue([]);

      const result = await service.getDispatchSheet('LEG-1', 1);
      expect(result.route).toBeNull();
    });

    it('returns tempRange when min/max temp set', async () => {
      prisma.loadLeg.findFirst.mockResolvedValue({
        legId: 'LEG-1',
        sequence: 1,
        status: 'PENDING',
        loadId: 10,
        load: {
          loadNumber: 'L1',
          referenceNumber: null,
          commodityType: null,
          weightLbs: null,
          equipmentType: 'REEFER',
          requiredEquipmentType: 'REEFER',
          specialRequirements: null,
          customerName: 'A',
          pieces: null,
          hazmatClass: null,
          minTempF: 34,
          maxTempF: 38,
        },
        driver: null,
        vehicle: null,
        originStop: {
          id: 100,
          sequenceOrder: 1,
          stop: {
            name: 'A',
            address: '1',
            city: 'X',
            state: 'TX',
            zipCode: '1',
            lat: 0,
            lon: 0,
          },
        },
        destStop: {
          id: 101,
          sequenceOrder: 2,
          stop: {
            name: 'B',
            address: '2',
            city: 'Y',
            state: 'IL',
            zipCode: '2',
            lat: 0,
            lon: 0,
          },
        },
        routePlan: null,
      });
      prisma.loadLeg.count.mockResolvedValue(1);
      prisma.loadStop.findMany.mockResolvedValue([]);

      const result = await service.getDispatchSheet('LEG-1', 1);
      expect(result.tempRange).toEqual({ minF: 34, maxF: 38 });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getDispatchSheetForLoad
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getDispatchSheetForLoad', () => {
    it('returns dispatch sheet for non-relay load', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'L001',
        referenceNumber: 'REF-1',
        customerName: 'ACME',
        commodityType: 'General',
        weightLbs: 40000,
        equipmentType: 'DRY_VAN',
        requiredEquipmentType: null,
        specialRequirements: null,
        pieces: 10,
        hazmatClass: null,
        minTempF: null,
        maxTempF: null,
        status: 'ASSIGNED',
        driverId: 5,
        vehicleId: 3,
        driver: { driverId: 'DRV-1', name: 'John', phone: '555' },
        vehicle: {
          vehicleId: 'VEH-1',
          unitNumber: '101',
          make: 'Freightliner',
          model: 'Cascadia',
        },
        estimatedMiles: 500,
        actualMiles: null,
      });
      prisma.loadStop.findMany.mockResolvedValue([]);
      prisma.routePlanLoad.findFirst.mockResolvedValue(null);

      const result = await service.getDispatchSheetForLoad('LD-001', 1);

      expect(result.legId).toBe('load-L001');
      expect(result.totalLegs).toBe(1);
      expect(result.isFinalLeg).toBe(true);
      expect(result.loadNumber).toBe('L001');
      expect(result.route).toBeNull();
    });

    it('throws NotFoundException when load not found', async () => {
      prisma.load.findFirst.mockResolvedValue(null);

      await expect(service.getDispatchSheetForLoad('BAD', 1)).rejects.toThrow(NotFoundException);
    });

    it('includes route plan when linked', async () => {
      prisma.load.findFirst.mockResolvedValue({
        id: 10,
        loadNumber: 'L001',
        referenceNumber: null,
        customerName: 'A',
        commodityType: null,
        weightLbs: null,
        equipmentType: 'DRY_VAN',
        requiredEquipmentType: null,
        specialRequirements: null,
        pieces: null,
        hazmatClass: null,
        minTempF: null,
        maxTempF: null,
        status: 'ASSIGNED',
        driverId: 5,
        vehicleId: 3,
        driver: null,
        vehicle: null,
        estimatedMiles: null,
        actualMiles: null,
      });
      prisma.loadStop.findMany.mockResolvedValue([]);
      prisma.routePlanLoad.findFirst.mockResolvedValue({
        plan: {
          planId: 'PLAN-1',
          totalDistanceMiles: 500,
          totalDriveTimeHours: 8,
          departureTime: new Date(),
          estimatedArrival: new Date(),
        },
      });

      const result = await service.getDispatchSheetForLoad('LD-001', 1);
      expect(result.route).not.toBeNull();
      expect(result.route.planId).toBe('PLAN-1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getLegsForLoad
  // ═══════════════════════════════════════════════════════════════════════════

  describe('getLegsForLoad', () => {
    it('returns legs ordered by sequence', async () => {
      const legs = [
        { legId: 'LEG-1', sequence: 1 },
        { legId: 'LEG-2', sequence: 2 },
      ];
      prisma.loadLeg.findMany.mockResolvedValue(legs);

      const result = await service.getLegsForLoad(10, 1);

      expect(prisma.loadLeg.findMany).toHaveBeenCalledWith({
        where: { loadId: 10, tenantId: 1 },
        orderBy: { sequence: 'asc' },
        include: expect.objectContaining({
          driver: true,
          vehicle: true,
        }),
      });
      expect(result).toEqual(legs);
    });
  });
});
