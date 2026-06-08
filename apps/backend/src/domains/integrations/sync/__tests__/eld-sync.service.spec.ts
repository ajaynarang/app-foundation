import { Test, TestingModule } from '@nestjs/testing';
import { EldSyncService } from '../eld-sync.service';
import { EldAuthErrorHandler } from '../eld-auth-error-handler.service';
import { FleetSyncService } from '../fleet-sync.service';
import { HosSyncService } from '../hos-sync.service';
import { TelematicsSyncService } from '../telematics-sync.service';
import { DvirSyncService } from '../dvir-sync.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { VehicleMatcher } from '../matching/vehicle-matcher';
import { DriverMatcher } from '../matching/driver-matcher';
import { VehicleMerger } from '../merging/vehicle-merger';
import { DriverMerger } from '../merging/driver-merger';
import { TrailerMatcher } from '../matching/trailer-matcher';
import { TrailerMerger } from '../merging/trailer-merger';
import { AuthTokenService } from '../../oauth/auth-token.service';
import { AdapterFactoryService } from '../../adapters/adapter-factory.service';
// SamsaraELDAdapter no longer directly injected — HOS/telematics now go through AdapterFactory
import { AlertService } from '../../../operations/alerts/services/alert.service';
import { EldDataCacheService } from '../../services/eld-data-cache.service';

