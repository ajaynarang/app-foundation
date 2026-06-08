import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AlertGenerationService } from '../alert-generation.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { SALLY_EVENTS } from '../../../../../infrastructure/events/sally-events.constants';
import { AlertGroupingService } from '../alert-grouping.service';
import { AlertCacheService } from '../alert-cache.service';
import { ChannelResolutionService } from '../../../notifications/channel-resolution.service';
import { NotificationDeliveryService } from '../../../notifications/delivery.service';

describe('AlertGenerationService', () => {
  let service: AlertGenerationService;

  const mockPrisma = {
    alert: { create: jest.fn(), update: jest.fn() },
    user: {
      findMany: jest.fn().mockResolvedValue([{ id: 1, userId: 'user-1', email: 'dispatcher@test.com' }]),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    driver: {
      // Phase 2 Task 10 — service resolves driver slug → Int FK via
      // findUnique({ where: { driverId: <slug> } }); default to id=42 so
      // existing tests get a deterministic Int FK on the create payload.
      findUnique: jest.fn().mockResolvedValue({ id: 42 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    load: { findUnique: jest.fn().mockResolvedValue(null) },
    routePlan: { findUnique: jest.fn().mockResolvedValue(null) },
    vehicle: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const mockEventEmitter = {
    emit: jest.fn(),
  };
  const mockGrouping = {
    generateDedupKey: jest.fn().mockReturnValue('1:d1:HOS_VIOLATION'),
    generateGroupKey: jest.fn().mockReturnValue('1:d1:hos'),
    findDuplicate: jest.fn().mockResolvedValue(null),
    findCooldownActive: jest.fn().mockResolvedValue(null),
    findReactivatable: jest.fn().mockResolvedValue(null),
    findParentAlert: jest.fn().mockResolvedValue(null),
    getGroupingConfig: jest.fn().mockResolvedValue({
      dedupWindowMinutes: 15,
      groupSameTypePerDriver: true,
      smartGroupAcrossDrivers: true,
      linkCascading: true,
    }),
    linkToParent: jest.fn(),
  };
  const mockChannelResolution = {
    resolveChannels: jest.fn().mockResolvedValue({
      channels: [],
      playSound: false,
      flashTab: false,
    }),
  };
  const mockDelivery = {
    deliver: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AlertGroupingService, useValue: mockGrouping },
        { provide: ChannelResolutionService, useValue: mockChannelResolution },
        { provide: NotificationDeliveryService, useValue: mockDelivery },
        {
          provide: AlertCacheService,
          useValue: { invalidate: jest.fn(), bustStatsCache: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AlertGenerationService>(AlertGenerationService);
    jest.clearAllMocks();
  });

  describe('generateAlert', () => {
    it('should create a new alert and emit ALERT_FIRED with dispatcher recipientUserIds', async () => {
      const newAlert = {
        alertId: 'ALT-001',
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'HOS Violation Detected',
        message: 'Driver exceeded driving hours',
        createdAt: new Date(),
      };
      mockPrisma.alert.create.mockResolvedValue(newAlert);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, userId: 'user-1', email: 'dispatcher@test.com' }]);
      mockChannelResolution.resolveChannels.mockResolvedValue({
        channels: [],
        playSound: false,
        flashTab: false,
      });

      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'HOS Violation Detected',
        message: 'Driver exceeded driving hours',
      });

      expect(result).toEqual(newAlert);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ALERT_FIRED,
        expect.objectContaining({
          event: SALLY_EVENTS.ALERT_FIRED,
          tenantId: '1',
          data: expect.objectContaining({
            alertId: 'ALT-001',
            recipientUserIds: expect.arrayContaining(['user-1']),
          }),
        }),
      );
    });

    it('should emit ALERT_FIRED with loadNumber so the Tower wire can link the load', async () => {
      const newAlert = {
        alertId: 'ALT-LOAD',
        tenantId: 1,
        alertType: 'DETENTION_RISK',
        category: 'operations',
        priority: 'HIGH',
        title: 'Detention risk',
        message: 'Truck idle at dock',
        createdAt: new Date(),
      };
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue(null);
      mockPrisma.alert.create.mockResolvedValue(newAlert);
      mockPrisma.user.findMany.mockResolvedValue([{ id: 1, userId: 'user-1', email: 'dispatcher@test.com' }]);

      await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        loadId: 'LD-20260518-001',
        alertType: 'DETENTION_RISK',
        category: 'operations',
        priority: 'HIGH',
        title: 'Detention risk',
        message: 'Truck idle at dock',
      });

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ALERT_FIRED,
        expect.objectContaining({
          event: SALLY_EVENTS.ALERT_FIRED,
          data: expect.objectContaining({
            alertId: 'ALT-LOAD',
            driverId: 'driver-1',
            loadNumber: 'LD-20260518-001',
          }),
        }),
      );
    });

    it('should skip duplicate alerts within dedup window', async () => {
      mockGrouping.findDuplicate.mockResolvedValue({ alertId: 'ALT-EXISTING' });

      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'HOS Violation Detected',
        message: 'Duplicate',
      });

      expect(result).toBeNull();
      expect(mockPrisma.alert.create).not.toHaveBeenCalled();
    });

    it('should update occurrence count on duplicate', async () => {
      mockGrouping.findDuplicate.mockResolvedValue({
        alertId: 'ALT-EXISTING',
      });
      mockPrisma.alert.update.mockResolvedValue({});

      await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'HOS Violation',
        message: 'Updated message',
        metadata: { new: true },
      });

      expect(mockPrisma.alert.update).toHaveBeenCalledWith({
        where: { alertId: 'ALT-EXISTING' },
        data: expect.objectContaining({
          occurrenceCount: { increment: 1 },
          lastOccurredAt: expect.any(Date),
          message: 'Updated message',
          metadata: { new: true },
        }),
      });
    });

    it('should skip alert if cooldown is active', async () => {
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue({
        alertId: 'ALT-COOLED',
      });

      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'HIGH',
        title: 'HOS Violation',
        message: 'Cooldown test',
      });

      expect(result).toBeNull();
      expect(mockPrisma.alert.create).not.toHaveBeenCalled();
    });

    it('should reactivate previously auto-resolved alert', async () => {
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue({
        alertId: 'ALT-REACTIVATE',
        occurrenceCount: 2,
      });
      mockPrisma.alert.update.mockResolvedValue({
        alertId: 'ALT-REACTIVATE',
        occurrenceCount: 3,
        status: 'ACTIVE',
      });

      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'MEDIUM',
        title: 'HOS Violation',
        message: 'Reactivated',
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.alert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { alertId: 'ALT-REACTIVATE' },
          data: expect.objectContaining({
            status: 'ACTIVE',
            resolvedAt: null,
            resolvedBy: null,
          }),
        }),
      );
      expect(mockPrisma.alert.create).not.toHaveBeenCalled();
    });

    it('should link to parent alert when cascading is enabled', async () => {
      const newAlert = {
        alertId: 'ALT-CHILD',
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'CYCLE_APPROACHING_LIMIT',
        category: 'compliance',
        priority: 'MEDIUM',
        title: 'Cycle limit',
        message: 'Approaching',
        createdAt: new Date(),
      };
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue(null);
      mockPrisma.alert.create.mockResolvedValue(newAlert);
      // Phase 2 Task 2: linkToParent now takes the parent's Int alert.id, not the
      // public alertId slug. findParentAlert continues to return the full Alert row.
      mockGrouping.findParentAlert.mockResolvedValue({
        id: 99,
        alertId: 'ALT-PARENT',
      });

      await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'CYCLE_APPROACHING_LIMIT',
        category: 'compliance',
        priority: 'MEDIUM',
        title: 'Cycle limit',
        message: 'Approaching',
      });

      expect(mockGrouping.linkToParent).toHaveBeenCalledWith('ALT-CHILD', 99);
    });

    it('should handle SSE emission failure gracefully', async () => {
      const newAlert = {
        alertId: 'ALT-SSE',
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'Test',
        message: 'Test',
        createdAt: new Date(),
      };
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue(null);
      mockPrisma.alert.create.mockResolvedValue(newAlert);
      mockPrisma.user.findMany.mockRejectedValue(new Error('SSE fail'));

      // Should NOT throw
      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'Test',
        message: 'Test',
      });

      expect(result).toEqual(newAlert);
    });

    it('should default scope to load when not provided', async () => {
      const newAlert = {
        alertId: 'ALT-SCOPE',
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'HIGH',
        title: 'Test',
        message: 'Test',
        createdAt: new Date(),
      };
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue(null);
      mockPrisma.alert.create.mockResolvedValue(newAlert);

      await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'HIGH',
        title: 'Test',
        message: 'Test',
      });

      expect(mockPrisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          scope: 'LOAD',
        }),
      });
    });

    it('should include driver userId in recipientUserIds when driverId is provided', async () => {
      const newAlert = {
        alertId: 'ALT-DRIVER-SSE',
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'Test',
        message: 'Test',
        createdAt: new Date(),
      };
      mockGrouping.findDuplicate.mockResolvedValue(null);
      mockGrouping.findCooldownActive.mockResolvedValue(null);
      mockGrouping.findReactivatable.mockResolvedValue(null);
      mockPrisma.alert.create.mockResolvedValue(newAlert);
      mockPrisma.user.findMany.mockResolvedValue([]);

      // Mock driver lookup chain. Both findUnique (for the new Int FK
      // resolution on alert create, Phase 2 Task 10) and findFirst (for
      // the driver-user resolution on the SSE recipient list) need stubs.
      (mockPrisma as any).driver = {
        findUnique: jest.fn().mockResolvedValue({ id: 5 }),
        findFirst: jest.fn().mockResolvedValue({ id: 5 }),
      };
      (mockPrisma as any).user.findFirst = jest.fn().mockResolvedValue({ userId: 'driver-user-1' });

      const result = await service.generateAlert({
        tenantId: 1,
        driverId: 'driver-1',
        alertType: 'HOS_VIOLATION',
        category: 'compliance',
        priority: 'CRITICAL',
        title: 'Test',
        message: 'Test',
      });

      expect(result).toEqual(newAlert);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ALERT_FIRED,
        expect.objectContaining({
          event: SALLY_EVENTS.ALERT_FIRED,
          data: expect.objectContaining({
            alertId: 'ALT-DRIVER-SSE',
            flashTab: true,
            recipientUserIds: ['driver-user-1'],
          }),
        }),
      );
    });
  });
});
