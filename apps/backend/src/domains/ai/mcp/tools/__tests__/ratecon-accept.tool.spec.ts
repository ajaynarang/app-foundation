import { RateconAcceptTool } from '../fleet/ratecon-accept.tool';

describe('RateconAcceptTool', () => {
  let tool: RateconAcceptTool;
  let mockPrisma: any;
  let mockLoadsService: any;

  beforeEach(() => {
    mockPrisma = {
      load: {
        findFirst: jest.fn().mockResolvedValue({
          loadNumber: 'LD-20260420-001',
          status: 'DRAFT',
        }),
      },
    };
    mockLoadsService = {
      updateDraft: jest.fn().mockResolvedValue(undefined),
      updateStatus: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({
        loadNumber: 'LD-20260420-001',
        status: 'PENDING',
      }),
    };
    tool = new RateconAcceptTool(mockPrisma, mockLoadsService);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.acceptRateconDraft({
      loadNumber: 'LD-20260420-001',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockPrisma.load.findFirst).not.toHaveBeenCalled();
    expect(mockLoadsService.updateStatus).not.toHaveBeenCalled();
  });

  it('returns error when load not found', async () => {
    mockPrisma.load.findFirst.mockResolvedValue(null);
    const result = await tool.acceptRateconDraft({
      loadNumber: 'LD-NOTEXIST-001',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/not found/i);
    expect(mockLoadsService.updateStatus).not.toHaveBeenCalled();
  });

  it('returns error when load status is not DRAFT', async () => {
    mockPrisma.load.findFirst.mockResolvedValue({
      loadNumber: 'LD-20260420-001',
      status: 'ASSIGNED',
    });
    const result = await tool.acceptRateconDraft({
      loadNumber: 'LD-20260420-001',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/ASSIGNED/);
    expect(mockLoadsService.updateDraft).not.toHaveBeenCalled();
    expect(mockLoadsService.updateStatus).not.toHaveBeenCalled();
  });

  it('happy path — no edits: promotes DRAFT to PENDING without calling updateDraft', async () => {
    const result = await tool.acceptRateconDraft({
      loadNumber: 'LD-20260420-001',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.loadNumber).toBe('LD-20260420-001');
    expect(parsed.status).toBe('PENDING');
    expect(parsed.message).toMatch(/PENDING/);
    expect(mockLoadsService.updateDraft).not.toHaveBeenCalled();
    expect(mockLoadsService.updateStatus).toHaveBeenCalledTimes(1);
    expect(mockLoadsService.updateStatus).toHaveBeenCalledWith('LD-20260420-001', 'PENDING');
  });

  it('happy path — with edits: applies updateDraft before promoting to PENDING', async () => {
    const result = await tool.acceptRateconDraft({
      loadNumber: 'LD-20260420-001',
      rateCents: 250000,
      commodity: 'frozen',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(mockLoadsService.updateDraft).toHaveBeenCalledTimes(1);
    expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('LD-20260420-001', {
      rateCents: 250000,
      commodityType: 'frozen',
    });
    expect(mockLoadsService.updateStatus).toHaveBeenCalledTimes(1);
    expect(mockLoadsService.updateStatus).toHaveBeenCalledWith('LD-20260420-001', 'PENDING');
  });
});
