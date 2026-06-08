import { SettlementCreateTool } from '../settlement-create.tool';

describe('SettlementCreateTool', () => {
  let tool: SettlementCreateTool;
  let mockPrisma: { driver: { findMany: jest.Mock } };
  let mockSettlementsService: { calculate: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([{ driverId: 'DRV-x', name: 'John Smith' }]),
      },
    };
    mockSettlementsService = {
      calculate: jest.fn().mockResolvedValue({
        settlementId: 'stl_abc123',
        grossPayCents: 150000,
      }),
    };
    tool = new SettlementCreateTool(mockPrisma as any, mockSettlementsService as any);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.createSettlement({
      driverName: 'John Smith',
      periodStart: '2026-04-12',
      periodEnd: '2026-04-18',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockSettlementsService.calculate).not.toHaveBeenCalled();
  });

  it('driver not found via resolver — service not called', async () => {
    mockPrisma.driver.findMany.mockResolvedValueOnce([]);
    const result = await tool.createSettlement({
      driverName: 'Ghost Driver',
      periodStart: '2026-04-12',
      periodEnd: '2026-04-18',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/Ghost Driver/);
    expect(mockSettlementsService.calculate).not.toHaveBeenCalled();
  });

  it('happy path — service called with correct args', async () => {
    const result = await tool.createSettlement({
      driverName: 'John Smith',
      periodStart: '2026-04-12',
      periodEnd: '2026-04-18',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.settlementId).toBe('stl_abc123');
    expect(parsed.grossPayCents).toBe(150000);
    expect(mockSettlementsService.calculate).toHaveBeenCalledWith(1, {
      driverId: 'DRV-x',
      periodStart: '2026-04-12',
      periodEnd: '2026-04-18',
    });
  });

  it('service throws "No delivered loads found" — user-friendly error', async () => {
    mockSettlementsService.calculate.mockRejectedValue(new Error('No delivered loads found in this period'));
    const result = await tool.createSettlement({
      driverName: 'John Smith',
      periodStart: '2026-04-12',
      periodEnd: '2026-04-18',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/No delivered loads/);
  });
});
