import { Test, TestingModule } from '@nestjs/testing';
import { AlertConfigService } from '../alert-config.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

describe('AlertConfigService', () => {
  let service: AlertConfigService;
  let prisma: any;
  let cache: any;

  beforeEach(async () => {
    prisma = {
      alertConfiguration: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertConfigService,
        { provide: PrismaService, useValue: prisma },
        { provide: AppCacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<AlertConfigService>(AlertConfigService);
  });

  describe('getDefaults', () => {
    it('should return complete default alert configuration', () => {
      const defaults = service.getDefaults();

      expect(defaults.alertTypes).toBeDefined();
      expect(defaults.alertTypes.HOS_DRIVE_WARNING).toEqual({
        enabled: true,
        mandatory: true,
        thresholdPercent: 75,
      });
      expect(defaults.escalationPolicy).toBeDefined();
      expect(defaults.groupingConfig).toBeDefined();
      expect(defaults.defaultChannels).toBeDefined();
    });
  });

  describe('getConfig', () => {
    it('should return defaults when no configuration exists', async () => {
      prisma.alertConfiguration.findUnique.mockResolvedValue(null);

      const result = await service.getConfig(1);

      expect(result.alertTypes).toBeDefined();
      expect(result.escalationPolicy).toBeDefined();
    });

    it('should return stored config when it exists', async () => {
      const storedConfig = {
        alertTypes: { HOS_DRIVE_WARNING: { enabled: false } },
        escalationPolicy: { critical: { acknowledgeSlaMinutes: 10 } },
        groupingConfig: { dedupWindowMinutes: 30 },
        defaultChannels: { critical: { inApp: true } },
      };
      prisma.alertConfiguration.findUnique.mockResolvedValue(storedConfig);

      const result = await service.getConfig(1);

      expect(result).toEqual(storedConfig);
    });
  });

  describe('updateConfig', () => {
    it('should upsert config and invalidate cache', async () => {
      const dto = {
        alertTypes: { HOS_DRIVE_WARNING: { enabled: false } },
      };
      const upserted = { ...dto, id: 1 };
      prisma.alertConfiguration.upsert.mockResolvedValue(upserted);

      const result = await service.updateConfig(1, dto as any);

      expect(result).toEqual(upserted);
      expect(cache.del).toHaveBeenCalled();
    });

    it('should use defaults for missing fields on create', async () => {
      prisma.alertConfiguration.upsert.mockResolvedValue({ id: 1 });

      await service.updateConfig(1, {} as any);

      const upsertCall = prisma.alertConfiguration.upsert.mock.calls[0][0];
      expect(upsertCall.create.alertTypes).toBeDefined();
      expect(upsertCall.create.escalationPolicy).toBeDefined();
    });
  });
});
