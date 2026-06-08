import { ConflictException } from '@nestjs/common';
import { CustomerDeactivateTool } from '../customer-deactivate.tool';

describe('CustomerDeactivateTool', () => {
  let tool: CustomerDeactivateTool;
  let mockPrisma: {
    customer: { findMany: jest.Mock };
    user: { findFirst: jest.Mock };
  };
  let mockCustomersService: { deactivate: jest.Mock };

  const tenantId = 1;
  const firebaseUid = 'firebase-uid-abc';
  const numericUserId = 42;
  const customer = { customerId: 'cust_123', companyName: 'Acme Corp' };

  beforeEach(() => {
    mockPrisma = {
      customer: { findMany: jest.fn() },
      user: { findFirst: jest.fn() },
    };
    mockCustomersService = { deactivate: jest.fn() };
    tool = new CustomerDeactivateTool(mockPrisma as any, mockCustomersService as any);

    // Default: user found
    mockPrisma.user.findFirst.mockResolvedValue({ id: numericUserId });
    // Default: single customer found
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    // Default: deactivate succeeds
    mockCustomersService.deactivate.mockResolvedValue({
      customerId: customer.customerId,
      companyName: customer.companyName,
    });
  });

  it('returns error when _tenantId is missing', async () => {
    const result = await tool.deactivateCustomer({
      customerName: 'Acme',
      reason: 'They went out of business',
      _tenantId: undefined,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockCustomersService.deactivate).not.toHaveBeenCalled();
  });

  it('returns error when _userId is missing', async () => {
    const result = await tool.deactivateCustomer({
      customerName: 'Acme',
      reason: 'They went out of business',
      _tenantId: tenantId,
      _userId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockCustomersService.deactivate).not.toHaveBeenCalled();
  });

  it('returns error when customer not found', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);
    const result = await tool.deactivateCustomer({
      customerName: 'Nonexistent Co',
      reason: 'Testing not found',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/no customer found/i);
    expect(mockCustomersService.deactivate).not.toHaveBeenCalled();
  });

  it('returns disambiguation error when multiple customers match', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([
      { customerId: 'c1', companyName: 'Acme Corp' },
      { customerId: 'c2', companyName: 'Acme Logistics' },
    ]);
    const result = await tool.deactivateCustomer({
      customerName: 'Acme',
      reason: 'Testing disambiguation',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/multiple/i);
    expect(mockCustomersService.deactivate).not.toHaveBeenCalled();
  });

  it('happy path — calls service with correct args and returns success shape', async () => {
    const result = await tool.deactivateCustomer({
      customerName: 'Acme Corp',
      reason: 'They went out of business permanently',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.customerId).toBe(customer.customerId);
    expect(parsed.companyName).toBe(customer.companyName);
    expect(parsed.message).toContain(customer.companyName);
    expect(mockCustomersService.deactivate).toHaveBeenCalledWith(
      customer.customerId,
      tenantId,
      numericUserId,
      'They went out of business permanently',
    );
  });

  it('surfaces ConflictException from service as user-friendly error', async () => {
    mockCustomersService.deactivate.mockRejectedValue(
      new ConflictException({
        message: 'Cannot deactivate customer. Customer has 2 active load(s)',
      }),
    );
    const result = await tool.deactivateCustomer({
      customerName: 'Acme Corp',
      reason: 'Testing conflict pass-through',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/active load/i);
  });
});
