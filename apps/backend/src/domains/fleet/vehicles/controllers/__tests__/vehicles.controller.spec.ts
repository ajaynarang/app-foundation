import { Test, TestingModule } from '@nestjs/testing';
import { VehiclesController } from '../vehicles.controller';
import { VehiclesService } from '../../services/vehicles.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('VehiclesController', () => {
  let controller: VehiclesController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'ADMIN',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    vehicleUnavailability: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const mockVehiclesService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
    decommission: jest.fn(),
    formatResponse: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VehiclesController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: VehiclesService, useValue: mockVehiclesService },
      ],
    }).compile();

    controller = module.get<VehiclesController>(VehiclesController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET / (listVehicles)', () => {
    it('should list vehicles and format response', async () => {
      const vehicles = [
        {
          id: 1,
          vehicleId: 'VEH-1',
          unitNumber: 'T-101',
          vin: '1HGBH41JXMN109186',
          equipmentType: 'dry_van',
          status: 'available',
          lifecycleStatus: 'ACTIVE',
          previousStatus: null,
          make: 'Freightliner',
          model: 'Cascadia',
          year: 2022,
          licensePlate: 'ABC123',
          licensePlateState: 'TX',
          hasSleeperBerth: true,
          grossWeightLbs: 80000,
          fuelCapacityGallons: 150,
          currentFuelGallons: 100,
          mpg: 6.5,
          eldTelematicsMetadata: null,
          assignedDriverId: null,
          assignedDriver: null,
          loads: [],
          externalVehicleId: null,
          externalSource: null,
          lastSyncedAt: null,
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          reactivatedAt: null,
          reactivatedBy: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          telematics: null,
        },
      ];
      mockVehiclesService.findAll.mockResolvedValue(vehicles);

      const result = await controller.listVehicles(mockUser);

      expect(mockVehiclesService.findAll).toHaveBeenCalledWith(1, false);
      expect(result).toHaveLength(1);
      expect(result[0].vehicleId).toBe('VEH-1');
      expect(result[0].activeLoadCounts).toEqual({
        inTransit: 0,
        assigned: 0,
        onHold: 0,
      });
    });

    it('should pass includeInactive flag', async () => {
      mockVehiclesService.findAll.mockResolvedValue([]);

      await controller.listVehicles(mockUser, 'true');
      expect(mockVehiclesService.findAll).toHaveBeenCalledWith(1, true);
    });
  });

  describe('GET / (listVehicles) - upcomingUnavailability', () => {
    it('should include upcomingUnavailability in vehicle list response', async () => {
      const vehicles = [
        {
          id: 1,
          vehicleId: 'VEH-1',
          unitNumber: 'T-101',
          vin: '1HGBH41JXMN109186',
          equipmentType: 'dry_van',
          status: 'available',
          lifecycleStatus: 'ACTIVE',
          previousStatus: null,
          make: 'Freightliner',
          model: 'Cascadia',
          year: 2022,
          licensePlate: 'ABC123',
          licensePlateState: 'TX',
          hasSleeperBerth: true,
          grossWeightLbs: 80000,
          fuelCapacityGallons: 150,
          currentFuelGallons: 100,
          mpg: 6.5,
          eldTelematicsMetadata: null,
          assignedDriverId: null,
          assignedDriver: null,
          loads: [],
          externalVehicleId: null,
          externalSource: null,
          lastSyncedAt: null,
          deactivatedAt: null,
          deactivatedBy: null,
          deactivationReason: null,
          reactivatedAt: null,
          reactivatedBy: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
          telematics: null,
        },
      ];
      mockVehiclesService.findAll.mockResolvedValue(vehicles);
      mockPrisma.vehicleUnavailability.findMany.mockResolvedValue([
        {
          id: 1,
          vehicleId: 1,
          type: 'MAINTENANCE',
          startDate: new Date('2026-04-10'),
          endDate: new Date('2026-04-12'),
          tenantId: 1,
        },
      ]);

      const result = await controller.listVehicles(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].upcomingUnavailability).toEqual(
        expect.objectContaining({
          type: 'MAINTENANCE',
          startDate: '2026-04-10',
          endDate: '2026-04-12',
        }),
      );
    });
  });

  describe('POST / (createVehicle)', () => {
    it('should create vehicle', async () => {
      const dto = {
        unitNumber: 'T-102',
        vin: '1HGBH41JXMN109187',
        equipmentType: 'dry_van',
      } as any;
      const created = {
        id: 2,
        vehicleId: 'VEH-2',
        unitNumber: 'T-102',
        vin: '1HGBH41JXMN109187',
        equipmentType: 'dry_van',
        status: 'available',
        make: null,
        model: null,
        year: null,
        licensePlate: null,
        licensePlateState: null,
        hasSleeperBerth: false,
        grossWeightLbs: null,
        fuelCapacityGallons: null,
        currentFuelGallons: null,
        mpg: null,
        externalVehicleId: null,
        externalSource: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockVehiclesService.create.mockResolvedValue(created);

      const result = await controller.createVehicle(mockUser, dto);
      expect(mockVehiclesService.create).toHaveBeenCalledWith(1, expect.objectContaining({ unitNumber: 'T-102' }));
      expect(result.vehicleId).toBe('VEH-2');
    });
  });

  describe('PUT /:vehicle_id (updateVehicle)', () => {
    it('should update vehicle', async () => {
      const dto = { unitNumber: 'T-102-U' } as any;
      const updated = {
        id: 2,
        vehicleId: 'VEH-2',
        unitNumber: 'T-102-U',
        vin: '1HGBH41JXMN109187',
        equipmentType: 'dry_van',
        status: 'available',
        make: null,
        model: null,
        year: null,
        licensePlate: null,
        licensePlateState: null,
        hasSleeperBerth: false,
        grossWeightLbs: null,
        fuelCapacityGallons: null,
        currentFuelGallons: null,
        mpg: null,
        externalVehicleId: null,
        externalSource: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockVehiclesService.update.mockResolvedValue(updated);

      await controller.updateVehicle(mockUser, 'VEH-2', dto);
      expect(mockVehiclesService.update).toHaveBeenCalledWith(
        'VEH-2',
        1,
        expect.objectContaining({ unitNumber: 'T-102-U' }),
      );
    });
  });

  describe('GET /:vehicle_id (getVehicle)', () => {
    it('should return formatted vehicle', async () => {
      const vehicle = { vehicleId: 'VEH-1' };
      mockVehiclesService.findOne.mockResolvedValue(vehicle);
      mockVehiclesService.formatResponse.mockReturnValue({
        vehicleId: 'VEH-1',
        formatted: true,
      });

      const result = await controller.getVehicle('VEH-1', mockUser);
      expect(mockVehiclesService.findOne).toHaveBeenCalledWith('VEH-1', 1);
      expect(mockVehiclesService.formatResponse).toHaveBeenCalledWith(vehicle);
      expect(result.vehicleId).toBe('VEH-1');
    });
  });

  describe('POST /:vehicle_id/deactivate', () => {
    it('should deactivate vehicle', async () => {
      mockVehiclesService.deactivate.mockResolvedValue({ status: 'inactive' });

      await controller.deactivate('VEH-1', { reason: 'Maintenance' } as any, mockUser);
      expect(mockVehiclesService.deactivate).toHaveBeenCalledWith('VEH-1', 1, 1, 'Maintenance');
    });
  });

  describe('POST /:vehicle_id/reactivate', () => {
    it('should reactivate vehicle', async () => {
      mockVehiclesService.reactivate.mockResolvedValue({ status: 'active' });

      await controller.reactivate('VEH-1', mockUser);
      expect(mockVehiclesService.reactivate).toHaveBeenCalledWith('VEH-1', 1, 1);
    });
  });

  describe('POST /:vehicle_id/decommission', () => {
    it('should decommission vehicle', async () => {
      mockVehiclesService.decommission.mockResolvedValue({
        lifecycleStatus: 'DECOMMISSIONED',
      });

      await controller.decommission('VEH-1', { reason: 'End of life' } as any, mockUser);
      expect(mockVehiclesService.decommission).toHaveBeenCalledWith('VEH-1', 1, 1, 'End of life');
    });
  });

  describe('GET /inactive/list', () => {
    it('should return inactive vehicles', async () => {
      const vehicles = [
        { lifecycleStatus: 'INACTIVE', vehicleId: 'VEH-2' },
        { lifecycleStatus: 'ACTIVE', vehicleId: 'VEH-1' },
      ];
      mockVehiclesService.findAll.mockResolvedValue(vehicles);
      mockVehiclesService.formatResponse.mockImplementation((v: any) => ({
        vehicleId: v.vehicleId,
      }));

      const result = await controller.getInactiveVehicles(mockUser);
      expect(result).toHaveLength(1);
      expect(result[0].vehicleId).toBe('VEH-2');
    });
  });
});
