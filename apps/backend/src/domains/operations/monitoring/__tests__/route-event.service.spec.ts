import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RouteEventService } from '../services/route-event.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertTriggersService } from '../../alerts/services/alert-triggers.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';

describe('RouteEventService', () => {
  let service: RouteEventService;

  const mockPrisma = {
    routeEvent: { create: jest.fn().mockResolvedValue({ id: 1 }) },
  };
  const mockAlertTriggers = {
    trigger: jest.fn().mockResolvedValue({ alertId: 'ALT-001' }),
  };
  const mockEventEmitter = { emit: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RouteEventService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AlertTriggersService, useValue: mockAlertTriggers },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get(RouteEventService);
    jest.clearAllMocks();
  });

  describe('recordEvent', () => {
    it('should create a RouteEvent record and emit SSE', async () => {
      const result = await service.recordEvent({
        planId: 1,
        planStringId: 'RP-001',
        tenantId: 1,
        segmentId: 'seg-1',
        eventType: 'ROUTE_STARTED',
        source: 'driver',
        eventData: { notes: 'Starting route' },
      });

      expect(result.eventId).toBeDefined();
      expect(result.eventId).toMatch(/^EVT-/);
      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 1,
          segmentId: 'seg-1',
          eventType: 'ROUTE_STARTED',
          source: 'driver',
        }),
      });
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ROUTE_EVENT_RECORDED,
        expect.objectContaining({
          event: SALLY_EVENTS.ROUTE_EVENT_RECORDED,
          tenantId: '1',
          data: expect.objectContaining({
            planId: 'RP-001',
            eventType: 'ROUTE_STARTED',
          }),
        }),
      );
    });

    it('should handle optional fields as null/undefined', async () => {
      await service.recordEvent({
        planId: 1,
        planStringId: 'RP-001',
        tenantId: 1,
        eventType: 'ROUTE_COMPLETED',
        source: 'system',
      });

      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          segmentId: null,
          replanRecommended: false,
          replanReason: null,
        }),
      });
    });
  });

  describe('handleMonitoringTriggers', () => {
    it('should fire alerts and record events for each trigger', async () => {
      const triggers = [
        {
          type: 'HOS_APPROACHING_LIMIT',
          severity: 'high' as const,
          requiresReplan: false,
          etaImpactMinutes: 0,
          params: { driverName: 'John', remainingMinutes: 45 },
        },
      ];

      await service.handleMonitoringTriggers(
        triggers,
        { planId: 'RP-001', id: 1, tenantId: 1, planVersion: 1 },
        'driver-1',
      );

      expect(mockAlertTriggers.trigger).toHaveBeenCalledWith(
        'HOS_APPROACHING_LIMIT',
        1,
        'driver-1',
        expect.any(Object),
      );
      expect(mockPrisma.routeEvent.create).toHaveBeenCalled();
    });

    it('should emit replan_recommended SSE when trigger requires replan with >30min impact', async () => {
      const triggers = [
        {
          type: 'HOS_VIOLATION',
          severity: 'critical' as const,
          requiresReplan: true,
          etaImpactMinutes: 600,
          params: { driverName: 'John' },
        },
      ];

      await service.handleMonitoringTriggers(
        triggers,
        { planId: 'RP-001', id: 1, tenantId: 1, planVersion: 1 },
        'driver-1',
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ROUTE_REPLAN_RECOMMENDED,
        expect.objectContaining({
          event: SALLY_EVENTS.ROUTE_REPLAN_RECOMMENDED,
          tenantId: '1',
          data: expect.objectContaining({
            planId: 'RP-001',
          }),
        }),
      );
    });

    it('should not process empty triggers array', async () => {
      await service.handleMonitoringTriggers([], { planId: 'RP-001', id: 1, tenantId: 1, planVersion: 1 }, 'driver-1');

      expect(mockAlertTriggers.trigger).not.toHaveBeenCalled();
      expect(mockPrisma.routeEvent.create).not.toHaveBeenCalled();
    });

    it('should emit eta_shifted SSE for non-replan triggers with ETA impact', async () => {
      const triggers = [
        {
          type: 'ROUTE_DELAY',
          severity: 'medium' as const,
          requiresReplan: false,
          etaImpactMinutes: 15,
          params: { delayMinutes: 15 },
        },
      ];

      await service.handleMonitoringTriggers(
        triggers,
        { planId: 'RP-001', id: 1, tenantId: 1, planVersion: 1 },
        'driver-1',
      );

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SALLY_EVENTS.ROUTE_ETA_SHIFTED,
        expect.objectContaining({
          event: SALLY_EVENTS.ROUTE_ETA_SHIFTED,
          tenantId: '1',
          data: expect.objectContaining({
            planId: 'RP-001',
            etaShiftMinutes: 15,
          }),
        }),
      );
    });
  });
});
