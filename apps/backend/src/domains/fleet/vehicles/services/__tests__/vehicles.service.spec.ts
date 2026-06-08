import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VehiclesService } from '../vehicles.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../../infrastructure/events/domain-event.service';
import { CustomFieldValidatorService } from '../../../custom-fields/custom-field-validator.service';
import { createMockPrisma } from '../../../../../test/mocks';
import { makeVehicle } from '../../../../../test/factories';

describe('VehiclesService', () => {
  let service: VehiclesService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    prisma = createMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: DomainEventService,
          useValue: { emit: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CustomFieldValidatorService,
          useValue: {
            validate: jest.fn().mockResolvedValue({ values: {}, warnings: [] }),
            getDefinitions: jest.fn().mockResolvedValue([]),
            invalidateCache: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn(), emitAsync: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<VehiclesService>(VehiclesService);
  });

  // ─── findAll ─────────────────────────────────────────────

  describe('findAll', () => {
    it('should return active vehicles only by default', async () => {
      prisma.vehicle.findMany.mockResolvedValue([makeVehicle()]);

      const result = await service.findAll(1);

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1, lifecycleStatus: 'ACTIVE' },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should include all lifecycle statuses when includeInactive is true', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);

      await service.findAll(1, true);

      const callArgs = prisma.vehicle.findMany.mock.calls[0][0];
      expect(callArgs.where).toEqual({ tenantId: 1 });
      expect(callArgs.where.lifecycleStatus).toBeUndefined();
    });

    it('should order by vehicleId ascending', async () => {
      prisma.vehicle.findMany.mockResolvedValue([]);

      await service.findAll(1);

      expect(prisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { vehicleId: 'asc' },
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────

  describe('findOne', () => {
    it('should return vehicle with relations when found', async () => {
      const vehicle = makeVehicle();
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);

      const result = await service.findOne('veh-test-001', 1);

      expect(prisma.vehicle.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            vehicleId_tenantId: { vehicleId: 'veh-test-001', tenantId: 1 },
          },
        }),
      );
      expect(result.vehicleId).toBe('veh-test-001');
    });

    it('should throw NotFoundException when vehicle not found', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create ──────────────────────────────────────────────

  describe('create', () => {
    it('should create a vehicle with default AVAILABLE status', async () => {
      const created = makeVehicle();
      prisma.vehicle.create.mockResolvedValue(created);
      // Mock the fleet limit check dependencies
      prisma.tenant.findUnique.mockResolvedValue(null);

      const result = await service.create(1, {
        unitNumber: 'UNIT-001',
        vin: '1FUJGLDR5CLBP8901',
        equipmentType: 'DRY_VAN',
        fuelCapacityGallons: 200,
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should sync driver assignedVehicleId when assignedDriverId is provided', async () => {
      const created = makeVehicle({ id: 7 });
      prisma.vehicle.create.mockResolvedValue(created);
      prisma.driver.update.mockResolvedValue({});
      prisma.tenant.findUnique.mockResolvedValue(null);

      await service.create(1, {
        unitNumber: 'UNIT-002',
        vin: '1FUJGLDR5CLBP8902',
        equipmentType: 'DRY_VAN',
        fuelCapacityGallons: 200,
        assignedDriverId: 3,
      });

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { assignedVehicleId: 7 },
      });
    });

    it('should throw ConflictException on duplicate VIN (P2002)', async () => {
      const prismaError = new Error('Unique constraint');
      (prismaError as any).code = 'P2002';
      prisma.$transaction.mockRejectedValue(prismaError);

      await expect(
        service.create(1, {
          unitNumber: 'UNIT-DUP',
          vin: 'DUPLICATE-VIN',
          equipmentType: 'DRY_VAN',
          fuelCapacityGallons: 200,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── update ──────────────────────────────────────────────

  describe('update', () => {
    it('should update operational fields on a manual vehicle', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: null,
        assignedDriverId: null,
      });
      const updated = makeVehicle({ mpg: 7.0 });
      prisma.vehicle.update.mockResolvedValue(updated);

      const result = await service.update('veh-test-001', 1, { mpg: 7.0 });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should strip identity fields for TMS-synced vehicles', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: 'samsara',
        assignedDriverId: null,
      });
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.update('veh-test-001', 1, {
        vin: 'NEW-VIN',
        make: 'Peterbilt',
        mpg: 7.0,
      });

      // The identity fields (vin, make) should be filtered out
      // Only operational field (mpg) should pass through
      const updateCall = prisma.vehicle.update.mock.calls[0][0];
      expect(updateCall.data.vin).toBeUndefined();
      expect(updateCall.data.make).toBeUndefined();
    });

    it('should throw NotFoundException when vehicle not found', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(null);

      await expect(service.update('nonexistent', 1, { mpg: 7.0 })).rejects.toThrow(NotFoundException);
    });

    it('should perform bidirectional driver sync when changing driver', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: null,
        assignedDriverId: 5,
      });
      prisma.driver.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.update('veh-test-001', 1, { assignedDriverId: 10 });

      // Clear old driver
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { assignedVehicleId: null },
      });
      // Set new driver
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: { assignedVehicleId: 1 },
      });
    });
  });

  // ─── deactivate ──────────────────────────────────────────

  describe('deactivate', () => {
    it('should deactivate an active vehicle with no active loads', async () => {
      const vehicle = makeVehicle({
        id: 1,
        lifecycleStatus: 'ACTIVE',
        status: 'AVAILABLE',
      });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.load.findMany.mockResolvedValue([]);
      prisma.routePlan.findMany.mockResolvedValue([]);
      prisma.vehicle.update.mockResolvedValue({
        ...vehicle,
        lifecycleStatus: 'INACTIVE',
        deactivatedAt: new Date(),
      });

      const result = await service.deactivate('veh-test-001', 1, 100, 'Out for maintenance');

      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'INACTIVE',
            deactivationReason: 'Out for maintenance',
          }),
        }),
      );
      expect(result.lifecycleStatus).toBe('INACTIVE');
    });

    it('should throw BadRequestException if vehicle is not active', async () => {
      const vehicle = makeVehicle({ lifecycleStatus: 'INACTIVE' });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);

      await expect(service.deactivate('veh-test-001', 1, 100, 'reason')).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if vehicle has active loads', async () => {
      const vehicle = makeVehicle({ id: 1, lifecycleStatus: 'ACTIVE' });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.load.findMany.mockResolvedValue([{ loadNumber: 'ld-1', status: 'IN_TRANSIT' }]);

      await expect(service.deactivate('veh-test-001', 1, 100, 'reason')).rejects.toThrow(ConflictException);
    });
  });

  // ─── reactivate ──────────────────────────────────────────

  describe('reactivate', () => {
    it('should reactivate an inactive vehicle and restore previous status', async () => {
      const vehicle = makeVehicle({
        id: 1,
        lifecycleStatus: 'INACTIVE',
        previousStatus: 'ASSIGNED',
      });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.vehicle.update.mockResolvedValue({
        ...vehicle,
        lifecycleStatus: 'ACTIVE',
        status: 'ASSIGNED',
      });

      const result = await service.reactivate('veh-test-001', 1, 100);

      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'ACTIVE',
            status: 'ASSIGNED',
            previousStatus: null,
          }),
        }),
      );
      expect(result.lifecycleStatus).toBe('ACTIVE');
    });

    it('should throw BadRequestException if vehicle is not inactive', async () => {
      const vehicle = makeVehicle({ lifecycleStatus: 'ACTIVE' });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);

      await expect(service.reactivate('veh-test-001', 1, 100)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── decommission ────────────────────────────────────────

  describe('decommission', () => {
    it('should decommission a vehicle', async () => {
      const vehicle = makeVehicle({ id: 1, lifecycleStatus: 'ACTIVE' });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.load.findMany.mockResolvedValue([]);
      prisma.routePlan.findMany.mockResolvedValue([]);
      prisma.vehicle.update.mockResolvedValue({
        ...vehicle,
        lifecycleStatus: 'DECOMMISSIONED',
      });

      const result = await service.decommission('veh-test-001', 1, 100, 'End of life');

      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lifecycleStatus: 'DECOMMISSIONED',
          }),
        }),
      );
      expect(result.lifecycleStatus).toBe('DECOMMISSIONED');
    });

    it('should throw BadRequestException if already decommissioned', async () => {
      const vehicle = makeVehicle({ lifecycleStatus: 'DECOMMISSIONED' });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);

      await expect(service.decommission('veh-test-001', 1, 100, 'reason')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── formatResponse ──────────────────────────────────────

  describe('formatResponse', () => {
    it('should format vehicle data with all fields', () => {
      const vehicle = makeVehicle({
        assignedDriver: { id: 1, driverId: 'drv-1', name: 'John' },
        telematics: {
          latitude: 32.77,
          longitude: -96.79,
          speed: 55,
          heading: 180,
          fuelLevel: 75,
          engineRunning: true,
          odometer: 100000,
          timestamp: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      });

      const result = service.formatResponse(vehicle);

      expect(result.vehicleId).toBe('veh-test-001');
      expect(result.assignedDriver).toEqual({
        id: 1,
        driverId: 'drv-1',
        name: 'John',
      });
      expect(result.telematics?.latitude).toBe(32.77);
    });

    it('should return null for assignedDriver and telematics when not present', () => {
      const vehicle = makeVehicle({
        assignedDriver: null,
        telematics: null,
      });

      const result = service.formatResponse(vehicle);

      expect(result.assignedDriver).toBeNull();
      expect(result.telematics).toBeNull();
    });
  });

  describe('update - customFieldValues', () => {
    it('should validate and include custom fields in update', async () => {
      const existing = makeVehicle({ customFieldValues: {} });
      prisma.vehicle.findUnique.mockResolvedValue(existing);
      prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
      prisma.vehicle.update.mockResolvedValue({
        ...existing,
        customFieldValues: { color: 'red' },
      });

      await service.update('veh-test-001', 1, {
        customFieldValues: { color: 'red' },
      });

      expect(prisma.vehicle.update).toHaveBeenCalled();
    });
  });

  describe('update - P2002 duplicate VIN', () => {
    it('should throw ConflictException on duplicate VIN during update', async () => {
      const existing = makeVehicle();
      prisma.vehicle.findUnique.mockResolvedValue(existing);
      prisma.$transaction.mockRejectedValue({ code: 'P2002' });

      await expect(service.update('veh-test-001', 1, { vin: 'DUPLICATE-VIN' })).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivate - active route plans', () => {
    it('should throw ConflictException if vehicle has active route plans', async () => {
      prisma.vehicle.findUnique.mockResolvedValue(makeVehicle({ lifecycleStatus: 'ACTIVE' }));
      prisma.load.findMany.mockResolvedValue([]);
      prisma.routePlan.findMany.mockResolvedValue([{ planId: 'PLAN-1' }]);

      await expect(service.deactivate('veh-test-001', 1, 1, 'Testing deactivation')).rejects.toThrow(ConflictException);
    });
  });

  // ─── create edge cases ──────────────────────────────────────

  describe('create edge cases', () => {
    it('should create vehicle with default hasSleeperBerth=true', async () => {
      const created = makeVehicle();
      prisma.vehicle.create.mockResolvedValue(created);
      prisma.tenant.findUnique.mockResolvedValue(null);

      await service.create(1, {
        unitNumber: 'UNIT-003',
        vin: '1FUJGLDR5CLBP8903',
        equipmentType: 'DRY_VAN',
        fuelCapacityGallons: 200,
      });

      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            hasSleeperBerth: true,
          }),
        }),
      );
    });

    it('should include optional fields when provided', async () => {
      const created = makeVehicle();
      prisma.vehicle.create.mockResolvedValue(created);
      prisma.tenant.findUnique.mockResolvedValue(null);

      await service.create(1, {
        unitNumber: 'UNIT-004',
        vin: '1FUJGLDR5CLBP8904',
        equipmentType: 'REEFER',
        fuelCapacityGallons: 250,
        mpg: 6.5,
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2024,
        licensePlate: 'ABC-1234',
        licensePlateState: 'TX',
        hasSleeperBerth: false,
        grossWeightLbs: 80000,
        currentFuelGallons: 100,
      });

      expect(prisma.vehicle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            make: 'Freightliner',
            model: 'Cascadia',
            year: 2024,
            hasSleeperBerth: false,
            grossWeightLbs: 80000,
          }),
        }),
      );
    });
  });

  // ─── update edge cases ──────────────────────────────────────

  describe('update edge cases', () => {
    it('should clear old driver when reassigning to no driver', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: null,
        assignedDriverId: 5,
        customFieldValues: {},
      });
      prisma.driver.update.mockResolvedValue({});
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.update('veh-test-001', 1, { assignedDriverId: null });

      // Should clear old driver's vehicle reference
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 5 },
        data: { assignedVehicleId: null },
      });
    });

    it('should update operational fields only on TMS-synced vehicle', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: 'samsara',
        assignedDriverId: null,
        customFieldValues: {},
      });
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.update('veh-test-001', 1, {
        vin: 'NEW-VIN-IGNORED',
        make: 'NewMake-IGNORED',
        mpg: 7.5,
        status: 'IN_SHOP',
        fuelCapacityGallons: 300,
      });

      const updateCall = prisma.vehicle.update.mock.calls[0][0];
      // Identity fields should be stripped
      expect(updateCall.data.vin).toBeUndefined();
      expect(updateCall.data.make).toBeUndefined();
      // Operational fields should pass through
      expect(updateCall.data.mpg).toBe(7.5);
      expect(updateCall.data.status).toBe('IN_SHOP');
      expect(updateCall.data.fuelCapacityGallons).toBe(300);
    });

    it('should allow identity fields on manual vehicle', async () => {
      prisma.vehicle.findUnique.mockResolvedValue({
        id: 1,
        externalSource: null,
        assignedDriverId: null,
        customFieldValues: {},
      });
      prisma.vehicle.update.mockResolvedValue(makeVehicle());

      await service.update('veh-test-001', 1, {
        vin: 'NEWVIN123',
        make: 'Kenworth',
        model: 'T680',
        year: 2025,
        licensePlate: 'XYZ-9999',
        licensePlateState: 'CA',
      });

      const updateCall = prisma.vehicle.update.mock.calls[0][0];
      expect(updateCall.data.vin).toBe('NEWVIN123');
      expect(updateCall.data.make).toBe('Kenworth');
      expect(updateCall.data.model).toBe('T680');
      expect(updateCall.data.year).toBe(2025);
      expect(updateCall.data.licensePlate).toBe('XYZ-9999');
      expect(updateCall.data.licensePlateState).toBe('CA');
    });
  });

  // ─── reactivate edge cases ──────────────────────────────────

  describe('reactivate edge cases', () => {
    it('should default to AVAILABLE when no previous status stored', async () => {
      const vehicle = makeVehicle({
        id: 1,
        lifecycleStatus: 'INACTIVE',
        previousStatus: null,
      });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.vehicle.update.mockResolvedValue({
        ...vehicle,
        lifecycleStatus: 'ACTIVE',
        status: 'AVAILABLE',
      });

      await service.reactivate('veh-test-001', 1, 100);

      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'AVAILABLE',
          }),
        }),
      );
    });
  });

  // ─── decommission edge cases ──────────────────────────────

  describe('decommission edge cases', () => {
    it('should decommission from INACTIVE status', async () => {
      const vehicle = makeVehicle({
        id: 1,
        lifecycleStatus: 'INACTIVE',
        status: 'AVAILABLE',
      });
      prisma.vehicle.findUnique.mockResolvedValue(vehicle);
      prisma.load.findMany.mockResolvedValue([]);
      prisma.routePlan.findMany.mockResolvedValue([]);
      prisma.vehicle.update.mockResolvedValue({
        ...vehicle,
        lifecycleStatus: 'DECOMMISSIONED',
      });

      const result = await service.decommission('veh-test-001', 1, 100, 'Sold');

      expect(result.lifecycleStatus).toBe('DECOMMISSIONED');
    });
  });

  // ─── formatResponse edge cases ──────────────────────────────

  describe('formatResponse edge cases', () => {
    it('should format vehicle with loads data', () => {
      const vehicle = makeVehicle({
        loads: [{ status: 'in_transit' }, { status: 'assigned' }],
        assignedDriver: null,
        telematics: null,
      });

      const result = service.formatResponse(vehicle);

      expect(result.vehicleId).toBeDefined();
      expect(result.assignedDriver).toBeNull();
      expect(result.telematics).toBeNull();
    });
  });
});
