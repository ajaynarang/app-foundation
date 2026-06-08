import { Test, TestingModule } from '@nestjs/testing';
import { TmsSyncService } from '../tms-sync.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../../credentials/credentials.service';
import { AdapterFactoryService } from '../../adapters/adapter-factory.service';

describe('TmsSyncService', () => {
  let service: TmsSyncService;
  let prisma: PrismaService;

  const mockTmsAdapter = {
    getVehicles: jest.fn(),
    getDrivers: jest.fn(),
    getActiveLoads: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TmsSyncService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: {
              findUnique: jest.fn(),
              update: jest.fn(),
              create: jest.fn(),
            },
            driver: {
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              upsert: jest.fn(),
            },
            integrationConfig: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: CredentialsService,
          useValue: { decrypt: jest.fn((val) => val) },
        },
        {
          provide: AdapterFactoryService,
          useValue: {
            getTMSAdapter: jest.fn().mockReturnValue(mockTmsAdapter),
          },
        },
      ],
    }).compile();

    service = module.get<TmsSyncService>(TmsSyncService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncVehicles', () => {
    it('should fetch and enrich existing vehicles from TMS (no creation)', async () => {
      const mockTmsVehicles = [
        {
          vehicle_id: 'TMS-V001',
          unit_number: 'UNIT-001',
          make: 'FREIGHTLINER',
          model: 'CASCADIA',
          year: 2018,
          vin: '1FUJGHDV9JLJY8062',
          license_plate: 'TX R70-1836',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ];

      const mockExistingVehicle = {
        id: 1,
        externalVehicleId: 'TMS-V001',
        vin: '1FUJGHDV9JLJY8062',
        tenantId: 1,
        syncMetadata: {},
      };

      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getVehicles.mockResolvedValue(mockTmsVehicles);
      // Existing vehicle found by externalVehicleId
      jest.spyOn(prisma.vehicle, 'findUnique').mockResolvedValue(mockExistingVehicle as any);
      jest.spyOn(prisma.vehicle, 'update').mockResolvedValue({} as any);

      const result = await service.syncVehicles(1);

      expect(mockTmsAdapter.getVehicles).toHaveBeenCalledWith('test-id', 'test-secret');

      expect(prisma.vehicle.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            externalVehicleId: 'TMS-V001',
            make: 'FREIGHTLINER',
            model: 'CASCADIA',
          }),
        }),
      );

      // TMS enrichment-only: no creation
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'tms_fetch' }),
          expect.objectContaining({ action: 'vehicle_enriched' }),
          expect.objectContaining({ action: 'summary' }),
        ]),
      );
    });
  });

  describe('syncVehicles — no match', () => {
    it('should skip vehicles with no matching record (ELD creates)', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getVehicles.mockResolvedValue([
        {
          vehicle_id: 'TMS-NOMATCH',
          unit_number: 'X',
          make: 'VOLVO',
          model: 'VNL',
          year: 2020,
          vin: 'NOVIN',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ]);
      jest.spyOn(prisma.vehicle, 'findUnique').mockResolvedValue(null);

      const result = await service.syncVehicles(1);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.actions).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'vehicle_skipped' })]));
    });
  });

  describe('syncVehicles — integration not found', () => {
    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncVehicles(999)).rejects.toThrow('Integration not found');
    });
  });

  describe('syncDrivers — no match', () => {
    it('should skip drivers with no matching record', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getDrivers.mockResolvedValue([
        {
          driver_id: 'TMS-NOMATCH',
          first_name: 'Unknown',
          last_name: 'Driver',
          phone: '+10000000000',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ]);
      jest.spyOn(prisma.driver, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);

      const result = await service.syncDrivers(1);

      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.actions).toEqual(expect.arrayContaining([expect.objectContaining({ action: 'driver_skipped' })]));
    });
  });

  describe('syncDrivers — match by phone', () => {
    it('should match driver by phone when driverId not found', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      const mockExistingDriver = {
        id: 2,
        phone: '+15551234567',
        email: null,
        licenseNumber: null,
        licenseState: null,
        tenantId: 1,
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getDrivers.mockResolvedValue([
        {
          driver_id: null,
          first_name: 'Phone',
          last_name: 'Match',
          phone: '+15551234567',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ]);
      jest.spyOn(prisma.driver, 'findUnique').mockResolvedValue(null);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(mockExistingDriver as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(result.updated).toBe(1);
    });
  });

  describe('syncDrivers — integration not found', () => {
    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncDrivers(999)).rejects.toThrow('Integration not found');
    });
  });

  describe('syncDrivers — match by license', () => {
    it('should match driver by license when driverId and phone not found', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      const mockExistingDriver = {
        id: 3,
        licenseNumber: 'DL-999',
        licenseState: 'CA',
        email: null,
        phone: null,
        tenantId: 1,
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getDrivers.mockResolvedValue([
        {
          driver_id: null,
          first_name: 'License',
          last_name: 'Match',
          phone: null,
          license_number: 'DL-999',
          license_state: 'CA',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ]);
      jest.spyOn(prisma.driver, 'findUnique').mockResolvedValue(null);
      // The service calls findFirst twice: first for phone, then for license
      jest.spyOn(prisma.driver, 'findFirst').mockImplementation(((args: any) => {
        if (args?.where?.licenseNumber) {
          return Promise.resolve(mockExistingDriver as any);
        }
        return Promise.resolve(null);
      }) as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(result.updated).toBe(1);
    });
  });

  describe('syncVehicles — VIN fallback', () => {
    it('should match vehicle by VIN when externalVehicleId not found', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      const mockExistingVehicle = {
        id: 2,
        tenantId: 1,
        vin: 'VIN123',
        syncMetadata: {},
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getVehicles.mockResolvedValue([
        {
          vehicle_id: 'TMS-V002',
          unit_number: 'UNIT-002',
          make: 'VOLVO',
          model: 'VNL',
          year: 2021,
          vin: 'VIN123',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ]);
      jest
        .spyOn(prisma.vehicle, 'findUnique')
        .mockResolvedValueOnce(null) // externalVehicleId match
        .mockResolvedValueOnce(mockExistingVehicle as any); // VIN match
      jest.spyOn(prisma.vehicle, 'update').mockResolvedValue({} as any);

      const result = await service.syncVehicles(1);

      expect(result.updated).toBe(1);
    });
  });

  describe('syncLoads', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'PROJECT44_TMS',
      credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
    };

    beforeEach(() => {
      // Add missing prisma mocks for load sync
      (prisma as any).load = {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      };
      (prisma as any).stop = {
        findFirst: jest.fn(),
        create: jest.fn(),
      };
      (prisma as any).loadStop = {
        deleteMany: jest.fn(),
        create: jest.fn(),
      };
      (prisma as any).customer = {
        findFirst: jest.fn(),
        create: jest.fn(),
      };
    });

    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncLoads(999)).rejects.toThrow('Integration not found');
    });

    it('should create new loads and stops from TMS data', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);

      mockTmsAdapter.getActiveLoads.mockResolvedValue([
        {
          load_id: 'TMS-L001',
          load_number: 'L001',
          customer_name: 'Acme Corp',
          weight_lbs: 40000,
          commodity_type: 'dry goods',
          special_requirements: null,
          status: 'IN_TRANSIT',
          stops: null,
          pickup_location: {
            address: '123 Main St',
            city: 'Dallas',
            state: 'TX',
            zip: '75201',
            latitude: 32.78,
            longitude: -96.8,
          },
          delivery_location: {
            address: '456 Oak Ave',
            city: 'Houston',
            state: 'TX',
            zip: '77001',
            latitude: 29.76,
            longitude: -95.37,
          },
        },
      ]);

      (prisma as any).stop.findFirst.mockResolvedValue(null);
      (prisma as any).stop.create.mockResolvedValueOnce({ id: 10 }).mockResolvedValueOnce({ id: 11 });
      (prisma as any).load.findUnique.mockResolvedValue(null); // new load
      (prisma as any).customer.findFirst.mockResolvedValue({ id: 5 });
      (prisma as any).load.upsert.mockResolvedValue({ id: 100 });
      (prisma as any).loadStop.deleteMany.mockResolvedValue({});
      (prisma as any).loadStop.create.mockResolvedValue({});

      const result = await service.syncLoads(1);

      expect(result.created).toBe(1);
      expect(result.updated).toBe(0);
      expect((prisma as any).load.upsert).toHaveBeenCalled();
    });

    it('should update existing loads', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);

      mockTmsAdapter.getActiveLoads.mockResolvedValue([
        {
          load_id: 'TMS-L001',
          load_number: 'L001',
          customer_name: null,
          weight_lbs: null,
          commodity_type: null,
          special_requirements: null,
          status: 'DELIVERED',
          stops: [
            {
              address: '123 Main',
              city: 'Dallas',
              state: 'TX',
              zip: '75201',
              latitude: 32.78,
              longitude: -96.8,
            },
            {
              address: '456 Oak',
              city: 'Houston',
              state: 'TX',
              zip: '77001',
              latitude: 29.76,
              longitude: -95.37,
            },
          ],
        },
      ]);

      (prisma as any).stop.findFirst.mockResolvedValue({ id: 10 }); // existing stop
      (prisma as any).load.findUnique.mockResolvedValue({
        id: 100,
        status: 'IN_TRANSIT',
      }); // existing load
      (prisma as any).load.upsert.mockResolvedValue({ id: 100 });
      (prisma as any).loadStop.deleteMany.mockResolvedValue({});
      (prisma as any).loadStop.create.mockResolvedValue({});

      const result = await service.syncLoads(1);

      expect(result.updated).toBe(1);
      expect(result.created).toBe(0);
    });

    it('should auto-create customer when not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);

      mockTmsAdapter.getActiveLoads.mockResolvedValue([
        {
          load_id: 'TMS-L002',
          load_number: 'L002',
          customer_name: 'New Customer',
          weight_lbs: 30000,
          commodity_type: 'frozen',
          special_requirements: null,
          status: 'ASSIGNED',
          stops: null,
          pickup_location: {
            address: '1 St',
            city: 'A',
            state: 'TX',
            zip: '75001',
            latitude: 32.0,
            longitude: -96.0,
          },
          delivery_location: {
            address: '2 St',
            city: 'B',
            state: 'TX',
            zip: '77001',
            latitude: 29.0,
            longitude: -95.0,
          },
        },
      ]);

      (prisma as any).stop.findFirst.mockResolvedValue(null);
      (prisma as any).stop.create.mockResolvedValue({ id: 20 });
      (prisma as any).load.findUnique.mockResolvedValue(null);
      (prisma as any).customer.findFirst.mockResolvedValue(null); // not found
      (prisma as any).customer.create.mockResolvedValue({ id: 99 }); // auto-created
      (prisma as any).load.upsert.mockResolvedValue({ id: 200 });
      (prisma as any).loadStop.deleteMany.mockResolvedValue({});
      (prisma as any).loadStop.create.mockResolvedValue({});

      await service.syncLoads(1);

      expect((prisma as any).customer.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyName: 'New Customer',
            tenantId: 1,
          }),
        }),
      );
    });
  });

  describe('syncDrivers', () => {
    it('should fetch and enrich existing drivers from TMS (no creation)', async () => {
      const mockTmsDrivers = [
        {
          driver_id: 'TMS-D001',
          first_name: 'John',
          last_name: 'Smith',
          phone: '+19788856169',
          license_number: 'NHL14227039',
          license_state: 'NH',
          status: 'ACTIVE',
          data_source: 'project44',
        },
      ];

      const mockExistingDriver = {
        id: 1,
        driverId: 'TMS-D001',
        externalDriverId: 'TMS-D001',
        phone: '+19788856169',
        email: null,
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
        tenantId: 1,
      };

      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'test-id', clientSecret: 'test-secret' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockTmsAdapter.getDrivers.mockResolvedValue(mockTmsDrivers);
      // Existing driver found by driverId
      jest.spyOn(prisma.driver, 'findUnique').mockResolvedValue(mockExistingDriver as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(mockTmsAdapter.getDrivers).toHaveBeenCalledWith('test-id', 'test-secret');

      expect(prisma.driver.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            name: 'John Smith',
          }),
        }),
      );

      // TMS enrichment-only: no creation
      expect(result.created).toBe(0);
      expect(result.updated).toBe(1);
      expect(result.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'tms_fetch' }),
          expect.objectContaining({ action: 'driver_enriched' }),
          expect.objectContaining({ action: 'summary' }),
        ]),
      );
    });
  });
});
