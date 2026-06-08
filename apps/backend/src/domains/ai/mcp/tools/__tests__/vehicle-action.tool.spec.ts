import { VehicleActionTool } from '../../tools/fleet/vehicle-action.tool';

describe('VehicleActionTool', () => {
  let tool: VehicleActionTool;
  let mockPrisma: any;
  let mockVehiclesService: any;

  const mockVehicle = {
    id: 1,
    vehicleId: 'VEH-001',
    unitNumber: 'T-101',
    tenantId: 1,
  };
  const mockDriver = { id: 42, driverId: 'DRV-001', name: 'John Smith' };

  beforeEach(() => {
    mockPrisma = {
      vehicle: { findMany: jest.fn().mockResolvedValue([mockVehicle]) },
      driver: { findMany: jest.fn().mockResolvedValue([mockDriver]) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      load: { findFirst: jest.fn() },
    };

    mockVehiclesService = {
      update: jest.fn().mockResolvedValue(mockVehicle),
      deactivate: jest.fn().mockResolvedValue(mockVehicle),
      reactivate: jest.fn().mockResolvedValue(mockVehicle),
      decommission: jest.fn().mockResolvedValue(mockVehicle),
    };

    tool = new VehicleActionTool(mockPrisma, mockVehiclesService);
  });

  describe('updateVehicleFields', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.updateVehicleFields({ vehicleUnit: 'T-101' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return error when vehicle not found', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-999',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return error when no fields provided', async () => {
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No fields');
    });

    it('should update fuel level', async () => {
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-101',
        currentFuelGallons: 50,
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockVehiclesService.update).toHaveBeenCalledWith('VEH-001', 1, {
        currentFuelGallons: 50,
      });
    });

    it('should assign a driver', async () => {
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-101',
        assignedDriverName: 'John Smith',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.updatedFields.assignedDriverId).toBe(42);
    });

    it('should unassign a driver with empty string', async () => {
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-101',
        assignedDriverName: '',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.updatedFields.assignedDriverId).toBeNull();
    });

    it('should handle update errors', async () => {
      mockVehiclesService.update.mockRejectedValue(new Error('DB error'));
      const result = await tool.updateVehicleFields({
        vehicleUnit: 'T-101',
        licensePlate: 'ABC123',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Failed to update');
    });
  });

  describe('updateVehicleStatus', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.updateVehicleStatus({ vehicleUnit: 'T-101' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return error when neither action nor status provided', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Either an action');
    });

    it('should update operational status', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        status: 'in_shop',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('IN_SHOP');
    });

    it('should require reason for deactivate', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'deactivate',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should deactivate with reason', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'deactivate',
        reason: 'Sold',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockVehiclesService.deactivate).toHaveBeenCalled();
    });

    it('should reactivate a vehicle', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'reactivate',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockVehiclesService.reactivate).toHaveBeenCalled();
    });

    it('should decommission with reason', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'decommission',
        reason: 'End of life',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it('should return error when user cannot be resolved', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'reactivate',
        _tenantId: 1,
        _userId: 'bad_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Could not resolve');
    });

    it('should return error when multiple vehicles match', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([mockVehicle, { ...mockVehicle, id: 2, unitNumber: 'T-1010' }]);
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'reactivate',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Multiple vehicles');
    });

    it('should return error when no vehicle found for lifecycle action', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-999',
        action: 'deactivate',
        reason: 'Sold',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No vehicle found');
    });

    it('should require reason for decommission', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'decommission',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should handle status update error', async () => {
      mockVehiclesService.update.mockRejectedValue(new Error('DB failure'));
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        status: 'available',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Failed to update');
    });

    it('should handle lifecycle action error', async () => {
      mockVehiclesService.deactivate.mockRejectedValue(new Error('Cannot deactivate'));
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'deactivate',
        reason: 'Sold',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Failed to deactivate');
    });

    it('should handle missing _userId for lifecycle action', async () => {
      const result = await tool.updateVehicleStatus({
        vehicleUnit: 'T-101',
        action: 'reactivate',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Could not resolve');
    });
  });
});
