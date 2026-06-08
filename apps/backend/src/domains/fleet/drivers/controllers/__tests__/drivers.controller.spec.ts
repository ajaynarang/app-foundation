import { Test, TestingModule } from '@nestjs/testing';
import { DriversController } from '../drivers.controller';
import { DriversService } from '../../services/drivers.service';
import { DriversActivationService } from '../../services/drivers-activation.service';
import { DispatchBoardService } from '../../services/dispatch-board.service';
import { IntegrationDataService } from '../../../../integrations/services/integration-data.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { BadRequestException } from '@nestjs/common';

describe('DriversController', () => {
  let controller: DriversController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'ADMIN',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
    driverUnavailability: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const mockDriversService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getWeeklyStats: jest.fn(),
  };

  const mockActivationService = {
    activateDriver: jest.fn(),
    deactivateDriver: jest.fn(),
    reactivateDriver: jest.fn(),
    activateAndInvite: jest.fn(),
    getPendingDrivers: jest.fn(),
    getInactiveDrivers: jest.fn(),
  };

  const mockDispatchBoardService = {
    getDispatchBoard: jest.fn(),
  };

  const mockIntegrationDataService = {
    getDriverHOS: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DriversController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DriversService, useValue: mockDriversService },
        {
          provide: IntegrationDataService,
          useValue: mockIntegrationDataService,
        },
        { provide: DriversActivationService, useValue: mockActivationService },
        { provide: DispatchBoardService, useValue: mockDispatchBoardService },
      ],
    }).compile();

    controller = module.get<DriversController>(DriversController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET / (listDrivers)', () => {
    it('should list drivers with sally access status', async () => {
      const drivers = [
        {
          id: 1,
          driverId: 'DRV-1',
          name: 'John Doe',
          licenseNumber: 'CDL123',
          licenseState: 'TX',
          cdlClass: 'A',
          endorsements: [],
          phone: '555-1234',
          email: 'john@test.com',
          status: 'active',
          currentHoursDriven: 5,
          currentOnDutyTime: 8,
          currentHoursSinceBreak: 3,
          cycleHoursUsed: 40,
          hosData: null,
          hosDataSource: null,
          hosDataSyncedAt: null,
          eldMetadata: null,
          externalDriverId: null,
          externalSource: null,
          lastSyncedAt: null,
          assignedVehicleId: null,
          assignedVehicle: null,
          loads: [],
          user: { userId: 'u-1', isActive: true },
          invitations: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      mockDriversService.findAll.mockResolvedValue(drivers);

      const result = await controller.listDrivers(mockUser);

      expect(mockDriversService.findAll).toHaveBeenCalledWith(1, false);
      expect(result).toHaveLength(1);
      expect(result[0].sallyAccessStatus).toBe('ACTIVE');
      expect(result[0].linkedUserId).toBe('u-1');
    });
  });

  describe('POST / (createDriver)', () => {
    it('should create driver', async () => {
      const dto = { name: 'Jane', phone: '555-9999' } as any;
      const created = {
        id: 2,
        driverId: 'DRV-2',
        name: 'Jane',
        phone: '555-9999',
        email: null,
        cdlClass: null,
        licenseNumber: null,
        licenseState: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockDriversService.create.mockResolvedValue(created);

      const result = await controller.createDriver(mockUser, dto);
      expect(mockDriversService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Jane', phone: '555-9999' }),
      );
      expect(result.driverId).toBe('DRV-2');
    });

    it('should throw if no phone or email', async () => {
      const dto = { name: 'Jane' } as any;

      await expect(controller.createDriver(mockUser, dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('PUT /:driver_id (updateDriver)', () => {
    it('should update driver', async () => {
      const dto = { name: 'Jane Updated' } as any;
      const updated = {
        id: 2,
        driverId: 'DRV-2',
        name: 'Jane Updated',
        phone: '555-9999',
        email: null,
        cdlClass: null,
        licenseNumber: null,
        licenseState: null,
        endorsements: [],
        hireDate: null,
        medicalCardExpiry: null,
        homeTerminalCity: null,
        homeTerminalState: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        updatedAt: new Date(),
      };
      mockDriversService.update.mockResolvedValue(updated);

      await controller.updateDriver(mockUser, 'DRV-2', dto);
      expect(mockDriversService.update).toHaveBeenCalledWith(
        'DRV-2',
        1,
        expect.objectContaining({ name: 'Jane Updated' }),
      );
    });
  });

  describe('GET /:driver_id (getDriver)', () => {
    it('should return driver with sally access status', async () => {
      const driver = {
        id: 1,
        driverId: 'DRV-1',
        name: 'John',
        phone: '555-1234',
        email: 'john@test.com',
        cdlClass: 'A',
        licenseNumber: 'CDL123',
        licenseState: 'TX',
        endorsements: [],
        status: 'active',
        hireDate: null,
        medicalCardExpiry: null,
        homeTerminalCity: null,
        homeTerminalState: null,
        homeTerminalTimezone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        externalDriverId: null,
        externalSource: null,
        syncStatus: null,
        lastSyncedAt: null,
        currentHoursDriven: 5,
        currentOnDutyTime: 8,
        currentHoursSinceBreak: 3,
        cycleHoursUsed: 40,
        eldMetadata: null,
        hosData: null,
        assignedVehicleId: null,
        assignedVehicle: null,
        loads: [],
        user: null,
        invitations: [{ invitationId: 'inv-1' }],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      mockDriversService.findOne.mockResolvedValue(driver);

      const result = await controller.getDriver('DRV-1', mockUser);
      expect(result.sallyAccessStatus).toBe('INVITED');
      expect(result.pendingInvitationId).toBe('inv-1');
    });

    it('should show DEACTIVATED status when user is inactive', async () => {
      const driver = {
        id: 1,
        driverId: 'DRV-1',
        name: 'John',
        phone: '555-1234',
        email: 'john@test.com',
        cdlClass: 'A',
        licenseNumber: 'CDL123',
        licenseState: 'TX',
        endorsements: [],
        status: 'active',
        hireDate: null,
        medicalCardExpiry: null,
        homeTerminalCity: null,
        homeTerminalState: null,
        homeTerminalTimezone: null,
        emergencyContactName: null,
        emergencyContactPhone: null,
        notes: null,
        externalDriverId: null,
        externalSource: null,
        syncStatus: null,
        lastSyncedAt: null,
        currentHoursDriven: 0,
        currentOnDutyTime: 0,
        currentHoursSinceBreak: 0,
        cycleHoursUsed: 0,
        eldMetadata: null,
        hosData: null,
        assignedVehicleId: null,
        assignedVehicle: null,
        loads: [],
        user: { userId: 'u-1', isActive: false },
        invitations: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      };
      mockDriversService.findOne.mockResolvedValue(driver);

      const result = await controller.getDriver('DRV-1', mockUser);
      expect(result.sallyAccessStatus).toBe('DEACTIVATED');
      expect(result.linkedUserId).toBe('u-1');
    });
  });

  describe('POST /:driver_id/activate', () => {
    it('should activate driver', async () => {
      mockActivationService.activateDriver.mockResolvedValue({
        status: 'active',
      });

      await controller.activateDriver('DRV-1', mockUser);
      expect(mockActivationService.activateDriver).toHaveBeenCalledWith('DRV-1', { id: 1, tenant: { id: 1 } });
    });
  });

  describe('POST /:driver_id/deactivate', () => {
    it('should deactivate driver with reason', async () => {
      mockActivationService.deactivateDriver.mockResolvedValue({
        status: 'inactive',
      });

      await controller.deactivateDriver('DRV-1', mockUser, {
        reason: 'Performance',
      } as any);

      expect(mockActivationService.deactivateDriver).toHaveBeenCalledWith(
        'DRV-1',
        { id: 1, tenant: { id: 1 } },
        'Performance',
      );
    });
  });

  describe('POST /:driver_id/reactivate', () => {
    it('should reactivate driver', async () => {
      mockActivationService.reactivateDriver.mockResolvedValue({
        status: 'active',
      });

      await controller.reactivateDriver('DRV-1', mockUser);
      expect(mockActivationService.reactivateDriver).toHaveBeenCalledWith('DRV-1', { id: 1, tenant: { id: 1 } });
    });
  });

  describe('GET / (listDrivers) - upcomingUnavailability', () => {
    it('should include upcomingUnavailability in driver list response', async () => {
      const drivers = [
        {
          id: 1,
          driverId: 'DRV-1',
          name: 'John Doe',
          licenseNumber: 'CDL123',
          licenseState: 'TX',
          cdlClass: 'A',
          endorsements: [],
          phone: '555-1234',
          email: 'john@test.com',
          status: 'active',
          currentHoursDriven: 5,
          currentOnDutyTime: 8,
          currentHoursSinceBreak: 3,
          cycleHoursUsed: 40,
          hosData: null,
          hosDataSource: null,
          hosDataSyncedAt: null,
          eldMetadata: null,
          externalDriverId: null,
          externalSource: null,
          lastSyncedAt: null,
          assignedVehicleId: null,
          assignedVehicle: null,
          loads: [],
          user: null,
          invitations: [],
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ];
      mockDriversService.findAll.mockResolvedValue(drivers);
      mockPrisma.driverUnavailability.findMany.mockResolvedValue([
        {
          id: 1,
          driverId: 1,
          type: 'VACATION',
          startDate: new Date('2026-04-10'),
          endDate: new Date('2026-04-14'),
          tenantId: 1,
        },
      ]);

      const result = await controller.listDrivers(mockUser);

      expect(result).toHaveLength(1);
      expect(result[0].upcomingUnavailability).toEqual(
        expect.objectContaining({
          type: 'VACATION',
          startDate: '2026-04-10',
          endDate: '2026-04-14',
        }),
      );
    });
  });

  describe('GET /dispatch-board', () => {
    it('should return dispatch board data', async () => {
      mockDispatchBoardService.getDispatchBoard.mockResolvedValue({
        drivers: [],
      });

      await controller.getDispatchBoard(mockUser, 'available', 'john', 'name', 'asc');
      expect(mockDispatchBoardService.getDispatchBoard).toHaveBeenCalledWith(1, {
        filter: 'available',
        search: 'john',
        sortBy: 'name',
        sortOrder: 'asc',
      });
    });
  });

  describe('GET /pending/list', () => {
    it('should return pending drivers', async () => {
      mockActivationService.getPendingDrivers.mockResolvedValue([]);

      await controller.getPendingDrivers(mockUser);
      expect(mockActivationService.getPendingDrivers).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /inactive/list', () => {
    it('should return inactive drivers', async () => {
      mockActivationService.getInactiveDrivers.mockResolvedValue([]);

      await controller.getInactiveDrivers(mockUser);
      expect(mockActivationService.getInactiveDrivers).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /:driver_id/weekly-stats', () => {
    it('should return weekly stats', async () => {
      mockDriversService.getWeeklyStats.mockResolvedValue({ miles: 1200 });

      await controller.getWeeklyStats('DRV-1', mockUser);
      expect(mockDriversService.getWeeklyStats).toHaveBeenCalledWith('DRV-1', 1);
    });
  });

  describe('GET /:driverId/hos', () => {
    it('should return HOS data', async () => {
      mockIntegrationDataService.getDriverHOS.mockResolvedValue({
        driveRemaining: 5,
      });

      const result = await controller.getDriverHOS('DRV-1', mockUser);
      expect(mockIntegrationDataService.getDriverHOS).toHaveBeenCalledWith(1, 'DRV-1');
      expect(result).toEqual({ driveRemaining: 5 });
    });

    it('should return null when no HOS data', async () => {
      mockIntegrationDataService.getDriverHOS.mockResolvedValue(null);

      const result = await controller.getDriverHOS('DRV-1', mockUser);
      expect(result).toBeNull();
    });
  });

  describe('POST /:driver_id/activate-and-invite', () => {
    it('should call activateAndInvite', async () => {
      const mockResult = {
        driver: { driverId: 'DRV-1', status: 'ACTIVE' },
        invitation: { id: 'inv-1', email: 'john@test.com' },
      };
      mockActivationService.activateAndInvite.mockResolvedValue(mockResult);

      const result = await controller.activateAndInvite('DRV-1', mockUser, 'john@test.com', '555-1234');

      expect(mockActivationService.activateAndInvite).toHaveBeenCalledWith(
        'DRV-1',
        'john@test.com',
        expect.objectContaining({ tenant: { id: 1 } }),
        '555-1234',
      );
      expect(result).toEqual(mockResult);
    });
  });
});
