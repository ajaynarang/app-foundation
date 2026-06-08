import { DriverMgmtActionTool } from '../../tools/fleet/driver-mgmt-action.tool';

describe('DriverMgmtActionTool', () => {
  let tool: DriverMgmtActionTool;
  let mockPrisma: any;
  let mockDriversService: any;

  const mockDriver = {
    id: 42,
    driverId: 'DRV-001',
    name: 'John Smith',
    status: 'ACTIVE',
    notes: '',
  };
  const mockVehicle = { id: 10, vehicleId: 'VEH-001', unitNumber: 'T-101' };

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue([mockDriver]),
        update: jest.fn().mockResolvedValue(mockDriver),
      },
      vehicle: { findMany: jest.fn().mockResolvedValue([mockVehicle]) },
      load: { findFirst: jest.fn() },
    };

    mockDriversService = {
      update: jest.fn().mockResolvedValue(mockDriver),
    };

    tool = new DriverMgmtActionTool(mockPrisma, mockDriversService);
  });

  describe('updateDriverFields', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.updateDriverFields({ driverName: 'John' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return error when no fields provided', async () => {
      const result = await tool.updateDriverFields({
        driverName: 'John',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No fields');
    });

    it('should update phone', async () => {
      const result = await tool.updateDriverFields({
        driverName: 'John Smith',
        phone: '555-1234',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockDriversService.update).toHaveBeenCalledWith('DRV-001', 1, {
        phone: '555-1234',
      });
    });

    it('should resolve and assign vehicle', async () => {
      const result = await tool.updateDriverFields({
        driverName: 'John Smith',
        assignedVehicleUnit: 'T-101',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.updatedFields.assignedVehicleId).toBe(10);
    });

    it('should handle update errors', async () => {
      mockDriversService.update.mockRejectedValue(new Error('DB error'));
      const result = await tool.updateDriverFields({
        driverName: 'John Smith',
        email: 'new@test.com',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Failed to update');
    });
  });

  describe('updateDriverStatus', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.updateDriverStatus({
        driverName: 'John',
        action: 'deactivate',
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should require reason for deactivation', async () => {
      const result = await tool.updateDriverStatus({
        driverName: 'John',
        action: 'deactivate',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should deactivate a driver', async () => {
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'deactivate',
        reason: 'Left company',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.newStatus).toBe('INACTIVE');
      expect(mockPrisma.driver.update).toHaveBeenCalled();
    });

    it('should error when deactivating already inactive driver', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ ...mockDriver, status: 'INACTIVE' }]);
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'deactivate',
        reason: 'Reason',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('already inactive');
    });

    it('should error when activating already active driver', async () => {
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'activate',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('already active');
    });

    it('should reactivate an inactive driver', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ ...mockDriver, status: 'INACTIVE' }]);
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'reactivate',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.newStatus).toBe('ACTIVE');
    });

    it('should handle update error during deactivation', async () => {
      mockPrisma.driver.update.mockRejectedValue(new Error('DB error'));
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'deactivate',
        reason: 'Leaving',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Failed to deactivate');
    });

    it('should include reason in deactivation response', async () => {
      const result = await tool.updateDriverStatus({
        driverName: 'John Smith',
        action: 'deactivate',
        reason: 'Left company',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.reason).toBe('Left company');
    });
  });

  describe('updateDriverFields - additional edge cases', () => {
    it('should update multiple fields at once', async () => {
      const result = await tool.updateDriverFields({
        driverName: 'John Smith',
        phone: '555-1234',
        email: 'new@test.com',
        notes: 'Updated notes',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockDriversService.update).toHaveBeenCalledWith('DRV-001', 1, {
        phone: '555-1234',
        email: 'new@test.com',
        notes: 'Updated notes',
      });
    });

    it('should return error when driver not found', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);
      const result = await tool.updateDriverFields({
        driverName: 'Nobody',
        phone: '555',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No driver found');
    });

    it('should handle custom field values', async () => {
      const result = await tool.updateDriverFields({
        driverName: 'John Smith',
        customFieldValues: { uniform_size: 'XL', badge_number: '1234' },
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });
});
