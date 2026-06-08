import { Test, TestingModule } from '@nestjs/testing';
import { SyncService } from '../sync.service';
import { TmsSyncService } from '../tms-sync.service';
import { EldSyncService } from '../eld-sync.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { NotificationTriggersService } from '../../../operations/notifications/notification-triggers.service';

describe('SyncService', () => {
  let service: SyncService;
  let tmsSyncService: TmsSyncService;
  let eldSyncService: EldSyncService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: TmsSyncService,
          useValue: {
            syncVehicles: jest.fn(),
            syncDrivers: jest.fn(),
            syncLoads: jest.fn(),
          },
        },
        {
          provide: EldSyncService,
          useValue: {
            syncVehicles: jest.fn(),
            syncDrivers: jest.fn(),
            syncTrailers: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            integrationConfig: {
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: NotificationTriggersService,
          useValue: {
            integrationSyncCompleted: jest.fn().mockResolvedValue(undefined),
            integrationSyncFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
    tmsSyncService = module.get<TmsSyncService>(TmsSyncService);
    eldSyncService = module.get<EldSyncService>(EldSyncService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('syncIntegration', () => {
    it('should sync TMS integration (vehicles, drivers, loads)', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue({
        id: 1,
        vendor: 'PROJECT44_TMS',
        integrationType: 'TMS',
      } as any);

      await service.syncIntegration(1);

      expect(tmsSyncService.syncVehicles).toHaveBeenCalledWith(1);
      expect(tmsSyncService.syncDrivers).toHaveBeenCalledWith(1);
      expect(tmsSyncService.syncLoads).toHaveBeenCalledWith(1);
    });

    it('should sync ELD integration (vehicles, drivers)', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue({
        id: 2,
        vendor: 'SAMSARA_ELD',
        integrationType: 'ELD',
      } as any);

      await service.syncIntegration(2);

      expect(eldSyncService.syncVehicles).toHaveBeenCalledWith(2);
      expect(eldSyncService.syncDrivers).toHaveBeenCalledWith(2);
    });

    it('should throw error for unsupported vendor', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue({
        id: 3,
        vendor: 'UNKNOWN_VENDOR',
      } as any);

      await expect(service.syncIntegration(3)).rejects.toThrow('This vendor integration is not supported');
    });

    it('should throw error if integration not found', async () => {
      jest.spyOn(prisma.integrationConfig, 'findUnique').mockResolvedValue(null);

      await expect(service.syncIntegration(99)).rejects.toThrow('Integration not found');
    });
  });
});
