import { VehicleRetireTool } from '../fleet/vehicle-retire.tool';

describe('VehicleRetireTool', () => {
  let tool: VehicleRetireTool;
  let mockPrisma: { user: { findFirst: jest.Mock } };
  let mockVehiclesService: { decommission: jest.Mock };
  let mockResolveVehicle: jest.Mock;

  const tenantId = 1;
  const firebaseUid = 'firebase-uid-abc';
  const numericUserId = 42;
  const vehicle = { vehicleId: 'veh_101', unitNumber: 'T-101' };

  beforeEach(() => {
    mockPrisma = {
      user: { findFirst: jest.fn() },
    };
    mockVehiclesService = { decommission: jest.fn() };
    mockResolveVehicle = jest.fn();

    tool = new VehicleRetireTool(mockPrisma as any, mockVehiclesService as any);
    // Inject resolver spy
    (tool as any).resolver = { resolveVehicle: mockResolveVehicle };

    // Default: user found
    mockPrisma.user.findFirst.mockResolvedValue({ id: numericUserId });
    // Default: vehicle found
    mockResolveVehicle.mockResolvedValue({ data: vehicle });
    // Default: decommission succeeds
    mockVehiclesService.decommission.mockResolvedValue({});
  });

  it('returns error when _tenantId is missing', async () => {
    const result = await tool.retireVehicle({
      unitNumber: 'T-101',
      reason: 'Truck was totaled in accident',
      _tenantId: undefined,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockVehiclesService.decommission).not.toHaveBeenCalled();
  });

  it('returns error when _userId is missing', async () => {
    const result = await tool.retireVehicle({
      unitNumber: 'T-101',
      reason: 'Truck was totaled in accident',
      _tenantId: tenantId,
      _userId: undefined,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toBeDefined();
    expect(mockVehiclesService.decommission).not.toHaveBeenCalled();
  });

  it('returns error when vehicle not found via resolver', async () => {
    mockResolveVehicle.mockResolvedValue({
      error: 'No vehicle found matching unit "T-999".',
    });
    const result = await tool.retireVehicle({
      unitNumber: 'T-999',
      reason: 'Testing not found',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/T-999/);
    expect(mockVehiclesService.decommission).not.toHaveBeenCalled();
  });

  it('happy path — calls decommission with correct args and returns success shape', async () => {
    const result = await tool.retireVehicle({
      unitNumber: 'T-101',
      reason: 'Truck was totaled in accident on highway',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.vehicleId).toBe(vehicle.vehicleId);
    expect(parsed.unitNumber).toBe(vehicle.unitNumber);
    expect(parsed.message).toContain(vehicle.unitNumber);
    expect(mockVehiclesService.decommission).toHaveBeenCalledWith(
      vehicle.vehicleId,
      tenantId,
      numericUserId,
      'Truck was totaled in accident on highway',
    );
  });

  it('surfaces service error (active loads) as user-friendly error', async () => {
    mockVehiclesService.decommission.mockRejectedValue(new Error('vehicle has active loads assigned'));
    const result = await tool.retireVehicle({
      unitNumber: 'T-101',
      reason: 'Testing error pass-through',
      _tenantId: tenantId,
      _userId: firebaseUid,
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toMatch(/active loads/i);
  });
});
