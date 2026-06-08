import { LoadCreateTool } from '../fleet/load-create.tool';

describe('LoadCreateTool', () => {
  let tool: LoadCreateTool;
  let mockPrisma: any;
  let mockLoadsService: any;

  beforeEach(() => {
    mockPrisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 7,
            customerId: 'CUST-001',
            companyName: 'Acme Shipping',
          },
        ]),
      },
    };
    mockLoadsService = {
      create: jest.fn().mockResolvedValue({
        loadNumber: 'LD-20260420-001',
        status: 'PENDING',
      }),
    };
    tool = new LoadCreateTool(mockPrisma, mockLoadsService);
  });

  const validArgs = {
    customerName: 'Acme',
    pickup: {
      name: 'Acme Dallas DC',
      address: '1 Main St',
      city: 'Dallas',
      state: 'TX',
      zipCode: '75201',
      appointmentDate: '2026-04-25',
      estimatedDockHours: 2,
    },
    dropoff: {
      name: 'Acme Houston DC',
      address: '10 Oak St',
      city: 'Houston',
      state: 'TX',
      zipCode: '77002',
      appointmentDate: '2026-04-26',
      estimatedDockHours: 2,
    },
    weightLbs: 15000,
    commodityType: 'dry goods',
    rateCents: 240000,
    _tenantId: 1,
  };

  it('returns error when tenant context missing', async () => {
    const result = await tool.createLoad({
      ...validArgs,
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockLoadsService.create).not.toHaveBeenCalled();
  });

  it('creates a load with resolved customer and 2 stops', async () => {
    const result = await tool.createLoad(validArgs);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.loadNumber).toBe('LD-20260420-001');
    expect(mockLoadsService.create).toHaveBeenCalledTimes(1);
    const callArg = mockLoadsService.create.mock.calls[0][0];
    expect(callArg.tenantId).toBe(1);
    expect(callArg.customerId).toBe(7);
    expect(callArg.customerName).toBe('Acme Shipping');
    expect(callArg.rateCents).toBe(240000);
    expect(callArg.stops).toHaveLength(2);
    expect(callArg.stops[0].actionType).toBe('PICKUP');
    expect(callArg.stops[0].sequenceOrder).toBe(1);
    expect(callArg.stops[1].actionType).toBe('DROPOFF');
    expect(callArg.stops[1].sequenceOrder).toBe(2);
    expect(callArg.intakeSource).toBe('agent');
  });

  it('returns error when customer not found', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);
    const result = await tool.createLoad({
      ...validArgs,
      customerName: 'Unknown',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/No customer|not found/i);
    expect(mockLoadsService.create).not.toHaveBeenCalled();
  });

  it('returns disambiguation error on multiple customer matches', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { id: 7, companyName: 'Acme Shipping' },
      { id: 8, companyName: 'Acme Logistics' },
    ]);
    const result = await tool.createLoad({
      ...validArgs,
      customerName: 'Acme',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/multiple|more specific/i);
    expect(mockLoadsService.create).not.toHaveBeenCalled();
  });

  it('surfaces service errors as user-friendly messages', async () => {
    mockLoadsService.create.mockRejectedValue(new Error('Customer is required...'));
    const result = await tool.createLoad(validArgs);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(parsed.success).toBeUndefined();
  });
});
