import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { MonitoringController } from '../monitoring.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { IntegrationDataService } from '../../../integrations/services/integration-data.service';
import { RouteEventService } from '../services/route-event.service';
import { DriverEventService } from '../services/driver-event.service';
import { MonitoringEngineService } from '../services/monitoring-engine.service';

describe('MonitoringController', () => {
  let controller: MonitoringController;
  let prisma: any;
  let integrationManager: any;
  let driverEventService: any;

  const mockPlan = {
    planId: 'plan-1',
    estimatedArrival: new Date(Date.now() + 3600000).toISOString(),
    status: 'ACTIVE',
    segments: [
      {
        segmentId: 'seg-1',
        sequenceOrder: 1,
        segmentType: 'drive',
        status: 'COMPLETED',
      },
      {
        segmentId: 'seg-2',
        sequenceOrder: 2,
        segmentType: 'drive',
        status: 'IN_PROGRESS',
        estimatedArrival: new Date(Date.now() + 3600000).toISOString(),
      },
    ],
    driver: { driverId: 'drv-1', name: 'John' },
    vehicle: { vehicleId: 'veh-1' },
    events: [{ id: 1 }],
    loads: [],
  };

  beforeEach(async () => {
    prisma = {
      routePlan: { findFirst: jest.fn() },
      alert: { count: jest.fn().mockResolvedValue(2) },
      routeEvent: { findMany: jest.fn().mockResolvedValue([]) },
    };
    integrationManager = {
      getDriverHOS: jest.fn().mockResolvedValue(null),
      getVehicleLocation: jest.fn().mockResolvedValue(null),
    };
    driverEventService = {
      handleStartRoute: jest.fn().mockResolvedValue({ ok: true }),
      handlePickupComplete: jest.fn().mockResolvedValue({ ok: true }),
      handleDeliveryComplete: jest.fn().mockResolvedValue({ ok: true }),
      handleDispatcherOverride: jest.fn().mockResolvedValue({ ok: true }),
    };

    const module = await Test.createTestingModule({
      controllers: [MonitoringController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: IntegrationDataService, useValue: integrationManager },
        { provide: RouteEventService, useValue: {} },
        { provide: DriverEventService, useValue: driverEventService },
        { provide: MonitoringEngineService, useValue: {} },
      ],
    }).compile();

    controller = module.get(MonitoringController);
  });

  describe('getMonitoringStatus', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(null);
      await expect(controller.getMonitoringStatus('plan-x', 1)).rejects.toThrow(NotFoundException);
    });

    it('should return monitoring status with no GPS/HOS data', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      const result = await controller.getMonitoringStatus('plan-1', 1);
      expect(result.planId).toBe('plan-1');
      expect(result.completedSegments).toBe(1);
      expect(result.totalSegments).toBe(2);
      expect(result.activeAlerts).toBe(2);
      expect(result.driverPosition).toBeNull();
      expect(result.hosState).toBeNull();
    });

    it('should include HOS state when available', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      integrationManager.getDriverHOS.mockResolvedValue({
        currentDutyStatus: 'driving',
        driveTimeRemainingMs: 36000000,
        shiftTimeRemainingMs: 50400000,
        cycleTimeRemainingMs: 252000000,
        timeUntilBreakMs: 14400000,
      });
      const result = await controller.getMonitoringStatus('plan-1', 1);
      expect(result.hosState).toBeTruthy();
      expect(result.hosState.currentDutyStatus).toBe('driving');
      expect(result.hosState.driveTimeRemainingMinutes).toBe(600);
    });

    it('should include driver position when GPS available', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      integrationManager.getVehicleLocation.mockResolvedValue({
        latitude: 40.7,
        longitude: -74.0,
        speed: 65,
        heading: 180,
        timestamp: '2026-01-01T00:00:00Z',
      });
      const result = await controller.getMonitoringStatus('plan-1', 1);
      expect(result.driverPosition).toEqual({
        lat: 40.7,
        lon: -74.0,
        speed: 65,
        heading: 180,
        lastUpdated: '2026-01-01T00:00:00Z',
      });
    });

    it('should return on_time when no estimated arrival or current segment', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({
        ...mockPlan,
        estimatedArrival: null,
        segments: [],
      });
      const result = await controller.getMonitoringStatus('plan-1', 1);
      expect(result.etaDeviation).toEqual({ minutes: 0, status: 'on_time' });
    });
  });

  describe('getUpdates', () => {
    it('should throw NotFoundException when plan not found', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(null);
      await expect(controller.getUpdates('plan-x', 1)).rejects.toThrow(NotFoundException);
    });

    it('should return route events', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({ id: 1 });
      prisma.routeEvent.findMany.mockResolvedValue([{ id: 1 }]);
      const result = await controller.getUpdates('plan-1', 1);
      expect(result).toHaveLength(1);
    });
  });

  describe('startRoute', () => {
    it('should throw BadRequestException when plan not active', async () => {
      prisma.routePlan.findFirst.mockResolvedValue({
        ...mockPlan,
        status: 'COMPLETED',
      });
      await expect(controller.startRoute('plan-1', { odometer: 100 }, 1)).rejects.toThrow(BadRequestException);
    });

    it('should delegate to driverEventService when plan active', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      const result = await controller.startRoute('plan-1', { odometer: 100 }, 1);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('pickupComplete', () => {
    it('should delegate to driverEventService', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      const result = await controller.pickupComplete('plan-1', { segmentId: 'seg-1' }, 1);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('deliveryComplete', () => {
    it('should delegate to driverEventService', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      const result = await controller.deliveryComplete('plan-1', { segmentId: 'seg-1' }, 1);
      expect(result).toEqual({ ok: true });
    });
  });

  describe('dispatcherOverride', () => {
    it('should delegate to driverEventService', async () => {
      prisma.routePlan.findFirst.mockResolvedValue(mockPlan);
      const result = await controller.dispatcherOverride(
        'plan-1',
        { segmentId: 'seg-1', newStatus: 'completed', reason: 'test override' },
        1,
        { userId: 'u-1' },
      );
      expect(result).toEqual({ ok: true });
    });
  });
});
