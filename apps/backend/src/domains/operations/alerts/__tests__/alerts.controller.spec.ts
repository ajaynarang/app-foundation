// Mock the briefing service module to avoid transitive @mastra/core ESM import
jest.mock('../services/alert-briefing.service', () => ({
  AlertBriefingService: jest.fn().mockImplementation(() => ({
    getCached: jest.fn(),
    generate: jest.fn(),
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { AlertsController } from '../alerts.controller';
import { AlertStatsService } from '../services/alert-stats.service';
import { AlertAnalyticsService } from '../services/alert-analytics.service';
import { AlertTriggersService } from '../services/alert-triggers.service';
import { AlertCacheService } from '../services/alert-cache.service';
import { AlertBriefingService } from '../services/alert-briefing.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AlertsController', () => {
  let controller: AlertsController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    tenantDbId: 1,
    role: 'DISPATCHER',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@test.com',
  };

  const mockAlert = {
    alertId: 'ALT-1',
    driverId: 'DRV-1',
    loadId: 'LD-1',
    scope: 'LOAD',
    routePlanId: null,
    vehicleId: null,
    alertType: 'late_delivery',
    category: 'delivery',
    priority: 'HIGH',
    title: 'Late Delivery',
    message: 'Load is running late',
    recommendedAction: 'Contact driver',
    metadata: {},
    status: 'active',
    acknowledgedAt: null,
    acknowledgedBy: null,
    snoozedUntil: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    autoResolved: false,
    escalationLevel: 0,
    parentAlertId: null,
    occurrenceCount: 1,
    lastOccurredAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    alert: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    // Phase 2 Task 10 — listAlerts resolves slug→Int FK via findUnique for
    // driver and load before the where clause; mock both.
    load: { findMany: jest.fn(), findUnique: jest.fn() },
    driver: { findMany: jest.fn(), findUnique: jest.fn() },
    alertNote: { create: jest.fn() },
    fleetOperationsSettings: { findUnique: jest.fn() },
  };

  const mockAlertStatsService = {
    getStats: jest.fn(),
    getSmartStats: jest.fn(),
  };

  const mockAnalyticsService = {
    getVolumeByCategory: jest.fn(),
    getVolumeByPriority: jest.fn(),
    getResponseTimeTrend: jest.fn(),
    getResolutionRates: jest.fn(),
    getTopAlertTypes: jest.fn(),
    getAlertHistory: jest.fn(),
  };

  const mockTriggersService = {};

  const mockAlertCacheService = {
    bustStatsCache: jest.fn(),
  };

  const mockBriefingService = {
    getCached: jest.fn(),
    generate: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AlertsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlertStatsService, useValue: mockAlertStatsService },
        { provide: AlertAnalyticsService, useValue: mockAnalyticsService },
        { provide: AlertTriggersService, useValue: mockTriggersService },
        { provide: AlertCacheService, useValue: mockAlertCacheService },
        { provide: AlertBriefingService, useValue: mockBriefingService },
      ],
    }).compile();

    controller = module.get<AlertsController>(AlertsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET / (listAlerts)', () => {
    it('should list alerts with filters (normalizing case to the Prisma enum)', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([mockAlert]);

      // Clients may send any case (?status=active&priority=high); the
      // controller normalizes to the uppercase Prisma enum members.
      const result = await controller.listAlerts(mockUser, 'active', 'high');

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: 1,
            status: 'ACTIVE',
            priority: 'HIGH',
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].alertId).toBe('ALT-1');
    });

    it('drops an unrecognized status filter rather than passing it to Prisma', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listAlerts(mockUser, 'bogus-status');

      const call = mockPrisma.alert.findMany.mock.calls[0][0];
      expect(call.where).not.toHaveProperty('status');
    });

    it('should filter load-scoped alerts to active loads', async () => {
      mockPrisma.load.findMany.mockResolvedValue([{ loadNumber: 'LD-1' }]);
      mockPrisma.alert.findMany.mockResolvedValue([mockAlert]);

      await controller.listAlerts(mockUser, undefined, undefined, undefined, undefined, undefined, 'load');

      expect(mockPrisma.load.findMany).toHaveBeenCalled();
    });

    it('should return empty for load scope with no active loads', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);

      const result = await controller.listAlerts(
        mockUser,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        'load',
      );

      expect(result).toEqual([]);
    });
  });

  describe('GET /:alert_id (getAlert)', () => {
    it('should return alert with notes and child alerts', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({
        ...mockAlert,
        notes: [
          {
            noteId: 'N-1',
            authorName: 'John',
            content: 'Note content',
            createdAt: new Date(),
          },
        ],
        childAlerts: [],
      });

      const result = await controller.getAlert('ALT-1', mockUser);
      expect(result.alertId).toBe('ALT-1');
      expect(result.notes).toHaveLength(1);
    });

    it('should throw 404 if not found', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      await expect(controller.getAlert('ALT-NOT', mockUser)).rejects.toThrow(HttpException);
    });
  });

  describe('POST /:alert_id/acknowledge', () => {
    it('should acknowledge alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.alert.update.mockResolvedValue({
        alertId: 'ALT-1',
        status: 'acknowledged',
        acknowledgedAt: new Date(),
        acknowledgedBy: 'user-1',
      });

      const result = await controller.acknowledgeAlert('ALT-1', mockUser);
      expect(result.status).toBe('acknowledged');
      expect(mockAlertCacheService.bustStatsCache).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /:alert_id/resolve', () => {
    it('should resolve alert with cooldown', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        alertResolveCooldownHours: 6,
      });
      mockPrisma.alert.update.mockResolvedValue({
        alertId: 'ALT-1',
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: 'Fixed',
      });

      const result = await controller.resolveAlert('ALT-1', { resolutionNotes: 'Fixed' } as any, mockUser);
      expect(result.status).toBe('resolved');
      expect(mockAlertCacheService.bustStatsCache).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /:alert_id/snooze', () => {
    it('should snooze alert', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.alert.update.mockResolvedValue({
        alertId: 'ALT-1',
        status: 'snoozed',
      });

      const result = await controller.snoozeAlert('ALT-1', { durationMinutes: 30 } as any, mockUser);
      expect(result.status).toBe('snoozed');
      expect(result.snoozedUntil).toBeDefined();
    });
  });

  describe('POST /:alert_id/notes', () => {
    it('should add note to alert keyed by Alert.id Int (Phase 2 Task 3 FK shape)', async () => {
      // Single tenant-scoped lookup doubles as the ownership check and the
      // slug → Int resolution; existence implies tenant ownership.
      mockPrisma.alert.findFirst.mockResolvedValueOnce({ id: 7 });
      mockPrisma.alertNote.create.mockResolvedValue({
        noteId: 'N-1',
        alertId: 7,
        authorName: 'John Doe',
        content: 'Investigation started',
        createdAt: new Date(),
      });

      const result = await controller.addNote('ALT-1', { content: 'Investigation started' } as any, mockUser);

      expect(mockPrisma.alertNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alertId: 7,
          content: 'Investigation started',
        }),
      });
      expect(result.noteId).toBe('N-1');
      expect(result.alertId).toBe('ALT-1');
      expect(result.content).toBe('Investigation started');
    });
  });

  describe('POST /bulk/acknowledge', () => {
    it('should bulk acknowledge alerts', async () => {
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 3 });

      const result = await controller.bulkAcknowledge({ alertIds: ['ALT-1', 'ALT-2', 'ALT-3'] } as any, mockUser);

      expect(result.updated).toBe(3);
      expect(mockAlertCacheService.bustStatsCache).toHaveBeenCalledWith(1);
    });
  });

  describe('POST /bulk/resolve', () => {
    it('should bulk resolve alerts', async () => {
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue({
        alertResolveCooldownHours: 4,
      });
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 2 });

      const result = await controller.bulkResolve(
        {
          alertIds: ['ALT-1', 'ALT-2'],
          resolutionNotes: 'Batch resolved',
        } as any,
        mockUser,
      );

      expect(result.updated).toBe(2);
    });
  });

  describe('GET /stats', () => {
    it('should return alert stats', async () => {
      mockAlertStatsService.getStats.mockResolvedValue({
        active: 5,
        total: 20,
      });

      await controller.getAlertStats(mockUser);
      expect(mockAlertStatsService.getStats).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /stats/smart', () => {
    it('should return smart stats', async () => {
      mockAlertStatsService.getSmartStats.mockResolvedValue({
        driversWithIssues: 3,
      });

      await controller.getSmartAlertStats(mockUser);
      expect(mockAlertStatsService.getSmartStats).toHaveBeenCalledWith(1);
    });
  });

  describe('GET /analytics/volume', () => {
    it('should return volume analytics', async () => {
      mockAnalyticsService.getVolumeByCategory.mockResolvedValue([]);
      mockAnalyticsService.getVolumeByPriority.mockResolvedValue([]);

      const result = await controller.getVolumeAnalytics(mockUser, '14');
      expect(mockAnalyticsService.getVolumeByCategory).toHaveBeenCalledWith(1, 14);
      expect(result).toHaveProperty('byCategory');
      expect(result).toHaveProperty('byPriority');
    });
  });

  describe('GET /history', () => {
    it('should return alert history', async () => {
      mockAnalyticsService.getAlertHistory.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.getAlertHistory(mockUser, '1', '20');
      expect(mockAnalyticsService.getAlertHistory).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ page: 1, limit: 20 }),
      );
    });
  });

  describe('Briefing endpoints', () => {
    it('GET /briefing/cached should return cached briefing', async () => {
      mockBriefingService.getCached.mockResolvedValue({ summary: 'All good' });

      await controller.getCachedBriefing(mockUser);
      expect(mockBriefingService.getCached).toHaveBeenCalledWith(1);
    });

    it('POST /briefing should generate briefing', async () => {
      mockBriefingService.generate.mockResolvedValue({ summary: 'Generated' });

      await controller.generateBriefing(mockUser, 'true');
      expect(mockBriefingService.generate).toHaveBeenCalledWith(1, true);
    });

    it('POST /briefing should pass false when force is not "true"', async () => {
      mockBriefingService.generate.mockResolvedValue({ summary: 'Cached' });

      await controller.generateBriefing(mockUser, 'false');
      expect(mockBriefingService.generate).toHaveBeenCalledWith(1, false);
    });

    it('POST /briefing should pass false when force is undefined', async () => {
      mockBriefingService.generate.mockResolvedValue({ summary: 'Cached' });

      await controller.generateBriefing(mockUser);
      expect(mockBriefingService.generate).toHaveBeenCalledWith(1, false);
    });
  });

  describe('GET /analytics/response-time', () => {
    it('should return response time trend with default days', async () => {
      mockAnalyticsService.getResponseTimeTrend.mockResolvedValue([]);

      await controller.getResponseTimeTrend(mockUser);
      expect(mockAnalyticsService.getResponseTimeTrend).toHaveBeenCalledWith(1, 7);
    });

    it('should parse days parameter', async () => {
      mockAnalyticsService.getResponseTimeTrend.mockResolvedValue([]);

      await controller.getResponseTimeTrend(mockUser, '30');
      expect(mockAnalyticsService.getResponseTimeTrend).toHaveBeenCalledWith(1, 30);
    });
  });

  describe('GET /analytics/resolution', () => {
    it('should return resolution rates with default days', async () => {
      mockAnalyticsService.getResolutionRates.mockResolvedValue({
        total: 10,
        resolved: 8,
      });

      await controller.getResolutionRates(mockUser);
      expect(mockAnalyticsService.getResolutionRates).toHaveBeenCalledWith(1, 7);
    });

    it('should parse days parameter', async () => {
      mockAnalyticsService.getResolutionRates.mockResolvedValue({});

      await controller.getResolutionRates(mockUser, '14');
      expect(mockAnalyticsService.getResolutionRates).toHaveBeenCalledWith(1, 14);
    });
  });

  describe('GET /analytics/top-types', () => {
    it('should return top alert types with default days', async () => {
      mockAnalyticsService.getTopAlertTypes.mockResolvedValue([]);

      await controller.getTopAlertTypes(mockUser);
      expect(mockAnalyticsService.getTopAlertTypes).toHaveBeenCalledWith(1, 7);
    });

    it('should parse days parameter', async () => {
      mockAnalyticsService.getTopAlertTypes.mockResolvedValue([]);

      await controller.getTopAlertTypes(mockUser, '30');
      expect(mockAnalyticsService.getTopAlertTypes).toHaveBeenCalledWith(1, 30);
    });
  });

  describe('GET /volume with default days', () => {
    it('should default to 7 days when no days param', async () => {
      mockAnalyticsService.getVolumeByCategory.mockResolvedValue([]);
      mockAnalyticsService.getVolumeByPriority.mockResolvedValue([]);

      await controller.getVolumeAnalytics(mockUser);
      expect(mockAnalyticsService.getVolumeByCategory).toHaveBeenCalledWith(1, 7);
      expect(mockAnalyticsService.getVolumeByPriority).toHaveBeenCalledWith(1, 7);
    });
  });

  describe('GET /grouped', () => {
    it('should group alerts by driver scope', async () => {
      // Phase 2 Task 10 — alert.driverId is the Int FK and the
      // human-readable slug arrives via the included driver relation.
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          ...mockAlert,
          driverId: 7,
          alertType: 'HOS_VIOLATION',
          occurrenceCount: 2,
          driver: { driverId: 'DRV-1', name: 'John Doe' },
          load: null,
          routePlan: null,
          vehicle: null,
        },
      ]);

      const result = await controller.listGroupedAlerts(mockUser, 'driver');

      expect(result).toHaveLength(1);
      expect(result[0].scope).toBe('driver');
      expect(result[0].entityId).toBe('DRV-1');
      expect(result[0].driverName).toBe('John Doe');
    });

    it('should group alerts by load scope', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          ...mockAlert,
          loadId: 11,
          alertType: 'APPOINTMENT_AT_RISK',
          occurrenceCount: 1,
          driver: null,
          load: { loadNumber: 'LN-001', referenceNumber: 'REF-001' },
          routePlan: null,
          vehicle: null,
        },
      ]);

      const result = await controller.listGroupedAlerts(mockUser, 'load');

      expect(result).toHaveLength(1);
      expect(result[0].scope).toBe('load');
      expect(result[0].loadNumber).toBe('LN-001');
    });

    it('should return empty array when no alerts exist', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);

      const result = await controller.listGroupedAlerts(mockUser, 'driver');

      expect(result).toHaveLength(0);
    });

    it('should sort by priority then alert count', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          ...mockAlert,
          driverId: 7,
          alertType: 'HOS_VIOLATION',
          priority: 'low',
          occurrenceCount: 1,
          driver: { driverId: 'DRV-1', name: 'A' },
          load: null,
          routePlan: null,
          vehicle: null,
        },
        {
          ...mockAlert,
          driverId: 8,
          alertType: 'HOS_VIOLATION',
          priority: 'critical',
          occurrenceCount: 3,
          driver: { driverId: 'DRV-2', name: 'B' },
          load: null,
          routePlan: null,
          vehicle: null,
        },
      ]);

      const result = await controller.listGroupedAlerts(mockUser, 'driver');

      expect(result[0].priority).toBe('critical');
      expect(result[1].priority).toBe('low');
    });

    it('should filter by priority when provided', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listGroupedAlerts(mockUser, 'driver', 'critical');

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ priority: 'critical' }),
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.alert.findMany.mockRejectedValue(new Error('DB error'));

      await expect(controller.listGroupedAlerts(mockUser, 'driver')).rejects.toThrow(HttpException);
    });
  });

  describe('GET /history with filters', () => {
    it('should pass all filter parameters', async () => {
      mockAnalyticsService.getAlertHistory.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.getAlertHistory(
        mockUser,
        '2',
        '10',
        '2026-01-01',
        '2026-03-31',
        'compliance',
        'high',
        'active',
        'DRV-1',
      );

      expect(mockAnalyticsService.getAlertHistory).toHaveBeenCalledWith(1, {
        page: 2,
        limit: 10,
        startDate: '2026-01-01',
        endDate: '2026-03-31',
        category: 'compliance',
        priority: 'high',
        status: 'active',
        driverId: 'DRV-1',
      });
    });

    it('should use defaults when no params provided', async () => {
      mockAnalyticsService.getAlertHistory.mockResolvedValue({
        items: [],
        total: 0,
      });

      await controller.getAlertHistory(mockUser);

      expect(mockAnalyticsService.getAlertHistory).toHaveBeenCalledWith(1, {
        page: undefined,
        limit: undefined,
        startDate: undefined,
        endDate: undefined,
        category: undefined,
        priority: undefined,
        status: undefined,
        driverId: undefined,
      });
    });
  });

  describe('error handling', () => {
    it('listAlerts should throw 500 on unexpected error', async () => {
      mockPrisma.alert.findMany.mockRejectedValue(new Error('DB down'));

      await expect(controller.listAlerts(mockUser)).rejects.toThrow(HttpException);
    });

    it('getAlert should re-throw HttpException on not found', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      try {
        await controller.getAlert('ALT-MISS', mockUser);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });

    it('getAlert should throw 500 on unexpected error', async () => {
      mockPrisma.alert.findFirst.mockRejectedValue(new Error('Unexpected'));

      try {
        await controller.getAlert('ALT-1', mockUser);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });

    it('acknowledgeAlert should throw 404 when alert not found', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      await expect(controller.acknowledgeAlert('ALT-MISS', mockUser)).rejects.toThrow(HttpException);
    });

    it('acknowledgeAlert should throw 500 on unexpected error', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.alert.update.mockRejectedValue(new Error('DB error'));

      try {
        await controller.acknowledgeAlert('ALT-1', mockUser);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });

    it('resolveAlert should throw 404 when alert not found', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue(null);

      await expect(controller.resolveAlert('ALT-MISS', { resolutionNotes: 'ok' } as any, mockUser)).rejects.toThrow(
        HttpException,
      );
    });

    it('resolveAlert should throw 500 on unexpected error', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.fleetOperationsSettings.findUnique.mockRejectedValue(new Error('DB error'));

      try {
        await controller.resolveAlert('ALT-1', { resolutionNotes: 'ok' } as any, mockUser);
        fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(HttpException);
        expect(e.getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      }
    });

    it('resolveAlert should use default cooldown when settings missing', async () => {
      mockPrisma.alert.findFirst.mockResolvedValue({ alertId: 'ALT-1' });
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      mockPrisma.alert.update.mockResolvedValue({
        alertId: 'ALT-1',
        status: 'resolved',
        resolvedAt: new Date(),
        resolutionNotes: 'Fixed',
      });

      const result = await controller.resolveAlert('ALT-1', { resolutionNotes: 'Fixed' } as any, mockUser);

      expect(result.status).toBe('resolved');
      // Should still have called update with manualResolveCooldownUntil
      expect(mockPrisma.alert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            manualResolveCooldownUntil: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('listAlerts with all filters', () => {
    it('should pass driverId filter', async () => {
      // Phase 2 Task 10 — controller resolves the public slug → Int FK
      // before the where clause and queries on the FK.
      mockPrisma.driver.findUnique.mockResolvedValue({ id: 77 });
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listAlerts(mockUser, undefined, undefined, 'DRV-1');

      expect(mockPrisma.driver.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { driverId: 'DRV-1' } }),
      );
      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ driverId: 77 }),
        }),
      );
    });

    it('should pass loadId filter', async () => {
      mockPrisma.load.findUnique.mockResolvedValue({ id: 88 });
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listAlerts(mockUser, undefined, undefined, undefined, 'LD-1');

      expect(mockPrisma.load.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { loadNumber_tenantId: { loadNumber: 'LD-1', tenantId: mockUser.tenantDbId } },
        }),
      );
      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ loadId: 88 }),
        }),
      );
    });

    it('should pass category filter', async () => {
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listAlerts(mockUser, undefined, undefined, undefined, undefined, 'compliance');

      expect(mockPrisma.alert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ category: 'compliance' }),
        }),
      );
    });

    it('should pass scope filter', async () => {
      mockPrisma.load.findMany.mockResolvedValue([{ loadNumber: 'LD-1' }]);
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await controller.listAlerts(mockUser, undefined, undefined, undefined, undefined, undefined, 'load');

      expect(mockPrisma.load.findMany).toHaveBeenCalled();
    });
  });

  describe('POST /bulk/resolve with default cooldown', () => {
    it('should use default cooldown of 4 hours when no settings', async () => {
      mockPrisma.fleetOperationsSettings.findUnique.mockResolvedValue(null);
      mockPrisma.alert.updateMany.mockResolvedValue({ count: 1 });

      const result = await controller.bulkResolve({ alertIds: ['ALT-1'], resolutionNotes: 'Done' } as any, mockUser);

      expect(result.updated).toBe(1);
      expect(mockPrisma.alert.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            manualResolveCooldownUntil: expect.any(Date),
          }),
        }),
      );
    });
  });
});
