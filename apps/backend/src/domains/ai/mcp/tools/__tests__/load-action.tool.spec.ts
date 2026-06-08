import { LoadActionTool } from '../../tools/fleet/load-action.tool';

describe('LoadActionTool', () => {
  let tool: LoadActionTool;
  let mockPrisma: any;
  let mockLoadsService: any;
  let mockLoadNotesService: any;

  const mockLoad = {
    id: 1,
    loadNumber: 'L-1045',
    tenantId: 1,
  };
  const mockDriver = { id: 42, driverId: 'DRV-001', name: 'John Smith' };
  const mockVehicle = { id: 10, vehicleId: 'VEH-001', unitNumber: 'T-101' };

  beforeEach(() => {
    mockPrisma = {
      load: {
        findFirst: jest.fn().mockResolvedValue(mockLoad),
        update: jest.fn(),
      },
      driver: { findMany: jest.fn().mockResolvedValue([mockDriver]) },
      vehicle: { findMany: jest.fn().mockResolvedValue([mockVehicle]) },
      user: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
    };

    mockLoadsService = {
      assignLoad: jest.fn().mockResolvedValue(mockLoad),
      updateStatus: jest.fn().mockResolvedValue(mockLoad),
      updateDraft: jest.fn().mockResolvedValue(mockLoad),
      duplicate: jest.fn().mockResolvedValue({
        ...mockLoad,
        id: 2,
        loadNumber: 'L-1046',
      }),
    };

    mockLoadNotesService = {
      addNote: jest.fn().mockResolvedValue({ id: 1 }),
    };

    tool = new LoadActionTool(mockPrisma, mockLoadsService, mockLoadNotesService);
  });

  describe('assignLoad', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John',
        vehicleUnit: 'T-101',
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should assign a load to driver and vehicle', async () => {
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John Smith',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockLoadsService.assignLoad).toHaveBeenCalledWith('L-1045', 'DRV-001', 'VEH-001');
    });

    it('should return error when load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      const result = await tool.assignLoad({
        loadNumber: 'L-9999',
        driverName: 'John',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should handle assign errors', async () => {
      mockLoadsService.assignLoad.mockRejectedValue(new Error('Already assigned'));
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John Smith',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Already assigned');
    });
  });

  describe('updateLoadStatus', () => {
    it('should update load status', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'IN_TRANSIT',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('IN_TRANSIT');
    });

    it('should require reason for on_hold', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'ON_HOLD',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should require reason for cancelled', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'CANCELLED',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should accept reason for tonu', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'TONU',
        reason: 'Driver turned away',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('updateLoadFields', () => {
    it('should update rate (converting to cents)', async () => {
      const result = await tool.updateLoadFields({
        loadNumber: 'L-1045',
        rateDollars: 3200,
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        rateCents: 320000,
      });
    });

    it('should return error when no fields provided', async () => {
      const result = await tool.updateLoadFields({
        loadNumber: 'L-1045',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No fields');
    });

    it('should update multiple fields', async () => {
      const result = await tool.updateLoadFields({
        loadNumber: 'L-1045',
        weightLbs: 42000,
        equipmentType: 'reefer',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe('addLoadNote', () => {
    it('should add a note', async () => {
      const result = await tool.addLoadNote({
        loadNumber: 'L-1045',
        content: 'Shipper closes at 5pm',
        noteType: 'dispatch',
        _tenantId: 1,
        _userId: 'fb_uid',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockLoadNotesService.addNote).toHaveBeenCalled();
    });

    it('should return error without user context', async () => {
      const result = await tool.addLoadNote({
        loadNumber: 'L-1045',
        content: 'Note',
        noteType: 'general',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('User context');
    });
  });

  describe('duplicateLoad', () => {
    it('should duplicate a load', async () => {
      const result = await tool.duplicateLoad({
        loadNumber: 'L-1045',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.newLoadNumber).toBe('L-1046');
    });

    it('should set pickup date on duplicated load', async () => {
      await tool.duplicateLoad({
        loadNumber: 'L-1045',
        pickupDate: '2026-04-15',
        _tenantId: 1,
      });
      expect(mockPrisma.load.update).toHaveBeenCalled();
    });

    it('should handle duplicate errors', async () => {
      mockLoadsService.duplicate.mockRejectedValue(new Error('Cannot duplicate'));
      const result = await tool.duplicateLoad({
        loadNumber: 'L-1045',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Cannot duplicate');
    });

    it('should handle non-Error duplicate errors', async () => {
      mockLoadsService.duplicate.mockRejectedValue('generic failure');
      const result = await tool.duplicateLoad({
        loadNumber: 'L-1045',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toBe('Failed to duplicate load.');
    });

    it('should return error without tenant', async () => {
      const result = await tool.duplicateLoad({ loadNumber: 'L-1045' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });
  });

  describe('updateLoadFields (additional)', () => {
    it('should update equipment type', async () => {
      const result = await tool.updateLoadFields({
        loadNumber: 'L-1045',
        equipmentType: 'flatbed',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        equipmentType: 'flatbed',
      });
    });

    it('should update commodity type', async () => {
      await tool.updateLoadFields({
        loadNumber: 'L-1045',
        commodityType: 'hazmat',
        _tenantId: 1,
      });
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        commodityType: 'hazmat',
      });
    });

    it('should update reference number', async () => {
      await tool.updateLoadFields({
        loadNumber: 'L-1045',
        referenceNumber: 'REF-999',
        _tenantId: 1,
      });
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        referenceNumber: 'REF-999',
      });
    });

    it('should update special requirements', async () => {
      await tool.updateLoadFields({
        loadNumber: 'L-1045',
        specialRequirements: 'Temp-controlled',
        _tenantId: 1,
      });
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        specialRequirements: 'Temp-controlled',
      });
    });

    it('should update custom field values', async () => {
      await tool.updateLoadFields({
        loadNumber: 'L-1045',
        customFieldValues: { priority: 'urgent', tag: 'express' },
        _tenantId: 1,
      });
      expect(mockLoadsService.updateDraft).toHaveBeenCalledWith('L-1045', {
        customFieldValues: { priority: 'urgent', tag: 'express' },
      });
    });

    it('should return error without tenant', async () => {
      const result = await tool.updateLoadFields({
        loadNumber: 'L-1045',
        rateDollars: 1000,
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });
  });

  describe('addLoadNote (additional)', () => {
    it('should return error when user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      const result = await tool.addLoadNote({
        loadNumber: 'L-1045',
        content: 'Test note',
        noteType: 'general',
        _tenantId: 1,
        _userId: 'unknown_uid',
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Could not resolve current user');
    });
  });

  describe('assignLoad (additional)', () => {
    it('should return error when driver not found', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'Nobody',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No driver found');
    });

    it('should return error when vehicle not found', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John Smith',
        vehicleUnit: 'V-999',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('No vehicle found');
    });

    it('should return error when multiple drivers match', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        { id: 1, name: 'John A' },
        { id: 2, name: 'John B' },
      ]);
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('Multiple drivers match');
    });

    it('should handle non-Error assign failures', async () => {
      mockLoadsService.assignLoad.mockRejectedValue('unknown error');
      const result = await tool.assignLoad({
        loadNumber: 'L-1045',
        driverName: 'John Smith',
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toBe('Failed to assign load.');
    });
  });

  describe('updateLoadStatus (additional)', () => {
    it('should return error without tenant', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'IN_TRANSIT',
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should require reason for tonu without reason', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'TONU',
        _tenantId: 1,
      });
      expect(JSON.parse(result.content[0].text).error).toContain('reason is required');
    });

    it('should allow on_hold with reason', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'ON_HOLD',
        reason: 'Shipper delay',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.reason).toBe('Shipper delay');
    });

    it('should update to delivered status', async () => {
      const result = await tool.updateLoadStatus({
        loadNumber: 'L-1045',
        status: 'DELIVERED',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.status).toBe('DELIVERED');
    });
  });
});
