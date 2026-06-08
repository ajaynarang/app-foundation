import { DriverReadTool } from '../driver-read.tool';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';

describe('DriverReadTool', () => {
  let tool: DriverReadTool;
  let mockPrisma: any;

  // Shared mock data
  const mockUser = { id: 1, driverId: 42 };
  const mockDriver = {
    id: 42,
    driverId: 'DRV-001',
    name: 'Mike Johnson',
    currentHoursDriven: 4.5,
    currentOnDutyTime: 6.0,
    currentHoursSinceBreak: 3.0,
    cycleHoursUsed: 35.0,
    hosDataSyncedAt: new Date('2026-02-19T10:00:00Z'),
  };
  const mockRoutePlan = {
    planId: 'RP-001',
    status: 'in_progress',
    isActive: true,
    isFeasible: true,
    departureTime: new Date('2026-02-19T06:00:00Z'),
    estimatedArrival: new Date('2026-02-19T18:00:00Z'),
    totalDistanceMiles: 450.0,
    totalDriveTimeHours: 7.5,
    totalTripTimeHours: 10.0,
    driver: { name: 'Mike Johnson', driverId: 'DRV-001' },
    vehicle: { unitNumber: 'TRK-101', vehicleId: 'VEH-001' },
    segments: [
      {
        sequenceOrder: 1,
        segmentType: 'DRIVE',
        fromLocation: 'Chicago, IL',
        toLocation: 'Indianapolis, IN',
        distanceMiles: 180.0,
        driveTimeHours: 3.0,
        estimatedDeparture: new Date('2026-02-19T06:00:00Z'),
        estimatedArrival: new Date('2026-02-19T09:00:00Z'),
        status: 'COMPLETED',
      },
      {
        sequenceOrder: 2,
        segmentType: 'DOCK',
        fromLocation: 'Indianapolis, IN',
        toLocation: 'Indianapolis, IN',
        distanceMiles: 0,
        driveTimeHours: 0,
        estimatedDeparture: new Date('2026-02-19T09:00:00Z'),
        estimatedArrival: new Date('2026-02-19T10:00:00Z'),
        status: 'COMPLETED',
      },
      {
        sequenceOrder: 3,
        segmentType: 'DRIVE',
        fromLocation: 'Indianapolis, IN',
        toLocation: 'Columbus, OH',
        distanceMiles: 175.0,
        driveTimeHours: 3.0,
        estimatedDeparture: new Date('2026-02-19T10:00:00Z'),
        estimatedArrival: new Date('2026-02-19T13:00:00Z'),
        status: 'PLANNED',
      },
      {
        sequenceOrder: 4,
        segmentType: 'DOCK',
        fromLocation: 'Columbus, OH',
        toLocation: 'Columbus, OH',
        distanceMiles: 0,
        driveTimeHours: 0,
        estimatedDeparture: new Date('2026-02-19T13:00:00Z'),
        estimatedArrival: new Date('2026-02-19T14:00:00Z'),
        status: 'PLANNED',
      },
    ],
    loads: [
      {
        load: {
          loadNumber: 'LD-001',
          status: 'IN_TRANSIT',
          customerName: 'Acme Corp',
        },
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
    };

    tool = new DriverReadTool(mockPrisma as unknown as PrismaService);
  });

  describe('getMyRoute', () => {
    it('should return the active route for the authenticated driver', async () => {
      const result = await tool.getMyRoute({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.planId).toBe('RP-001');
      expect(data.status).toBe('in_progress');
      expect(data.segments).toHaveLength(4);
      expect(data.loads).toHaveLength(1);

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { userId: 'usr_001' },
        select: { driverId: true },
      });
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.getMyRoute({ _tenantId: 1 });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });

    it('should return error when user has no linked driver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });

      const result = await tool.getMyRoute({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not linked to a driver profile');
    });

    it('should return error when no active route exists', async () => {
      mockPrisma.routePlan.findFirst.mockResolvedValue(null);

      const result = await tool.getMyRoute({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No active route');
    });
  });

  describe('getMyHOS', () => {
    it('should return HOS status with correct calculations', async () => {
      const result = await tool.getMyHOS({ _tenantId: 1, _userId: 'usr_001' });

      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe('Mike Johnson');
      expect(data.hos.driveTimeRemaining).toBe(6.5); // 11 - 4.5
      expect(data.hos.dutyTimeRemaining).toBe(8.0); // 14 - 6.0
      expect(data.hos.cycleTimeRemaining).toBe(35.0); // 70 - 35.0
      expect(data.hos.breakRequired).toBe(false); // 3.0 < 8
    });

    it('should flag break as required when hours since break >= 8', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        ...mockDriver,
        currentHoursSinceBreak: 8.0,
      });

      const result = await tool.getMyHOS({ _tenantId: 1, _userId: 'usr_001' });

      const data = JSON.parse(result.content[0].text);
      expect(data.hos.breakRequired).toBe(true);
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.getMyHOS({ _tenantId: 1 });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });

    it('should return error when user has no linked driver', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });

      const result = await tool.getMyHOS({ _tenantId: 1, _userId: 'usr_001' });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('not linked to a driver profile');
    });
  });

  describe('getMyNextStop', () => {
    it('should return the first planned segment', async () => {
      const result = await tool.getMyNextStop({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.segmentType).toBe('DRIVE');
      expect(data.destination).toBe('Columbus, OH');
      expect(data.distanceMiles).toBe(175.0);
    });

    it('should return message when all segments are completed', async () => {
      const allCompleted = {
        ...mockRoutePlan,
        segments: mockRoutePlan.segments.map((s) => ({
          ...s,
          status: 'COMPLETED',
        })),
      };
      mockPrisma.routePlan.findFirst.mockResolvedValue(allCompleted);

      const result = await tool.getMyNextStop({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.message).toContain('All stops completed');
    });

    it('should return session error when _userId is missing', async () => {
      const result = await tool.getMyNextStop({ _tenantId: 1 });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No authenticated session');
    });

    it('should return error when no active route', async () => {
      mockPrisma.routePlan.findFirst.mockResolvedValue(null);

      const result = await tool.getMyNextStop({
        _tenantId: 1,
        _userId: 'usr_001',
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No active route');
    });
  });
});
