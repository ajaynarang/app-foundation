import { CommsCustomerTool } from '../comms-customer.tool';

describe('CommsCustomerTool', () => {
  let tool: CommsCustomerTool;
  let mockPrisma: { customer: { findMany: jest.Mock } };
  let mockEmailService: { sendEmail: jest.Mock };

  beforeEach(() => {
    mockPrisma = {
      customer: {
        findMany: jest.fn().mockResolvedValue([
          {
            customerId: 'cust_abc',
            companyName: 'Acme Shipping',
            billingEmail: 'billing@acme.com',
          },
        ]),
      },
    };
    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    tool = new CommsCustomerTool(mockPrisma as any, mockEmailService as any);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.sendCustomerMessage({
      customerName: 'Acme Shipping',
      subject: 'Running late',
      body: 'We will be 45 minutes late.',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('customer not found — email service not called', async () => {
    mockPrisma.customer.findMany.mockResolvedValueOnce([]);
    const result = await tool.sendCustomerMessage({
      customerName: 'Ghost Corp',
      subject: 'Hello',
      body: 'Test',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/Ghost Corp/);
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('ambiguous customer match — disambiguation error', async () => {
    mockPrisma.customer.findMany.mockResolvedValueOnce([
      {
        customerId: 'c1',
        companyName: 'Acme East',
        billingEmail: 'east@acme.com',
      },
      {
        customerId: 'c2',
        companyName: 'Acme West',
        billingEmail: 'west@acme.com',
      },
    ]);
    const result = await tool.sendCustomerMessage({
      customerName: 'Acme',
      subject: 'Hello',
      body: 'Test',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/multiple/i);
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('happy path — sends email to resolved billingEmail', async () => {
    const result = await tool.sendCustomerMessage({
      customerName: 'Acme Shipping',
      subject: 'Invoice #4521',
      body: 'Please see attached invoice.',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.to).toBe('billing@acme.com');
    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'billing@acme.com',
        subject: 'Invoice #4521',
      }),
    );
  });
});
