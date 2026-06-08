import { CustomerCreateTool } from '../customer-create.tool';

describe('CustomerCreateTool', () => {
  let tool: CustomerCreateTool;
  let mockCustomersService: { create: jest.Mock };

  beforeEach(() => {
    mockCustomersService = {
      create: jest.fn().mockResolvedValue({
        customerId: 'cust_abc123',
        companyName: 'Acme Shipping',
      }),
    };
    tool = new CustomerCreateTool(mockCustomersService as any);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.createCustomer({
      companyName: 'Acme Shipping',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockCustomersService.create).not.toHaveBeenCalled();
  });

  it('happy path — minimal (companyName only)', async () => {
    const result = await tool.createCustomer({
      companyName: 'Acme Shipping',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.customerId).toBe('cust_abc123');
    expect(parsed.companyName).toBe('Acme Shipping');
    expect(mockCustomersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 1, companyName: 'Acme Shipping' }),
    );
    const callArgs = mockCustomersService.create.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('_tenantId');
    expect(callArgs).not.toHaveProperty('_userId');
  });

  it('happy path — all optional fields forwarded', async () => {
    mockCustomersService.create.mockResolvedValueOnce({
      customerId: 'cust_xyz',
      companyName: 'XYZ Logistics',
    });
    const result = await tool.createCustomer({
      companyName: 'XYZ Logistics',
      customerType: 'BROKER',
      mcNumber: 'MC-123456',
      dotNumber: 'DOT-789',
      billingEmail: 'billing@xyz.com',
      paymentTerms: 'NET_30',
      creditLimit: 50000,
      notes: 'Key broker, handle with care',
      _tenantId: 2,
      _userId: 'user-abc',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(mockCustomersService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 2,
        companyName: 'XYZ Logistics',
        customerType: 'BROKER',
        mcNumber: 'MC-123456',
        dotNumber: 'DOT-789',
        billingEmail: 'billing@xyz.com',
        paymentTerms: 'NET_30',
        creditLimit: 50000,
        notes: 'Key broker, handle with care',
      }),
    );
    const callArgs = mockCustomersService.create.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty('_tenantId');
    expect(callArgs).not.toHaveProperty('_userId');
  });

  it('surfaces service errors as user-friendly message', async () => {
    mockCustomersService.create.mockRejectedValue(new Error('Customer with company name Acme Shipping already exists'));
    const result = await tool.createCustomer({
      companyName: 'Acme Shipping',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/Acme Shipping/);
  });
});
