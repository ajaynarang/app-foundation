import { Test, TestingModule } from '@nestjs/testing';
import { IntegrationDataService } from '../integration-data.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CredentialsService } from '../../credentials/credentials.service';
import { SamsaraELDAdapter } from '../../adapters/eld/samsara-eld.adapter';
import { McLeodTMSAdapter } from '../../adapters/tms/mcleod-tms.adapter';
import { Project44TMSAdapter } from '../../adapters/tms/project44-tms.adapter';
import { EldDataCacheService } from '../eld-data-cache.service';

describe('IntegrationDataService', () => {
  let service: IntegrationDataService;

  const mockPrismaService = {
    integrationConfig: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockCredentialsService = {
    decrypt: jest.fn((value) => value),
  };

  const mockSamsaraAdapter = {
    testConnection: jest.fn(),
  };

  const mockMcLeodAdapter = { testConnection: jest.fn() };
  const mockProject44Adapter = { testConnection: jest.fn() };

  const mockEldDataCacheService = {
    getDriverHOS: jest.fn(),
    getVehicleTelematics: jest.fn(),
    setDriverHOS: jest.fn(),
    setVehicleTelematics: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationDataService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CredentialsService, useValue: mockCredentialsService },
        { provide: SamsaraELDAdapter, useValue: mockSamsaraAdapter },
        { provide: McLeodTMSAdapter, useValue: mockMcLeodAdapter },
        { provide: Project44TMSAdapter, useValue: mockProject44Adapter },
        { provide: EldDataCacheService, useValue: mockEldDataCacheService },
      ],
    }).compile();

    service = module.get<IntegrationDataService>(IntegrationDataService);
    jest.clearAllMocks();
  });

  describe('getDriverHOS', () => {
    it('should delegate to EldDataCacheService', async () => {
      const hosData = {
        driverId: 'DRV-001',
        currentDutyStatus: 'driving',
        driveTimeRemainingMs: 36000000,
        dataSource: 'samsara',
      };
      mockEldDataCacheService.getDriverHOS.mockResolvedValue(hosData);

      const result = await service.getDriverHOS(1, 'DRV-001');

      expect(result).toEqual(hosData);
      expect(mockEldDataCacheService.getDriverHOS).toHaveBeenCalledWith(1, 'DRV-001');
    });

    it('should return null when no data available', async () => {
      mockEldDataCacheService.getDriverHOS.mockResolvedValue(null);

      const result = await service.getDriverHOS(1, 'DRV-001');

      expect(result).toBeNull();
    });
  });

  describe('getVehicleLocation', () => {
    it('should return telematics from cache', async () => {
      mockEldDataCacheService.getVehicleTelematics.mockResolvedValue({
        vehicleId: 'veh-456',
        latitude: 34.05,
        longitude: -118.24,
        speed: 65,
        heading: 270,
        timestamp: '2026-02-09T12:00:00Z',
      });

      const result = await service.getVehicleLocation(1, 'veh-456');

      expect(result).not.toBeNull();
      expect(result.latitude).toBe(34.05);
      expect(result.speed).toBe(65);
    });

    it('should return null when no telematics data in cache', async () => {
      mockEldDataCacheService.getVehicleTelematics.mockResolvedValue(null);

      const result = await service.getVehicleLocation(1, 'veh-456');

      expect(result).toBeNull();
    });
  });

  describe('testConnection', () => {
    it('should throw when integration not found', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue(null);

      await expect(service.testConnection('int_bad')).rejects.toThrow('Integration not found');
    });

    it('should test Samsara ELD connection and update status on success', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 1,
        integrationId: 'int_1',
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'tok_123' },
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      mockSamsaraAdapter.testConnection.mockResolvedValue(true);
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_1');

      expect(result).toBe(true);
      expect(mockSamsaraAdapter.testConnection).toHaveBeenCalledWith('tok_123');
      expect(mockPrismaService.integrationConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'ACTIVE' }),
      });
    });

    it('should update status to ERROR on failed connection', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 1,
        integrationId: 'int_1',
        vendor: 'SAMSARA_ELD',
        credentials: { apiToken: 'tok_123' },
        lastSuccessAt: new Date(),
        lastErrorAt: null,
      });
      mockSamsaraAdapter.testConnection.mockResolvedValue(false);
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_1');

      expect(result).toBe(false);
      expect(mockPrismaService.integrationConfig.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: expect.objectContaining({ status: 'ERROR' }),
      });
    });

    it('should test McLeod TMS connection', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 2,
        integrationId: 'int_2',
        vendor: 'MCLEOD_TMS',
        credentials: { apiKey: 'key_123', baseUrl: 'https://api.mcleod.com' },
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      mockMcLeodAdapter.testConnection.mockResolvedValue(true);
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_2');

      expect(result).toBe(true);
      expect(mockMcLeodAdapter.testConnection).toHaveBeenCalledWith('key_123', 'https://api.mcleod.com');
    });

    it('should test Project44 TMS connection', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 3,
        integrationId: 'int_3',
        vendor: 'PROJECT44_TMS',
        credentials: { clientId: 'cid', clientSecret: 'csec' },
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      mockProject44Adapter.testConnection.mockResolvedValue(true);
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_3');

      expect(result).toBe(true);
      expect(mockProject44Adapter.testConnection).toHaveBeenCalledWith('cid', 'csec');
    });

    it('should return false and update status on exception', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 4,
        integrationId: 'int_4',
        vendor: 'UNSUPPORTED_VENDOR',
        credentials: {},
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_4');

      expect(result).toBe(false);
      expect(mockPrismaService.integrationConfig.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: expect.objectContaining({
          status: 'ERROR',
          lastErrorMessage: expect.stringContaining('This vendor integration is not supported'),
        }),
      });
    });

    it('should handle missing credential fields gracefully', async () => {
      mockPrismaService.integrationConfig.findUnique.mockResolvedValue({
        id: 5,
        integrationId: 'int_5',
        vendor: 'SAMSARA_ELD',
        credentials: {}, // missing apiToken
        lastSuccessAt: null,
        lastErrorAt: null,
      });
      mockPrismaService.integrationConfig.update.mockResolvedValue({});

      const result = await service.testConnection('int_5');

      expect(result).toBe(false);
    });
  });
});
