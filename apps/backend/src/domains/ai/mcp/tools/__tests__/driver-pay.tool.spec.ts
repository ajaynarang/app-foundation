import { DriverPayTool } from '../driver-pay.tool';

describe('DriverPayTool', () => {
  let tool: DriverPayTool;
  let mockPrisma: any;
  let mockSettlementsService: any;
  let mockPayStructureService: any;

  const mockUser = { id: 1, driverId: 42 };
  const mockDriver = { id: 42, driverId: 'drv_abc123' };

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(mockUser),
      },
      driver: {
        findUnique: jest.fn().mockResolvedValue(mockDriver),
      },
      load: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockSettlementsService = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    mockPayStructureService = {
      getByDriverId: jest.fn().mockResolvedValue(null),
    };

    tool = new DriverPayTool(mockPrisma, mockSettlementsService, mockPayStructureService);
  });

  describe('getMySettlement', () => {
    it('should return error when no userId', async () => {
      const result = await tool.getMySettlement({});
      expect(JSON.parse(result.content[0].text).error).toContain('session');
    });

    it('should return error when user has no driver profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });
      const result = await tool.getMySettlement({ _userId: 'user_1' });
      expect(JSON.parse(result.content[0].text).error).toContain('not linked to a driver');
    });

    it('should return error when driver string ID not found', async () => {
      mockPrisma.driver.findUnique.mockResolvedValue(null);
      const result = await tool.getMySettlement({
        _userId: 'user_1',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('not linked to a driver');
    });

    it('should return no settlements found message', async () => {
      mockSettlementsService.findAll.mockResolvedValue([]);
      const result = await tool.getMySettlement({
        _userId: 'user_1',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).message).toContain('No settlements found');
    });

    it('should return latest settlement with card data', async () => {
      mockSettlementsService.findAll.mockResolvedValue([
        {
          settlementId: 'stl_1',
          settlementNumber: 'STL-001',
          status: 'APPROVED',
          driver: { name: 'Mike Johnson' },
          periodStart: '2026-03-01',
          periodEnd: '2026-03-15',
          grossPayCents: 350000,
          deductionsCents: 25000,
          netPayCents: 325000,
          lineItems: [{ id: 1 }, { id: 2 }],
        },
      ]);

      const result = await tool.getMySettlement({
        _userId: 'user_1',
        _tenantId: 1,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.grossPayDollars).toBe('3500.00');
      expect(parsed.deductionsDollars).toBe('250.00');
      expect(parsed.netPayDollars).toBe('3250.00');
      expect(parsed.lineItemCount).toBe(2);
      expect((result as any)._card.type).toBe('settlement');
    });

    it('should handle null pay amounts', async () => {
      mockSettlementsService.findAll.mockResolvedValue([
        {
          settlementId: 'stl_1',
          settlementNumber: 'STL-001',
          status: 'DRAFT',
          driver: { name: 'Mike' },
          grossPayCents: null,
          deductionsCents: null,
          netPayCents: null,
          lineItems: [],
        },
      ]);

      const result = await tool.getMySettlement({
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.grossPayDollars).toBeNull();
      expect(parsed.netPayDollars).toBeNull();
    });
  });

  describe('getMyLoads', () => {
    it('should return error when no userId', async () => {
      const result = await tool.getMyLoads({ limit: 10 });
      expect(JSON.parse(result.content[0].text).error).toContain('session');
    });

    it('should return error when user has no driver profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });
      const result = await tool.getMyLoads({
        limit: 10,
        _userId: 'user_1',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('not linked to a driver');
    });

    it('should return empty loads list', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);
      const result = await tool.getMyLoads({
        limit: 10,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(0);
      expect(parsed.loads).toEqual([]);
    });

    it('should return loads with status filter message', async () => {
      mockPrisma.load.findMany.mockResolvedValue([]);
      const result = await tool.getMyLoads({
        status: 'DELIVERED',
        limit: 10,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('DELIVERED');
    });

    it('should return mapped loads with stop data', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'L-1001',
          status: 'delivered',
          customerName: 'Acme',
          rateCents: 150000,
          deliveredAt: new Date('2026-03-15T10:00:00Z'),
          createdAt: new Date('2026-03-10T10:00:00Z'),
          stops: [
            {
              sequenceOrder: 1,
              actionType: 'pickup',
              stop: { name: 'Warehouse A', city: 'Dallas', state: 'TX' },
              appointmentDate: new Date('2026-03-12T08:00:00Z'),
              status: 'completed',
            },
            {
              sequenceOrder: 2,
              actionType: 'delivery',
              stop: { name: 'Store B', city: null, state: null },
              appointmentDate: null,
              status: 'completed',
            },
          ],
        },
      ]);

      const result = await tool.getMyLoads({
        limit: 10,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.loads[0].rateDollars).toBe('1500.00');
      expect(parsed.loads[0].stops[0].location).toContain('Dallas');
      expect(parsed.loads[0].stops[1].location).toContain('Store B');
    });

    it('should handle null rateCents', async () => {
      mockPrisma.load.findMany.mockResolvedValue([
        {
          loadNumber: 'L-1002',
          status: 'in_transit',
          customerName: 'Test',
          rateCents: null,
          deliveredAt: null,
          createdAt: null,
          stops: [],
        },
      ]);

      const result = await tool.getMyLoads({
        limit: 10,
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.loads[0].rateDollars).toBeNull();
      expect(parsed.loads[0].deliveredAt).toBeNull();
    });
  });

  describe('getMyPayStructure', () => {
    it('should return error when no userId', async () => {
      const result = await tool.getMyPayStructure({});
      expect(JSON.parse(result.content[0].text).error).toContain('session');
    });

    it('should return error when no driver profile', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: 1, driverId: null });
      const result = await tool.getMyPayStructure({ _userId: 'user_1' });
      expect(JSON.parse(result.content[0].text).error).toContain('not linked to a driver');
    });

    it('should return no pay structure message', async () => {
      mockPayStructureService.getByDriverId.mockResolvedValue(null);
      const result = await tool.getMyPayStructure({
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('No pay structure');
    });

    it('should return pay structure details', async () => {
      mockPayStructureService.getByDriverId.mockResolvedValue({
        type: 'per_mile',
        ratePerMileCents: 55,
        percentage: null,
        flatRateCents: null,
        hybridBaseCents: null,
        hybridPercent: null,
        effectiveDate: '2026-01-01',
        notes: 'Standard rate',
      });

      const result = await tool.getMyPayStructure({
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.type).toBe('per_mile');
      expect(parsed.ratePerMileDollars).toBe('0.55');
    });

    it('should handle pay structure service error', async () => {
      mockPayStructureService.getByDriverId.mockRejectedValue(new Error('Service unavailable'));
      const result = await tool.getMyPayStructure({
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Service unavailable');
    });

    it('should handle unknown pay structure service error', async () => {
      mockPayStructureService.getByDriverId.mockRejectedValue('unknown error');
      const result = await tool.getMyPayStructure({
        _userId: 'user_1',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Unable to retrieve pay structure');
    });
  });
});
