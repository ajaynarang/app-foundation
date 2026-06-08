import { Test, TestingModule } from '@nestjs/testing';
import { OperationsSettingsService } from '../operations-settings.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

describe('OperationsSettingsService', () => {
  let service: OperationsSettingsService;
  let prisma: any;
  let cache: any;

  beforeEach(async () => {
    prisma = {
      fleetOperationsSettings: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OperationsSettingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<OperationsSettingsService>(OperationsSettingsService);
  });

  describe('getSettings', () => {
    it('should return existing settings', async () => {
      const settings = { tenantId: 1, costPerMile: 2.0 };
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(settings);

      const result = await service.getSettings(1);

      expect(result).toEqual(settings);
    });

    it('should create defaults when settings do not exist', async () => {
      prisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      const created = { tenantId: 1, costPerMile: 1.85 };
      prisma.fleetOperationsSettings.create.mockResolvedValue(created);

      const result = await service.getSettings(1);

      expect(prisma.fleetOperationsSettings.create).toHaveBeenCalledWith({
        data: { tenantId: 1 },
      });
      expect(result).toEqual(created);
    });
  });

  describe('updateSettings', () => {
    it('should upsert settings and invalidate cache', async () => {
      const updated = { tenantId: 1, costPerMile: 2.5 };
      prisma.fleetOperationsSettings.upsert.mockResolvedValue(updated);

      const result = await service.updateSettings(1, {
        costPerMile: 2.5,
      } as any);

      expect(result).toEqual(updated);
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('resetToDefaults', () => {
    it('should delete and recreate settings', async () => {
      prisma.fleetOperationsSettings.delete.mockResolvedValue({});
      const defaults = { tenantId: 1 };
      prisma.fleetOperationsSettings.create.mockResolvedValue(defaults);

      await service.resetToDefaults(1);

      expect(prisma.fleetOperationsSettings.delete).toHaveBeenCalledWith({
        where: { tenantId: 1 },
      });
      expect(prisma.fleetOperationsSettings.create).toHaveBeenCalledWith({
        data: { tenantId: 1 },
      });
      expect(cache.del).toHaveBeenCalled();
    });

    it('should handle delete failure gracefully', async () => {
      prisma.fleetOperationsSettings.delete.mockRejectedValue(new Error('not found'));
      prisma.fleetOperationsSettings.create.mockResolvedValue({ tenantId: 1 });

      const result = await service.resetToDefaults(1);

      expect(result).toBeDefined();
    });
  });

  describe('getDefaults', () => {
    it('should return default values', () => {
      const defaults = service.getDefaults();

      expect(defaults.costPerMile).toBe(1.85);
      expect(defaults.laborCostPerHour).toBe(25.0);
      expect(defaults.shieldAiEnabled).toBe(true);
      expect(defaults.podGracePeriodHours).toBe(48);
    });
  });
});
