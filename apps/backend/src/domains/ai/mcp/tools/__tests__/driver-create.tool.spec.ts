import { DriverCreateTool } from '../fleet/driver-create.tool';

describe('DriverCreateTool', () => {
  let tool: DriverCreateTool;
  let mockDriversService: { create: jest.Mock };

  beforeEach(() => {
    mockDriversService = {
      create: jest.fn().mockResolvedValue({
        driverId: 'DRV-ABC123',
        name: 'Jane Doe',
        status: 'ACTIVE',
      }),
    };
    tool = new DriverCreateTool(mockDriversService as any);
  });

  it('returns error when tenant context missing', async () => {
    const result = await tool.createDriver({
      name: 'Jane Doe',
      phone: '555-1234',
      cdlClass: 'A',
      licenseNumber: 'TX-123456',
      _tenantId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockDriversService.create).not.toHaveBeenCalled();
  });

  it('happy path — minimal required fields', async () => {
    const result = await tool.createDriver({
      name: 'Jane Doe',
      phone: '555-1234',
      cdlClass: 'A',
      licenseNumber: 'TX-123456',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.driverId).toBe('DRV-ABC123');
    expect(parsed.name).toBe('Jane Doe');
    expect(parsed.status).toBe('ACTIVE');
    expect(mockDriversService.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'Jane Doe',
        phone: '555-1234',
        cdlClass: 'A',
        licenseNumber: 'TX-123456',
      }),
    );
    // Internal fields must not be forwarded to the service
    const callArgs = mockDriversService.create.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('_tenantId');
    expect(callArgs).not.toHaveProperty('_userId');
  });

  it('happy path — all optional fields forwarded', async () => {
    const result = await tool.createDriver({
      name: 'John Smith',
      phone: '555-9999',
      email: 'john@example.com',
      cdlClass: 'B',
      licenseNumber: 'CA-987654',
      licenseState: 'CA',
      endorsements: ['HAZMAT', 'TANKER'],
      hireDate: '2026-01-15',
      medicalCardExpiry: '2027-06-30',
      homeTerminalCity: 'Austin',
      homeTerminalState: 'TX',
      emergencyContactName: 'Mary Smith',
      emergencyContactPhone: '555-0001',
      notes: 'Prefers night shifts',
      _tenantId: 1,
      _userId: 'user-xyz',
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(mockDriversService.create).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        name: 'John Smith',
        phone: '555-9999',
        email: 'john@example.com',
        cdlClass: 'B',
        licenseNumber: 'CA-987654',
        licenseState: 'CA',
        endorsements: ['HAZMAT', 'TANKER'],
        hireDate: '2026-01-15',
        medicalCardExpiry: '2027-06-30',
        homeTerminalCity: 'Austin',
        homeTerminalState: 'TX',
        emergencyContactName: 'Mary Smith',
        emergencyContactPhone: '555-0001',
        notes: 'Prefers night shifts',
      }),
    );
    const callArgs = mockDriversService.create.mock.calls[0][1];
    expect(callArgs).not.toHaveProperty('_tenantId');
    expect(callArgs).not.toHaveProperty('_userId');
  });

  it('surfaces service errors as user-friendly message', async () => {
    mockDriversService.create.mockRejectedValue(new Error('Driver with license TX-123456 already exists'));
    const result = await tool.createDriver({
      name: 'Jane Doe',
      phone: '555-1234',
      cdlClass: 'A',
      licenseNumber: 'TX-123456',
      _tenantId: 1,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/TX-123456/);
  });
});
