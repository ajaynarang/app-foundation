import { DriverActionTool } from '../driver-action.tool';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverActionTool', () => {
  let tool: DriverActionTool;
  let mockPrisma: any;

  const mockUser = { id: 1, driverId: 42 };
  const mockDriver = { id: 42, driverId: 'DRV-001', name: 'Mike Johnson' };
  const mockRoutePlan = {
    id: 100,
    planId: 'RP-001',
    tenantId: 1,
    driverId: 42,
    segments: [
      {
        id: 1,
        segmentId: 'SEG-001',
        sequenceOrder: 1,
        segmentType: 'DRIVE',
        toLocation: 'Indianapolis, IN',
        status: 'COMPLETED',
      },
      {
        id: 2,
        segmentId: 'SEG-002',
        sequenceOrder: 2,
        segmentType: 'DOCK',
        toLocation: 'Indianapolis Warehouse',
        status: 'PLANNED',
      },
      {
        id: 3,
        segmentId: 'SEG-003',
        sequenceOrder: 3,
        segmentType: 'DRIVE',
        toLocation: 'Columbus, OH',
        status: 'PLANNED',
      },
    ],
  };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
      driver: {
        findFirst: jest.fn().mockResolvedValue(mockDriver),
      },
      routePlan: {
        findFirst: jest.fn().mockResolvedValue(mockRoutePlan),
      },
      routeEvent: {
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 1,
          eventId: data.eventId,
        })),
      },
      routeSegment: {
        update: jest.fn().mockResolvedValue({}),
      },
      alert: {
        create: jest.fn().mockImplementation(({ data }) => ({
          ...data,
          id: 1,
          alertId: data.alertId,
        })),
      },
      // Mock $transaction to resolve all PrismaPromise objects in the array
      $transaction: jest.fn().mockImplementation((promises: any[]) => Promise.all(promises)),
    };

    tool = new DriverActionTool(mockPrisma as unknown as PrismaService);
  });

  describe('reportDelay', () => {
    it('should create a RouteEvent and Alert for a delay in a transaction', async () => {
      const result = await tool.reportDelay({
        reason: 'Traffic jam on I-65',
        estimatedDelayMinutes: 30,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Delay reported');

      // Verify $transaction was called (not individual creates)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      // Verify the underlying create calls were made within the transaction
      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 100,
          eventType: 'driver_delay_report',
          source: 'driver',
          eventData: expect.objectContaining({
            reason: 'Traffic jam on I-65',
            estimatedDelayMinutes: 30,
          }),
        }),
      });

      expect(mockPrisma.alert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: 1,
          // Phase 2 Task 10 — alert.driverId is the Int FK on drivers.id.
          // mockDriver.id = 42, mockRoute.id is the active route's Int PK.
          driverId: 42,
          alertType: 'driver_reported_delay',
          priority: 'MEDIUM',
          category: 'driver_report',
        }),
      });
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.reportDelay({
        reason: 'Traffic',
        estimatedDelayMinutes: 15,
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });

    it('should return error when user has no linked driver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });

      const result = await tool.reportDelay({
        reason: 'Traffic',
        estimatedDelayMinutes: 15,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not linked to a driver profile');
    });

    it('should return error when no active route', async () => {
      mockPrisma.routePlan.findFirst.mockResolvedValue(null);

      const result = await tool.reportDelay({
        reason: 'Traffic',
        estimatedDelayMinutes: 15,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No active route');
    });
  });

  describe('reportArrival', () => {
    it('should mark the next planned segment as arrived in a transaction', async () => {
      const result = await tool.reportArrival({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.segmentId).toBe('SEG-002');
      expect(data.destination).toBe('Indianapolis Warehouse');

      // Verify $transaction was called
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);

      expect(mockPrisma.routeSegment.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { actualArrival: expect.any(Date), status: 'COMPLETED' },
      });

      expect(mockPrisma.routeEvent.create).toHaveBeenCalled();
      expect(mockPrisma.alert.create).toHaveBeenCalled();
    });

    it('should match segment by stopDescription when provided', async () => {
      const result = await tool.reportArrival({
        stopDescription: 'Columbus',
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.segmentId).toBe('SEG-003');
      expect(data.destination).toBe('Columbus, OH');
    });

    it('should return error when no matching segment found', async () => {
      const result = await tool.reportArrival({
        stopDescription: 'Nonexistent City',
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No matching planned stop');
    });

    it('should return error when all segments are completed', async () => {
      const allCompleted = {
        ...mockRoutePlan,
        segments: mockRoutePlan.segments.map((s) => ({
          ...s,
          status: 'COMPLETED',
        })),
      };
      mockPrisma.routePlan.findFirst.mockResolvedValue(allCompleted);

      const result = await tool.reportArrival({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No matching planned stop');
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.reportArrival({
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });
  });

  describe('reportFuelStop', () => {
    it('should create a fuel stop event', async () => {
      const result = await tool.reportFuelStop({
        fuelStation: 'Pilot Travel Center',
        gallons: 120,
        costDollars: 480.0,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);
      expect(data.message).toContain('Fuel stop logged');

      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          planId: 100,
          eventType: 'driver_fuel_report',
          source: 'driver',
          eventData: expect.objectContaining({
            fuelStation: 'Pilot Travel Center',
            gallons: 120,
            costDollars: 480.0,
          }),
        }),
      });
    });

    it('should work without optional costDollars', async () => {
      const result = await tool.reportFuelStop({
        fuelStation: "Love's",
        gallons: 100,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.success).toBe(true);

      expect(mockPrisma.routeEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventData: expect.objectContaining({
            fuelStation: "Love's",
            gallons: 100,
          }),
        }),
      });
    });

    it('should return error when no active route', async () => {
      mockPrisma.routePlan.findFirst.mockResolvedValue(null);

      const result = await tool.reportFuelStop({
        fuelStation: 'Pilot',
        gallons: 50,
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No active route');
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.reportFuelStop({
        fuelStation: 'Pilot',
        gallons: 50,
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });
  });
});
