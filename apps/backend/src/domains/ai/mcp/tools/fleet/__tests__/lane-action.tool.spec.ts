import { LaneActionTool } from '../lane-action.tool';

describe('LaneActionTool', () => {
  let tool: LaneActionTool;
  let mockPrisma: any;
  let mockRecurringLanesService: any;

  const mockLane = {
    id: 10,
    name: 'Dallas-Houston',
    tenantId: 1,
  };

  beforeEach(() => {
    mockPrisma = {
      load: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      driver: { findMany: jest.fn() },
      vehicle: { findMany: jest.fn() },
      recurringLane: {
        findMany: jest.fn().mockResolvedValue([mockLane]),
      },
    };

    mockRecurringLanesService = {
      generateLoad: jest.fn().mockResolvedValue({
        id: 100,
        loadNumber: 'L-2001',
      }),
    };

    tool = new LaneActionTool(mockPrisma, mockRecurringLanesService);
  });

  describe('generateLoadFromLane', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.generateLoadFromLane({ laneName: 'Dallas' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should generate a load from lane by name', async () => {
      const result = await tool.generateLoadFromLane({
        laneName: 'Dallas',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.loadNumber).toBe('L-2001');
      expect(parsed.laneName).toBe('Dallas-Houston');
    });

    it('should update pickup date when provided', async () => {
      const result = await tool.generateLoadFromLane({
        laneName: 'Dallas',
        pickupDate: '2026-04-01',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockPrisma.load.update).toHaveBeenCalledWith({
        where: { id: 100 },
        data: { pickupDate: expect.any(Date) },
      });
    });

    it('should return error when lane not found', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([]);
      const result = await tool.generateLoadFromLane({
        laneName: 'Nonexistent',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return error when multiple lanes match', async () => {
      mockPrisma.recurringLane.findMany.mockResolvedValue([mockLane, { ...mockLane, id: 11, name: 'Dallas-Austin' }]);
      const result = await tool.generateLoadFromLane({
        laneName: 'Dallas',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Multiple');
    });

    it('should handle generateLoad service error', async () => {
      mockRecurringLanesService.generateLoad.mockRejectedValue(new Error('Lane config invalid'));
      const result = await tool.generateLoadFromLane({
        laneName: 'Dallas',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Failed to generate load');
    });
  });
});
