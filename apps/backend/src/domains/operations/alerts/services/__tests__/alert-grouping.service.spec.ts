import { Test, TestingModule } from '@nestjs/testing';
import { AlertGroupingService } from '../alert-grouping.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('AlertGroupingService', () => {
  let service: AlertGroupingService;

  const mockPrisma = {
    alert: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    alertConfiguration: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertGroupingService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<AlertGroupingService>(AlertGroupingService);
    jest.clearAllMocks();
  });

  describe('generateDedupKey', () => {
    it('should generate dedup key from tenant, driver, and alert type', () => {
      const key = service.generateDedupKey(1, 'driver-1', 'HOS_VIOLATION');
      expect(key).toBe('1:driver-1:HOS_VIOLATION');
    });
  });

  describe('generateGroupKey', () => {
    it('should generate group key from tenant, driver, and category', () => {
      const key = service.generateGroupKey(1, 'driver-1', 'compliance');
      expect(key).toBe('1:driver-1:compliance');
    });
  });

  describe('findDuplicate', () => {
    it('should find existing active alert with same dedup key', async () => {
      const existingAlert = {
        alertId: 'ALT-001',
        status: 'ACTIVE',
        dedupKey: '1:d1:HOS_VIOLATION',
      };
      mockPrisma.alert.findFirst.mockResolvedValue(existingAlert);

      const result = await service.findDuplicate('1:d1:HOS_VIOLATION');

      expect(result).toEqual(existingAlert);
      expect(mockPrisma.alert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            dedupKey: '1:d1:HOS_VIOLATION',
            status: { in: ['ACTIVE', 'ACKNOWLEDGED', 'SNOOZED'] },
          }),
        }),
      );
    });

    it('should return null when no duplicate exists', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      const result = await service.findDuplicate('1:d1:NEW_TYPE');

      expect(result).toBeNull();
    });
  });

  describe('findParentAlert', () => {
    it('should find parent alert for cascading linking', async () => {
      const parentAlert = {
        alertId: 'ALT-001',
        alertType: 'HOS_APPROACHING_LIMIT',
      };
      mockPrisma.alert.findFirst.mockResolvedValue(parentAlert);

      // Phase 2 Task 10 — driverDbId is the Int FK (alerts.driver_id), not the slug.
      const result = await service.findParentAlert(1, 42, 'HOS_VIOLATION');

      expect(result).toEqual(parentAlert);
      expect(mockPrisma.alert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: 42 }),
        }),
      );
    });

    it('should return null for non-cascading alert types', async () => {
      const result = await service.findParentAlert(1, 42, 'SPEED_VIOLATION');
      expect(result).toBeNull();
      expect(mockPrisma.alert.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('generateDedupKey with loadId', () => {
    it('should append loadId to dedup key when provided', () => {
      const key = service.generateDedupKey(1, 'driver-1', 'OFF_PACE', 'LD-001');
      expect(key).toBe('1:driver-1:OFF_PACE:LD-001');
    });
  });

  describe('findDuplicate with dedup window', () => {
    it('should include recently resolved alerts when dedupWindowMinutes is set', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      await service.findDuplicate('key', 15);

      expect(mockPrisma.alert.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                status: { in: ['ACTIVE', 'ACKNOWLEDGED', 'SNOOZED'] },
              }),
              expect.objectContaining({
                status: 'RESOLVED',
              }),
            ]),
          }),
        }),
      );
    });
  });

  describe('findReactivatable', () => {
    it('should find recently auto-resolved alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        alertId: 'ALT-002',
        occurrenceCount: 3,
        priority: 'high',
      });

      const result = await service.findReactivatable('dedup-key');
      expect(result).toEqual({
        alertId: 'ALT-002',
        occurrenceCount: 3,
        priority: 'high',
      });
    });

    it('should return null when no reactivatable alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);
      const result = await service.findReactivatable('dedup-key');
      expect(result).toBeNull();
    });
  });

  describe('findCooldownActive', () => {
    it('should return true when manually resolved alert has active cooldown', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-003' });
      expect(await service.findCooldownActive('key')).toBe(true);
    });

    it('should return false when no cooldown', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);
      expect(await service.findCooldownActive('key')).toBe(false);
    });
  });

  describe('getGroupingConfig', () => {
    it('should return stored config', async () => {
      mockPrisma.alertConfiguration.findUnique.mockResolvedValue({
        groupingConfig: {
          dedupWindowMinutes: 30,
          groupSameTypePerDriver: true,
          smartGroupAcrossDrivers: false,
          linkCascading: true,
        },
      });

      const config = await service.getGroupingConfig(1);
      expect(config.dedupWindowMinutes).toBe(30);
    });

    it('should return defaults when no config exists', async () => {
      mockPrisma.alertConfiguration.findUnique.mockResolvedValue(null);

      const config = await service.getGroupingConfig(1);
      expect(config).toEqual({
        dedupWindowMinutes: 15,
        groupSameTypePerDriver: true,
        smartGroupAcrossDrivers: true,
        linkCascading: true,
      });
    });
  });

  describe('linkToParent', () => {
    it('should update alert with parentAlertId resolved to the parent Alert.id Int', async () => {
      mockPrisma.alert.update.mockResolvedValue({});
      // After Phase 2 Task 2 the FK is Alert.id (Int), not Alert.alertId (String).
      // Callers (alert-generation.service) pass the parent's Int id.
      await service.linkToParent('ALT-CHILD', 42);
      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { alertId: 'ALT-CHILD' },
        data: { parentAlertId: 42 },
      });
    });
  });
});