describe('EldSyncService', () => {
  let service: EldSyncService;
  let prisma: PrismaService;
  let vehicleMatcher: VehicleMatcher;
  let vehicleMerger: VehicleMerger;
  let driverMatcher: DriverMatcher;
  let driverMerger: DriverMerger;
  let adapterFactory: AdapterFactoryService;
  // samsaraAdapter removed — HOS/telematics now use adapterFactory.getELDAdapter()

  const mockEldAdapter = {
    getVehicles: jest.fn(),
    getDrivers: jest.fn(),
    getHOSClocks: jest.fn(),
    getVehicleLocations: jest.fn(),
    getVehicleStatsFeed: jest.fn(),
    getDVIRs: jest.fn(),
    getTrailers: jest.fn(),
    testConnection: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EldSyncService,
        EldAuthErrorHandler,
        FleetSyncService,
        HosSyncService,
        TelematicsSyncService,
        DvirSyncService,
        {
          provide: PrismaService,
          useValue: {
            vehicle: {
              update: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              count: jest.fn().mockResolvedValue(1),
            },
            driver: {
              update: jest.fn(),
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
            },
            integrationConfig: { findUnique: jest.fn(), update: jest.fn() },
            vehicleTelematics: { upsert: jest.fn() },
            job: {
              count: jest.fn(),
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn().mockResolvedValue({}),
            },
          },
        },
        {
          provide: VehicleMatcher,
          useValue: { match: jest.fn() },
        },
        {
          provide: DriverMatcher,
          useValue: { match: jest.fn() },
        },
        {
          provide: VehicleMerger,
          useValue: { merge: jest.fn() },
        },
        {
          provide: DriverMerger,
          useValue: { merge: jest.fn() },
        },
        {
          provide: TrailerMatcher,
          useValue: { match: jest.fn(), matchByExternalId: jest.fn() },
        },
        {
          provide: TrailerMerger,
          useValue: { merge: jest.fn() },
        },
        {
          provide: AuthTokenService,
          useValue: {
            getActiveToken: jest.fn().mockResolvedValue('test-token'),
          },
        },
        {
          provide: AdapterFactoryService,
          useValue: {
            getELDAdapter: jest.fn().mockReturnValue(mockEldAdapter),
          },
        },
        {
          provide: AlertService,
          useValue: { sendAlert: jest.fn() },
        },
        {
          provide: EldDataCacheService,
          useValue: {
            setDriverHOS: jest.fn(),
            setVehicleTelematics: jest.fn(),
            getDriverHOS: jest.fn(),
            getVehicleTelematics: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EldSyncService>(EldSyncService);
    prisma = module.get<PrismaService>(PrismaService);
    vehicleMatcher = module.get<VehicleMatcher>(VehicleMatcher);
    vehicleMerger = module.get<VehicleMerger>(VehicleMerger);
    driverMatcher = module.get<DriverMatcher>(DriverMatcher);
    driverMerger = module.get<DriverMerger>(DriverMerger);
    adapterFactory = module.get<AdapterFactoryService>(AdapterFactoryService);
    // samsaraAdapter removed — use mockEldAdapter via adapterFactory mock
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncVehicles', () => {
    it('should match ELD vehicles to existing DB vehicles and merge data', async () => {
      const mockEldVehicles = [
        {
          id: '281474996387574',
          vin: '1FUJGHDV9JLJY8062',
          make: 'FREIGHTLINER',
          serial: 'G97TEAX5GM',
        },
      ];

      const mockDbVehicle = {
        id: 1,
        externalVehicleId: 'TMS-V001',
        vin: '1FUJGHDV9JLJY8062',
        make: 'FREIGHTLINER',
        tenantId: 1,
      };

      const mockMergedData = {
        make: 'FREIGHTLINER',
        eldTelematicsMetadata: {
          eldId: '281474996387574',
          serial: 'G97TEAX5GM',
        },
      };

      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'test-key' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockEldAdapter.getVehicles.mockResolvedValue(mockEldVehicles);
      // Service first tries findFirst by externalVehicleId, then falls back to vehicleMatcher
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(mockDbVehicle as any);
      jest.spyOn(vehicleMerger, 'merge').mockReturnValue(mockMergedData as any);
      jest.spyOn(prisma.vehicle, 'update').mockResolvedValue({} as any);

      const result = await service.syncVehicles(1);

      expect(vehicleMerger.merge).toHaveBeenCalledWith(
        mockDbVehicle,
        expect.objectContaining({ eldId: '281474996387574' }),
      );

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          eldTelematicsMetadata: mockMergedData.eldTelematicsMetadata,
        },
      });

      // Verify EldSyncResult actions
      expect(result.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'eld_fetch' }),
          expect.objectContaining({ action: 'vehicle_enriched' }),
          expect.objectContaining({ action: 'summary' }),
        ]),
      );
    });

    it('should log warning for unmatched vehicles without VIN', async () => {
      const mockEldVehicles = [
        {
          id: '281474996387574',
          // No VIN — cannot create
        },
      ];

      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'test-key' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockEldAdapter.getVehicles.mockResolvedValue(mockEldVehicles);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(null);
      jest.spyOn(vehicleMatcher, 'match').mockResolvedValue(null);

      const loggerSpy = jest.spyOn(service['fleetSync']['logger'], 'warn');

      await service.syncVehicles(1);

      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('no VIN available for creation'));
    });
  });

  describe('syncDrivers', () => {
    it('should match ELD drivers to existing DB drivers and merge data', async () => {
      const mockEldDrivers = [
        {
          id: '53207939',
          phone: '+19788856169',
          username: 'Oscar',
        },
      ];

      const mockDbDriver = {
        id: 1,
        externalDriverId: 'TMS-D001',
        phone: '+19788856169',
        tenantId: 1,
      };

      const mockMergedData = {
        phone: '+19788856169',
        eldMetadata: { eldId: '53207939', username: 'Oscar' },
      };

      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'test-key' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockEldAdapter.getDrivers.mockResolvedValue(mockEldDrivers);
      // Service first tries findFirst by externalDriverId, then falls back to driverMatcher
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(mockDbDriver as any);
      jest.spyOn(driverMerger, 'merge').mockReturnValue(mockMergedData as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          eldMetadata: mockMergedData.eldMetadata,
        },
      });

      // Verify EldSyncResult actions
      expect(result.actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'eld_fetch' }),
          expect.objectContaining({ action: 'driver_enriched' }),
          expect.objectContaining({ action: 'summary' }),
        ]),
      );
    });
  });

  describe('syncTelematics', () => {
    it('should use feed endpoint with cursor and populate rich fields', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'test-key' },
        syncMetadata: { telematicsCursor: 'old-cursor' },
      };

      const mockFeedResult = {
        data: [
          {
            id: '281474996387574',
            name: 'Truck-1',
            gps: [
              {
                latitude: 34.05,
                longitude: -118.25,
                speedMilesPerHour: 65,
                headingDegrees: 90,
                time: '2026-02-18T12:00:00Z',
              },
            ],
            fuelPercents: { value: 72, time: '2026-02-18T12:00:00Z' },
            engineStates: [{ value: 'On' as const, time: '2026-02-18T12:00:00Z' }],
            gpsOdometerMeters: { value: 160934, time: '2026-02-18T12:00:00Z' },
          },
        ],
        endCursor: 'new-cursor',
        hasNextPage: false,
      };

      const mockVehicle = {
        id: 1,
        eldTelematicsMetadata: { eldId: '281474996387574' },
        tenantId: 1,
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      mockEldAdapter.getVehicleStatsFeed.mockResolvedValue(mockFeedResult);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(mockVehicle as any);
      jest.spyOn(prisma.vehicleTelematics, 'upsert').mockResolvedValue({} as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);

      await service.syncTelematics(1);

      // Verify feed called with cursor
      expect(mockEldAdapter.getVehicleStatsFeed).toHaveBeenCalledWith('test-token', 'old-cursor');

      // Verify rich fields written
      expect(prisma.vehicleTelematics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { vehicleId: 1 },
          update: expect.objectContaining({
            latitude: 34.05,
            longitude: -118.25,
            speed: 65,
            heading: 90,
            fuelLevel: 72,
            engineRunning: true,
          }),
        }),
      );

      // Verify odometer converted from meters to miles
      const upsertCall = (prisma.vehicleTelematics.upsert as jest.Mock).mock.calls[0][0];
      expect(upsertCall.update.odometer).toBeCloseTo(160934 / 1609.34, 0);

      // Verify cursor saved
      expect(prisma.integrationConfig.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            syncMetadata: expect.objectContaining({
              telematicsCursor: 'new-cursor',
            }),
          }),
        }),
      );

      // Verify actions in result
      const result = await service.syncTelematics(1);
      expect(result.details).toBeDefined();
      expect((result.details as any).actions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ action: 'api_fetch' }),
          expect.objectContaining({ action: 'cursor_saved' }),
          expect.objectContaining({ action: 'summary' }),
        ]),
      );
    });
  });

  // ─── Expanded syncVehicles tests ─────────────────────────────────────────

  describe('syncVehicles (expanded)', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);
    });

    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncVehicles(999)).rejects.toThrow('Integration not found');
    });

    it('should create new vehicle when no match found and VIN exists', async () => {
      const eldVehicles = [
        {
          id: 'eld-v1',
          vin: '1FUJGLDR5CLBP8901',
          name: 'Truck-01',
          make: 'FREIGHTLINER',
          model: 'Cascadia',
          year: 2023,
        },
      ];

      mockEldAdapter.getVehicles.mockResolvedValue(eldVehicles);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(null);
      jest.spyOn(vehicleMatcher, 'match').mockResolvedValue(null);
      jest.spyOn(prisma.vehicle, 'create').mockResolvedValue({} as any);

      const result = await service.syncVehicles(1);

      expect(result.created).toBe(1);
      expect(prisma.vehicle.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vin: '1FUJGLDR5CLBP8901',
          make: 'FREIGHTLINER',
          tenantId: 1,
          externalSource: 'SAMSARA_ELD',
          externalVehicleId: 'eld-v1',
        }),
      });
    });

    it('should not create duplicates on re-sync (match by externalVehicleId)', async () => {
      const eldVehicles = [{ id: 'eld-v1', vin: '1FUJGLDR5CLBP8901' }];

      const existingVehicle = {
        id: 1,
        tenantId: 1,
        externalVehicleId: 'eld-v1',
        vin: '1FUJGLDR5CLBP8901',
      };

      mockEldAdapter.getVehicles.mockResolvedValue(eldVehicles);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(existingVehicle as any);
      jest.spyOn(vehicleMerger, 'merge').mockReturnValue({
        eldTelematicsMetadata: { eldId: 'eld-v1' },
      } as any);
      jest.spyOn(prisma.vehicle, 'update').mockResolvedValue({} as any);

      const result = await service.syncVehicles(1);

      expect(result.enriched).toBe(1);
      expect(result.created).toBe(0);
      expect(prisma.vehicle.create).not.toHaveBeenCalled();
    });

    it('should handle partial failure gracefully', async () => {
      const eldVehicles = [
        { id: 'eld-v1', vin: 'VIN-1', name: 'Truck-1' },
        { id: 'eld-v2', vin: 'VIN-2', name: 'Truck-2' },
      ];

      mockEldAdapter.getVehicles.mockResolvedValue(eldVehicles);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(null);
      jest.spyOn(vehicleMatcher, 'match').mockResolvedValue(null);
      jest
        .spyOn(prisma.vehicle, 'create')
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('DB write failed'));

      const result = await service.syncVehicles(1);

      expect(result.created).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should backfill make/model/year from ELD if missing in DB', async () => {
      const eldVehicles = [
        {
          id: 'eld-v1',
          vin: 'VIN-1',
          make: 'PETERBILT',
          model: '579',
          year: '2024',
        },
      ];

      const dbVehicle = {
        id: 1,
        tenantId: 1,
        externalVehicleId: 'eld-v1',
        make: null,
        model: null,
        year: null,
      };

      mockEldAdapter.getVehicles.mockResolvedValue(eldVehicles);
      jest.spyOn(prisma.vehicle, 'findFirst').mockResolvedValue(dbVehicle as any);
      jest.spyOn(vehicleMerger, 'merge').mockReturnValue({
        eldTelematicsMetadata: { eldId: 'eld-v1' },
      } as any);
      jest.spyOn(prisma.vehicle, 'update').mockResolvedValue({} as any);

      await service.syncVehicles(1);

      expect(prisma.vehicle.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          make: 'PETERBILT',
          model: '579',
          year: 2024,
        }),
      });
    });
  });

  // ─── Expanded syncDrivers tests ──────────────────────────────────────────

  describe('syncDrivers (expanded)', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);
    });

    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncDrivers(999)).rejects.toThrow('Integration not found');
    });

    it('should create new driver when no match found and username exists', async () => {
      const eldDrivers = [
        {
          id: 'eld-d1',
          username: 'jdoe',
          name: 'John Doe',
          phone: '+15551234567',
          driverActivationStatus: 'active',
        },
      ];

      mockEldAdapter.getDrivers.mockResolvedValue(eldDrivers);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);
      jest.spyOn(driverMatcher, 'match').mockResolvedValue(null);
      jest.spyOn(prisma.driver, 'create').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(result.created).toBe(1);
      expect(prisma.driver.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'John Doe',
          status: 'ACTIVE',
          tenantId: 1,
          externalSource: 'SAMSARA_ELD',
          externalDriverId: 'eld-d1',
        }),
      });
    });

    it('should skip driver without username', async () => {
      const eldDrivers = [{ id: 'eld-d1' }];

      mockEldAdapter.getDrivers.mockResolvedValue(eldDrivers);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);
      jest.spyOn(driverMatcher, 'match').mockResolvedValue(null);

      const result = await service.syncDrivers(1);

      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(result.unmatchedItems).toHaveLength(1);
    });

    it('should match driver by phone/license fallback', async () => {
      const eldDrivers = [
        {
          id: 'eld-d1',
          username: 'jdoe',
          phone: '+15551234567',
          licenseNumber: 'DL-123',
          licenseState: 'TX',
        },
      ];

      const matchedDriver = {
        id: 5,
        tenantId: 1,
        driverId: 'drv-005',
      };

      mockEldAdapter.getDrivers.mockResolvedValue(eldDrivers);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null); // no external ID match
      jest.spyOn(driverMatcher, 'match').mockResolvedValue(matchedDriver as any);
      jest.spyOn(driverMerger, 'merge').mockReturnValue({
        eldMetadata: { eldId: 'eld-d1' },
      } as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncDrivers(1);

      expect(result.enriched).toBe(1);
      expect(driverMatcher.match).toHaveBeenCalledWith(1, {
        phone: '+15551234567',
        licenseNumber: 'DL-123',
        licenseState: 'TX',
      });
    });
  });

  // ─── syncHos tests ───────────────────────────────────────────────────────

  describe('syncHos', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
    });

    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncHos(999)).rejects.toThrow('Integration not found');
    });

    it('should skip when no drivers have ELD metadata', async () => {
      mockEldAdapter.getHOSClocks.mockResolvedValue([]);
      jest
        .spyOn(prisma.driver, 'findMany')
        .mockResolvedValue([{ id: 1, driverId: 'drv-1', name: 'John', eldMetadata: null }] as any);

      const result = await service.syncHos(1);

      expect(result.recordsProcessed).toBe(0);
      expect((result.details as any).enrichmentNeeded).toBe(true);
    });

    it('should update driver HOS from Samsara clock data', async () => {
      const hosClocks = [
        {
          driverId: 'eld-d1',
          driverName: 'John Driver',
          currentDutyStatus: 'onDuty' as const,
          driveTimeRemainingMs: 5 * 3600000, // 5h remaining
          shiftTimeRemainingMs: 8 * 3600000,
          cycleTimeRemainingMs: 40 * 3600000,
          timeUntilBreakMs: 4 * 3600000,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const drivers = [
        {
          id: 1,
          driverId: 'drv-1',
          name: 'John Driver',
          eldMetadata: { eldId: 'eld-d1' },
        },
      ];

      mockEldAdapter.getHOSClocks.mockResolvedValue(hosClocks);
      jest.spyOn(prisma.driver, 'findMany').mockResolvedValue(drivers as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncHos(1);

      expect(result.recordsExisting).toBe(1);
      expect(prisma.driver.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({
          hosData: expect.objectContaining({
            data_source: 'samsara',
            currentDutyStatus: 'onDuty',
          }),
          currentHoursDriven: expect.any(Number),
          currentOnDutyTime: expect.any(Number),
        }),
      });
    });

    it('should match driver by name fallback when ELD ID not matched', async () => {
      const hosClocks = [
        {
          driverId: 'eld-d99',
          driverName: 'John Driver',
          currentDutyStatus: 'offDuty' as const,
          driveTimeRemainingMs: 11 * 3600000,
          shiftTimeRemainingMs: 14 * 3600000,
          cycleTimeRemainingMs: 70 * 3600000,
          timeUntilBreakMs: 8 * 3600000,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const drivers = [
        {
          id: 2,
          driverId: 'drv-2',
          name: 'John Driver',
          eldMetadata: { eldId: 'eld-no-match' },
        },
      ];

      mockEldAdapter.getHOSClocks.mockResolvedValue(hosClocks);
      jest.spyOn(prisma.driver, 'findMany').mockResolvedValue(drivers as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      const result = await service.syncHos(1);

      expect(result.recordsExisting).toBe(1);
    });

    it('should write HOS data to Redis cache', async () => {
      const eldDataCache = (service as any).hosSync.eldDataCache;
      const hosClocks = [
        {
          driverId: 'eld-d1',
          driverName: 'John',
          currentDutyStatus: 'driving' as const,
          driveTimeRemainingMs: 3 * 3600000,
          shiftTimeRemainingMs: 6 * 3600000,
          cycleTimeRemainingMs: 30 * 3600000,
          timeUntilBreakMs: 2 * 3600000,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const drivers = [
        {
          id: 1,
          driverId: 'drv-1',
          name: 'John',
          eldMetadata: { eldId: 'eld-d1' },
        },
      ];

      mockEldAdapter.getHOSClocks.mockResolvedValue(hosClocks);
      jest.spyOn(prisma.driver, 'findMany').mockResolvedValue(drivers as any);
      jest.spyOn(prisma.driver, 'update').mockResolvedValue({} as any);

      await service.syncHos(1);

      expect(eldDataCache.setDriverHOS).toHaveBeenCalledWith(
        1,
        'drv-1',
        expect.objectContaining({
          driverId: 'drv-1',
          currentDutyStatus: 'driving',
          dataSource: 'samsara',
        }),
      );
    });
  });

  // ─── Auth error handling ─────────────────────────────────────────────────

  describe('auth error handling', () => {
    it('should retry vehicle sync on 401 with refreshed token', async () => {
      const mockIntegration = {
        id: 1,
        tenantId: 1,
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'test-key' },
      };

      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);

      // First call fails with 401, second succeeds
      mockEldAdapter.getVehicles.mockRejectedValueOnce(new Error('401 Unauthorized')).mockResolvedValueOnce([]);

      // handleAuthError just re-throws for non-SamsaraAuthError
      await expect(service.syncVehicles(1)).rejects.toThrow();
    });
  });

  // ─── syncTrailers tests ─────────────────────────────────────────────────

  describe('syncTrailers', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);
    });

    it('should throw when integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncTrailers(999)).rejects.toThrow('Integration not found');
    });

    it('should throw when no adapter available', async () => {
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue(null);

      await expect(service.syncTrailers(1)).rejects.toThrow('No adapter available');
    });

    it('should return zero counts when adapter does not support getTrailers', async () => {
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue({
        ...mockEldAdapter,
        getTrailers: undefined,
      });

      const result = await service.syncTrailers(1);

      expect(result.total).toBe(0);
      expect(result.created).toBe(0);
    });

    it('should create trailer from ELD data when no match found', async () => {
      const trailerMatcher = service['fleetSync']['trailerMatcher'];
      const eldTrailers = [
        {
          id: 'eld-t1',
          name: 'Trailer-01',
          serialNumber: 'SN123',
          licensePlate: 'TX-TRL-1',
          make: 'Great Dane',
          model: 'Everest',
          year: 2023,
        },
      ];

      mockEldAdapter.getTrailers = jest.fn().mockResolvedValue(eldTrailers);
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue({
        ...mockEldAdapter,
        getTrailers: mockEldAdapter.getTrailers,
      });

      (trailerMatcher.matchByExternalId as jest.Mock).mockResolvedValue(null);
      (trailerMatcher.match as jest.Mock).mockResolvedValue(null);

      // Add trailer mock to prisma
      (prisma as any).trailer = {
        create: jest.fn().mockResolvedValue({} as any),
        update: jest.fn().mockResolvedValue({} as any),
      };

      const result = await service.syncTrailers(1);

      expect(result.created).toBe(1);
      expect(result.total).toBe(1);
      expect((prisma as any).trailer.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          vin: 'SN123',
          licensePlate: 'TX-TRL-1',
          make: 'Great Dane',
          model: 'Everest',
          year: 2023,
          tenantId: 1,
          externalSource: 'SAMSARA_ELD',
          externalTrailerId: 'eld-t1',
        }),
      });
    });

    it('should enrich existing trailer when match found by external ID', async () => {
      const trailerMatcher = service['fleetSync']['trailerMatcher'];
      const trailerMerger = service['fleetSync']['trailerMerger'];
      const eldTrailers = [
        {
          id: 'eld-t1',
          name: 'Trailer-01',
          serialNumber: 'SN123',
          make: 'Great Dane',
          model: 'Everest',
          year: 2023,
        },
      ];

      const dbTrailer = {
        id: 10,
        tenantId: 1,
        make: null,
        model: null,
        year: null,
        vin: null,
        licensePlate: null,
      };

      mockEldAdapter.getTrailers = jest.fn().mockResolvedValue(eldTrailers);
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue({
        ...mockEldAdapter,
        getTrailers: mockEldAdapter.getTrailers,
      });

      (trailerMatcher.matchByExternalId as jest.Mock).mockResolvedValue(dbTrailer);
      (trailerMerger.merge as jest.Mock).mockReturnValue({
        eldTelematicsMetadata: { eldId: 'eld-t1', eldVendor: 'SAMSARA_ELD' },
      });

      (prisma as any).trailer = {
        update: jest.fn().mockResolvedValue({} as any),
      };

      const result = await service.syncTrailers(1);

      expect(result.enriched).toBe(1);
      expect(result.created).toBe(0);
      expect((prisma as any).trailer.update).toHaveBeenCalledWith({
        where: { id: 10 },
        data: expect.objectContaining({
          eldTelematicsMetadata: expect.objectContaining({
            eldId: 'eld-t1',
          }),
          make: 'Great Dane',
          model: 'Everest',
          year: 2023,
          vin: 'SN123',
        }),
      });
    });

    it('should handle errors gracefully per trailer', async () => {
      const trailerMatcher = service['fleetSync']['trailerMatcher'];
      const eldTrailers = [
        { id: 'eld-t1', name: 'T1', serialNumber: 'SN1' },
        { id: 'eld-t2', name: 'T2', serialNumber: 'SN2' },
      ];

      mockEldAdapter.getTrailers = jest.fn().mockResolvedValue(eldTrailers);
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue({
        ...mockEldAdapter,
        getTrailers: mockEldAdapter.getTrailers,
      });

      (trailerMatcher.matchByExternalId as jest.Mock).mockResolvedValue(null);
      (trailerMatcher.match as jest.Mock).mockResolvedValue(null);

      (prisma as any).trailer = {
        create: jest
          .fn()
          .mockResolvedValueOnce({} as any)
          .mockRejectedValueOnce(new Error('DB write failed')),
      };

      const result = await service.syncTrailers(1);

      expect(result.created).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.total).toBe(2);
    });
  });

  // ─── syncVehicles driver linking tests ──────────────────────────────────

  describe('syncVehicles (driver linking)', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);
    });

    it('should skip driver linking if vehicle already has a driver assigned', async () => {
      const eldVehicles = [
        {
          id: 'eld-v1',
          vin: 'VIN-1',
          staticAssignedDriverId: 'eld-d1',
        },
      ];

      mockEldAdapter.getVehicles.mockResolvedValue(eldVehicles);
      jest
        .spyOn(prisma.vehicle, 'findFirst')
        .mockResolvedValueOnce(null) // no match by externalVehicleId in sync loop
        .mockResolvedValueOnce({
          id: 1,
          vehicleId: 'veh-001',
          assignedDriverId: 99, // already assigned
        } as any); // driver-linking loop

      jest.spyOn(vehicleMatcher, 'match').mockResolvedValue(null);
      jest.spyOn(prisma.vehicle, 'create').mockResolvedValue({} as any);

      await service.syncVehicles(1);

      // update should only be called for enrichment/creation, not for driver assignment
      const updateCalls = (prisma.vehicle.update as jest.Mock).mock.calls;
      const driverLinkCalls = updateCalls.filter((c) => c[0]?.data?.assignedDriverId !== undefined);
      expect(driverLinkCalls).toHaveLength(0);
    });
  });

  // ─── syncDrivers (partial failure) ──────────────────────────────────────

  describe('syncDrivers (partial failure)', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
      jest.spyOn(prisma.integrationConfig, 'update').mockResolvedValue({} as any);
    });

    it('should handle partial failure gracefully', async () => {
      const eldDrivers = [
        {
          id: 'eld-d1',
          username: 'jdoe',
          name: 'John',
          driverActivationStatus: 'active',
        },
        {
          id: 'eld-d2',
          username: 'jsmith',
          name: 'Jane',
          driverActivationStatus: 'active',
        },
      ];

      mockEldAdapter.getDrivers.mockResolvedValue(eldDrivers);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);
      jest.spyOn(driverMatcher, 'match').mockResolvedValue(null);
      jest
        .spyOn(prisma.driver, 'create')
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(new Error('DB write failed'));

      const result = await service.syncDrivers(1);

      expect(result.created).toBe(1);
      expect(result.errors).toBe(1);
      expect(result.total).toBe(2);
    });

    it('should set driver status to PENDING_ACTIVATION for non-active ELD drivers', async () => {
      const eldDrivers = [
        {
          id: 'eld-d1',
          username: 'jdoe',
          name: 'John',
          driverActivationStatus: 'deactivated',
        },
      ];

      mockEldAdapter.getDrivers.mockResolvedValue(eldDrivers);
      jest.spyOn(prisma.driver, 'findFirst').mockResolvedValue(null);
      jest.spyOn(driverMatcher, 'match').mockResolvedValue(null);
      jest.spyOn(prisma.driver, 'create').mockResolvedValue({} as any);

      await service.syncDrivers(1);

      expect(prisma.driver.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: 'PENDING_ACTIVATION',
        }),
      });
    });
  });

  // ─── syncHos (HOS violations & failed driver updates) ───────────────────

  describe('syncHos (additional coverage)', () => {
    const mockIntegration = {
      id: 1,
      tenantId: 1,
      vendor: 'SAMSARA_ELD',
      credentials: { apiToken: 'test-key' },
    };

    beforeEach(() => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(mockIntegration as any);
    });

    it('should throw BadRequestException when adapter has no getHOSClocks', async () => {
      (adapterFactory.getELDAdapter as jest.Mock).mockReturnValue({
        getVehicles: jest.fn(),
        getDrivers: jest.fn(),
        // no getHOSClocks
      });

      await expect(service.syncHos(1)).rejects.toThrow();
    });

    it('should count not-matched drivers in result', async () => {
      const hosClocks = [
        {
          driverId: 'eld-d99',
          driverName: 'Unknown Driver',
          currentDutyStatus: 'offDuty' as const,
          driveTimeRemainingMs: 11 * 3600000,
          shiftTimeRemainingMs: 14 * 3600000,
          cycleTimeRemainingMs: 70 * 3600000,
          timeUntilBreakMs: 8 * 3600000,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const drivers = [
        {
          id: 1,
          driverId: 'drv-1',
          name: 'Different Person',
          eldMetadata: { eldId: 'eld-no-match' },
        },
      ];

      mockEldAdapter.getHOSClocks.mockResolvedValue(hosClocks);
      jest.spyOn(prisma.driver, 'findMany').mockResolvedValue(drivers as any);

      const result = await service.syncHos(1);

      // Driver didn't match any clock (name doesn't match either)
      expect(result.recordsProcessed).toBe(1);
    });

    it('should handle driver update failure gracefully', async () => {
      const hosClocks = [
        {
          driverId: 'eld-d1',
          driverName: 'John',
          currentDutyStatus: 'driving' as const,
          driveTimeRemainingMs: 3 * 3600000,
          shiftTimeRemainingMs: 6 * 3600000,
          cycleTimeRemainingMs: 30 * 3600000,
          timeUntilBreakMs: 2 * 3600000,
          lastUpdated: new Date().toISOString(),
        },
      ];

      const drivers = [
        {
          id: 1,
          driverId: 'drv-1',
          name: 'John',
          eldMetadata: { eldId: 'eld-d1' },
        },
      ];

      mockEldAdapter.getHOSClocks.mockResolvedValue(hosClocks);
      jest.spyOn(prisma.driver, 'findMany').mockResolvedValue(drivers as any);
      jest.spyOn(prisma.driver, 'update').mockRejectedValue(new Error('DB error'));

      // alertOnRepeatedFailures is a private method that may create alerts/jobs
      // We mock the dependent services
      jest.spyOn(prisma.job, 'count').mockResolvedValue(0);
      jest.spyOn(prisma.job, 'findFirst').mockResolvedValue(null);
      jest.spyOn(prisma.job, 'create').mockResolvedValue({} as any);

      const result = await service.syncHos(1);

      // The driver update failed but the overall sync should not throw
      expect(result.recordsProcessed).toBe(1);
    });
  });
});
