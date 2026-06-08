import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { EldLinkingService } from '../eld-linking.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AdapterFactoryService } from '../../adapters/adapter-factory.service';
import { AuthTokenService } from '../../oauth/auth-token.service';
import { DriverMerger } from '../../sync/merging/driver-merger';
import { VehicleMerger } from '../../sync/merging/vehicle-merger';

const mockPrisma = {
  driver: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  vehicle: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  integrationConfig: {
    findFirst: jest.fn(),
  },
};

const mockEldAdapter = {
  getDrivers: jest.fn(),
  getVehicles: jest.fn(),
};

const mockAdapterFactory = {
  getELDAdapter: jest.fn().mockReturnValue(mockEldAdapter),
};

const mockAuthTokenService = {
  getActiveToken: jest.fn().mockResolvedValue('eld-token'),
};

const mockDriverMerger = {
  merge: jest.fn().mockReturnValue({ eldMetadata: { eldId: 'eld-1' } }),
};

const mockVehicleMerger = {
  merge: jest.fn().mockReturnValue({ eldTelematicsMetadata: { eldId: 'eld-v1' } }),
};

describe('EldLinkingService', () => {
  let service: EldLinkingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Setup default integration config
    mockPrisma.integrationConfig.findFirst.mockResolvedValue({
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      integrationType: 'ELD',
      isEnabled: true,
      status: 'ACTIVE',
      credentials: 'enc',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EldLinkingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AdapterFactoryService, useValue: mockAdapterFactory },
        { provide: AuthTokenService, useValue: mockAuthTokenService },
        { provide: DriverMerger, useValue: mockDriverMerger },
        { provide: VehicleMerger, useValue: mockVehicleMerger },
      ],
    }).compile();

    service = module.get<EldLinkingService>(EldLinkingService);
  });

  // --------------------------------------------------------------------------
  // linkDriver
  // --------------------------------------------------------------------------

  describe('linkDriver', () => {
    const mockDriver = {
      id: 10,
      tenantId: 1,
      name: 'John Doe',
      phone: '+15551234567',
      licenseNumber: 'DL123',
      licenseState: 'TX',
      eldMetadata: null,
    };

    it('should throw NotFoundException if driver not found', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      await expect(service.linkDriver(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('should return existing link if already linked and no eldId specified', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        ...mockDriver,
        eldMetadata: { eldId: 'already-linked' },
      });

      const result = await service.linkDriver(1, 10);

      expect(result.linked).toBe(true);
      expect(result.eldId).toBe('already-linked');
      expect(mockEldAdapter.getDrivers).not.toHaveBeenCalled();
    });

    it('should manually link driver by eldId', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockEldAdapter.getDrivers.mockResolvedValue([{ id: 'eld-1', username: 'ELD John', phone: '+10000000000' }]);
      mockPrisma.driver.update.mockResolvedValue({});

      const result = await service.linkDriver(1, 10, 'eld-1');

      expect(result.linked).toBe(true);
      expect(result.eldId).toBe('eld-1');
      expect(result.matchMethod).toBe('manual');
      expect(mockDriverMerger.merge).toHaveBeenCalled();
    });

    it('should throw if specified eldId not found in ELD', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockEldAdapter.getDrivers.mockResolvedValue([{ id: 'other-eld', username: 'Other' }]);

      await expect(service.linkDriver(1, 10, 'nonexistent')).rejects.toThrow(BadRequestException);
    });

    it('should auto-match by phone', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockEldAdapter.getDrivers.mockResolvedValue([
        {
          id: 'eld-phone',
          username: 'Phone Match',
          phone: '+15551234567',
        },
      ]);
      mockPrisma.driver.update.mockResolvedValue({});

      const result = await service.linkDriver(1, 10);

      expect(result.linked).toBe(true);
      expect(result.matchMethod).toBe('phone');
    });

    it('should auto-match by license', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockEldAdapter.getDrivers.mockResolvedValue([
        {
          id: 'eld-lic',
          username: 'License Match',
          phone: '+19999999999',
          licenseNumber: 'DL123',
          licenseState: 'TX',
        },
      ]);
      mockPrisma.driver.update.mockResolvedValue({});

      const result = await service.linkDriver(1, 10);

      expect(result.linked).toBe(true);
      expect(result.matchMethod).toBe('license');
    });

    it('should return candidates when no auto-match found', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(mockDriver);
      mockEldAdapter.getDrivers.mockResolvedValue([
        { id: 'c1', username: 'Driver A', phone: '+10000000001' },
        { id: 'c2', username: 'Driver B', phone: '+10000000002' },
      ]);

      const result = await service.linkDriver(1, 10);

      expect(result.linked).toBe(false);
      expect(result.candidates).toBeDefined();
      expect(result.candidates.length).toBeLessThanOrEqual(5);
      expect(result.candidates[0]).toHaveProperty('eldId');
      expect(result.candidates[0]).toHaveProperty('name');
    });
  });

  // --------------------------------------------------------------------------
  // unlinkDriver
  // --------------------------------------------------------------------------

  describe('unlinkDriver', () => {
    it('should unlink driver by clearing eldMetadata', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({ id: 10, tenantId: 1 });
      mockPrisma.driver.update.mockResolvedValue({});

      await service.unlinkDriver(1, 10);

      expect(mockPrisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 10 },
        }),
      );
    });

    it('should throw if driver not found', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      await expect(service.unlinkDriver(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // --------------------------------------------------------------------------
  // linkVehicle
  // --------------------------------------------------------------------------

  describe('linkVehicle', () => {
    const mockVehicle = {
      id: 20,
      tenantId: 1,
      unitNumber: 'UNIT-1',
      vin: 'VIN123',
      make: 'Freightliner',
      model: 'Cascadia',
      licensePlate: 'TX-1234',
      eldTelematicsMetadata: null,
    };

    it('should throw NotFoundException if vehicle not found', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.linkVehicle(1, 99)).rejects.toThrow(NotFoundException);
    });

    it('should return existing link if already linked', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue({
        ...mockVehicle,
        eldTelematicsMetadata: { eldId: 'already-linked-v' },
      });

      const result = await service.linkVehicle(1, 20);

      expect(result.linked).toBe(true);
      expect(result.eldId).toBe('already-linked-v');
    });

    it('should manually link vehicle by eldId', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockEldAdapter.getVehicles.mockResolvedValue([{ id: 'eld-v1', vin: 'OTHERVIN' }]);
      mockPrisma.vehicle.update.mockResolvedValue({});

      const result = await service.linkVehicle(1, 20, 'eld-v1');

      expect(result.linked).toBe(true);
      expect(result.matchMethod).toBe('manual');
    });

    it('should throw if specified vehicle eldId not found', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockEldAdapter.getVehicles.mockResolvedValue([{ id: 'other', vin: 'X' }]);

      await expect(service.linkVehicle(1, 20, 'nonexistent')).rejects.toThrow(BadRequestException);
    });

    it('should auto-match by VIN', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockEldAdapter.getVehicles.mockResolvedValue([{ id: 'eld-vin', vin: 'VIN123', licensePlate: 'OTHER' }]);
      mockPrisma.vehicle.update.mockResolvedValue({});

      const result = await service.linkVehicle(1, 20);

      expect(result.linked).toBe(true);
      expect(result.matchMethod).toBe('vin');
    });

    it('should auto-match by license plate', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockEldAdapter.getVehicles.mockResolvedValue([{ id: 'eld-lp', vin: 'OTHERVIN', licensePlate: 'TX-1234' }]);
      mockPrisma.vehicle.update.mockResolvedValue({});

      const result = await service.linkVehicle(1, 20);

      expect(result.linked).toBe(true);
      expect(result.matchMethod).toBe('license_plate');
    });

    it('should return candidates when no auto-match', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(mockVehicle);
      mockEldAdapter.getVehicles.mockResolvedValue([
        { id: 'v1', vin: 'NOMATCH1', licensePlate: 'XX-0001' },
        { id: 'v2', vin: 'NOMATCH2', licensePlate: 'XX-0002' },
      ]);

      const result = await service.linkVehicle(1, 20);

      expect(result.linked).toBe(false);
      expect(result.candidates).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // unlinkVehicle
  // --------------------------------------------------------------------------

  describe('unlinkVehicle', () => {
    it('should unlink vehicle by clearing eldTelematicsMetadata', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue({ id: 20, tenantId: 1 });
      mockPrisma.vehicle.update.mockResolvedValue({});

      await service.unlinkVehicle(1, 20);

      expect(mockPrisma.vehicle.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 20 } }));
    });

    it('should throw if vehicle not found', async () => {
      mockPrisma.vehicle.findFirst.mockResolvedValue(null);

      await expect(service.unlinkVehicle(1, 99)).rejects.toThrow(NotFoundException);
    });
  });

  // --------------------------------------------------------------------------
  // listEldDrivers / listEldVehicles
  // --------------------------------------------------------------------------

  describe('listEldDrivers', () => {
    it('should return mapped ELD drivers', async () => {
      mockEldAdapter.getDrivers.mockResolvedValue([
        {
          id: 'd1',
          username: 'ELD Driver 1',
          phone: '+11111111111',
          licenseNumber: 'LIC1',
        },
      ]);

      const result = await service.listEldDrivers(1);

      expect(result).toEqual([
        {
          eldId: 'd1',
          name: 'ELD Driver 1',
          detail: '+11111111111 | LIC1',
        },
      ]);
    });
  });

  describe('listEldVehicles', () => {
    it('should return mapped ELD vehicles', async () => {
      mockEldAdapter.getVehicles.mockResolvedValue([{ id: 'v1', vin: 'VIN1', licensePlate: 'LP1', serial: 'S1' }]);

      const result = await service.listEldVehicles(1);

      expect(result).toEqual([{ eldId: 'v1', name: 'VIN1', detail: 'LP1 | S1' }]);
    });
  });

  // --------------------------------------------------------------------------
  // getEldAdapterAndToken (private, tested through linkDriver)
  // --------------------------------------------------------------------------

  describe('getEldAdapterAndToken errors', () => {
    it('should throw NotFoundException if no active ELD integration', async () => {
      mockPrisma.integrationConfig.findFirst.mockResolvedValue(null);
      mockPrisma.driver.findFirst.mockResolvedValue({
        id: 10,
        tenantId: 1,
        name: 'Test',
        eldMetadata: null,
      });

      await expect(service.linkDriver(1, 10)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if no adapter for vendor', async () => {
      mockAdapterFactory.getELDAdapter.mockReturnValueOnce(null);
      mockPrisma.driver.findFirst.mockResolvedValue({
        id: 10,
        tenantId: 1,
        name: 'Test',
        eldMetadata: null,
      });

      await expect(service.linkDriver(1, 10)).rejects.toThrow(BadRequestException);
    });
  });
});
