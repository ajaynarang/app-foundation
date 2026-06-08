import { FleetQueryTool } from '../fleet-query.tool';

describe('FleetQueryTool', () => {
  let tool: FleetQueryTool;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      driver: {
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      alert: {
        count: jest.fn().mockResolvedValue(0),
      },
      vehicle: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    tool = new FleetQueryTool(mockPrisma);
  });

  describe('queryLoads', () => {
    it('returns loads with driver and vehicle info', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'L-1001',
          status: 'IN_TRANSIT',
          customerName: 'Acme Corp',
          weightLbs: 40000,
          commodityType: 'Dry Goods',
          referenceNumber: 'PO-123',
          rateCents: 250000,
          driver: { name: 'John Smith', driverId: 'drv_1' },
          vehicle: { unitNumber: 'TRK-101', vehicleId: 'veh_1' },
          stops: [
            {
              actionType: 'pickup',
              sequenceOrder: 1,
              stop: { name: 'Warehouse A', city: 'Dallas', state: 'TX' },
            },
          ],
        },
      ]);

      const result = await tool.queryLoads({ limit: 20, _tenantId: 1 });
      const data = JSON.parse(result.content[0].text);
      expect(data.count).toBe(1);
      expect(data.loads[0].driver).toBe('John Smith');
      expect(data.loads[0].rateDollars).toBe('2500.00');
      expect(data.loads[0].stops[0].facility).toBe('Warehouse A');
    });

    it('handles unassigned driver/vehicle', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'L-1002',
          status: 'PENDING',
          customerName: null,
          weightLbs: null,
          commodityType: null,
          referenceNumber: null,
          rateCents: null,
          driver: null,
          vehicle: null,
          stops: [],
        },
      ]);

      const result = await tool.queryLoads({ limit: 20, _tenantId: 1 });
      const data = JSON.parse(result.content[0].text);
      expect(data.loads[0].driver).toBe('Unassigned');
      expect(data.loads[0].vehicle).toBe('Unassigned');
      expect(data.loads[0].rateDollars).toBeNull();
    });
  });

  describe('getDriverHOS', () => {
    it('returns HOS data with computed limits', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        driverId: 'drv_1',
        name: 'John Smith',
        currentHoursDriven: 5,
        currentOnDutyTime: 8,
        currentHoursSinceBreak: 4,
        cycleHoursUsed: 40,
        hosDataSyncedAt: new Date('2026-01-01'),
      });

      const result = await tool.getDriverHOS({
        driverName: 'John',
        _tenantId: 1,
      });

      const data = JSON.parse(result.content[0].text);
      expect(data.name).toBe('John Smith');
      expect(data.hos.driveTimeRemaining).toBe(6); // 11 - 5
      expect(data.hos.dutyTimeRemaining).toBe(6); // 14 - 8
      expect(data.hos.cycleTimeRemaining).toBe(30); // 70 - 40
      expect(data.hos.breakRequired).toBe(false); // 4 < 8
      expect(result._card.type).toBe('hos');
    });

    it('returns break required when hours exceed limit', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue({
        driverId: 'drv_1',
        name: 'John',
        currentHoursDriven: 0,
        currentOnDutyTime: 0,
        currentHoursSinceBreak: 9,
        cycleHoursUsed: 0,
        hosDataSyncedAt: null,
      });

      const result = await tool.getDriverHOS({
        driverName: 'John',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.hos.breakRequired).toBe(true);
      expect(data.lastSynced).toBe('Never');
    });

    it('returns error when driver not found', async () => {
      mockPrisma.driver.findFirst.mockResolvedValue(null);

      const result = await tool.getDriverHOS({
        driverName: 'Nobody',
        _tenantId: 1,
      });
      const data = JSON.parse(result.content[0].text);
      expect(data.error).toContain('No active driver found');
    });
  });

  describe('getFleetStatus', () => {
    it('returns fleet overview', async () => {
      mockPrisma.load.count
        .mockResolvedValueOnce(5) // active
        .mockResolvedValueOnce(20); // total
      mockPrisma.driver.count
        .mockResolvedValueOnce(8) // active
        .mockResolvedValueOnce(10); // total
      mockPrisma.alert.count.mockResolvedValue(3);
      mockPrisma.vehicle.count
        .mockResolvedValueOnce(12) // available
        .mockResolvedValueOnce(15); // total

      const result = await tool.getFleetStatus({ _tenantId: 1 });
      const data = JSON.parse(result.content[0].text);
      expect(data.loads.active).toBe(5);
      expect(data.loads.total).toBe(20);
      expect(data.drivers.active).toBe(8);
      expect(data.alerts.open).toBe(3);
      expect(data.vehicles.available).toBe(12);
      expect(result._card.type).toBe('fleet');
    });
  });
});
