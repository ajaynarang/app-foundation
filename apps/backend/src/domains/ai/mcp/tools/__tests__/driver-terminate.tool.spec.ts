import { ConflictException } from '@nestjs/common';
import { DriverTerminateTool } from '../fleet/driver-terminate.tool';

describe('DriverTerminateTool', () => {
  let tool: DriverTerminateTool;
  let mockPrisma: { user: { findFirst: jest.Mock } };
  let mockDriversActivationService: { deactivateDriver: jest.Mock };
  let mockResolveDriver: jest.Mock;

  const tenantId = 1;
  const firebaseUid = 'firebase-uid-abc';
  const numericUserId = 42;
  const driver = { driverId: 'drv_001', name: 'John Smith' };

  beforeEach(() => {
    mockPrisma = {
      user: { findFirst: jest.fn() },
    };
    mockDriversActivationService = { deactivateDriver: jest.fn() };
    mockResolveDriver = jest.fn();

    tool = new DriverTerminateTool(mockPrisma as any, mockDriversActivationService as any);
    // Inject resolver spy
    (tool as any).resolver = { resolveDriver: mockResolveDriver };

    // Default: user found
    mockPrisma.user.findFirst.mockResolvedValue({ id: numericUserId });
    // Default: driver found
    mockResolveDriver.mockResolvedValue({ data: driver });
    // Default: deactivateDriver succeeds
    mockDriversActivationService.deactivateDriver.mockResolvedValue({});
  });

  it('returns error when _tenantId is missing', async () => {
    const result = await tool.terminateDriver({
      driverName: 'John Smith',
      reason: 'Driver resigned from position',
      _tenantId: undefined,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockDriversActivationService.deactivateDriver).not.toHaveBeenCalled();
  });

  it('returns error when _userId is missing', async () => {
    const result = await tool.terminateDriver({
      driverName: 'John Smith',
      reason: 'Driver resigned from position',
      _tenantId: tenantId,
      _userId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockDriversActivationService.deactivateDriver).not.toHaveBeenCalled();
  });

  it('returns error when driver not found via resolver', async () => {
    mockResolveDriver.mockResolvedValue({
      error: 'No driver found matching "Unknown Driver".',
    });
    const result = await tool.terminateDriver({
      driverName: 'Unknown Driver',
      reason: 'Testing not found scenario',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/Unknown Driver/);
    expect(mockDriversActivationService.deactivateDriver).not.toHaveBeenCalled();
  });

  it('happy path — deactivateDriver called with (driverId, {id, tenant:{id}}, reason)', async () => {
    const result = await tool.terminateDriver({
      driverName: 'John Smith',
      reason: 'Driver resigned from position voluntarily',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.driverId).toBe(driver.driverId);
    expect(parsed.name).toBe(driver.name);
    expect(parsed.message).toContain(driver.name);
    expect(mockDriversActivationService.deactivateDriver).toHaveBeenCalledWith(
      driver.driverId,
      { id: numericUserId, tenant: { id: tenantId } },
      'Driver resigned from position voluntarily',
    );
  });

  it('surfaces ConflictException (active loads) as user-friendly error', async () => {
    mockDriversActivationService.deactivateDriver.mockRejectedValue(
      new ConflictException({
        message: 'Cannot deactivate driver. Driver has 1 active load(s)',
      }),
    );
    const result = await tool.terminateDriver({
      driverName: 'John Smith',
      reason: 'Testing conflict pass-through error',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/active load/i);
  });
});
