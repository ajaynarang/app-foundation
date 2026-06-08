import { TrailerActionTool } from '../trailer-action.tool';

describe('TrailerActionTool', () => {
  let tool: TrailerActionTool;
  let mockPrisma: any;
  let mockTrailersService: any;

  const TENANT_ID = 1;

  const mockTrailer = {
    trailerId: 'TRL-001',
    unitNumber: 'TR-201',
    equipmentType: 'DRY_VAN',
    status: 'AVAILABLE',
    tenantId: TENANT_ID,
  };

  const mockVehicle = {
    id: 1,
    vehicleId: 'VEH-001',
    unitNumber: 'T-101',
    tenantId: TENANT_ID,
  };

  beforeEach(() => {
    mockPrisma = {
      trailer: {
        findMany: jest.fn().mockResolvedValue([mockTrailer]),
      },
      vehicle: {
        findMany: jest.fn().mockResolvedValue([mockVehicle]),
      },
    };

    mockTrailersService = {
      assignVehicle: jest.fn().mockResolvedValue(undefined),
      unassignVehicle: jest.fn().mockResolvedValue(undefined),
    };

    tool = new TrailerActionTool(mockPrisma, mockTrailersService);
  });

  describe('assignTrailerToVehicle', () => {
    it('should resolve trailer and vehicle, then call assignVehicle', async () => {
      const result = await tool.assignTrailerToVehicle({
        trailerId: 'TR-201',
        vehicleId: 'T-101',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('TR-201');
      expect(parsed.message).toContain('T-101');
      expect(mockTrailersService.assignVehicle).toHaveBeenCalledWith('TRL-001', TENANT_ID, 1);
    });

    it('should return error when trailer not found', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([]);

      const result = await tool.assignTrailerToVehicle({
        trailerId: 'NONEXISTENT',
        vehicleId: 'T-101',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No active trailer found');
    });

    it('should return error when vehicle not found', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);

      const result = await tool.assignTrailerToVehicle({
        trailerId: 'TR-201',
        vehicleId: 'NONEXISTENT',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No vehicle found');
    });

    it('should return error without tenant context', async () => {
      const result = await tool.assignTrailerToVehicle({
        trailerId: 'TR-201',
        vehicleId: 'T-101',
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should handle service errors gracefully', async () => {
      mockTrailersService.assignVehicle.mockRejectedValue(new Error('Trailer already assigned'));

      const result = await tool.assignTrailerToVehicle({
        trailerId: 'TR-201',
        vehicleId: 'T-101',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Failed to assign');
      expect(parsed.error).toContain('Trailer already assigned');
    });

    it('should return error when multiple trailers match', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([
        mockTrailer,
        { ...mockTrailer, trailerId: 'TRL-002', unitNumber: 'TR-2010' },
      ]);

      const result = await tool.assignTrailerToVehicle({
        trailerId: 'TR-201',
        vehicleId: 'T-101',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Multiple trailers');
    });
  });

  describe('unassignTrailer', () => {
    it('should resolve trailer and call unassignVehicle', async () => {
      const result = await tool.unassignTrailer({
        trailerId: 'TR-201',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('TR-201');
      expect(parsed.message).toContain('unassigned');
      expect(mockTrailersService.unassignVehicle).toHaveBeenCalledWith('TRL-001', TENANT_ID);
    });

    it('should return error when trailer not found', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([]);

      const result = await tool.unassignTrailer({
        trailerId: 'NONEXISTENT',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No active trailer found');
    });

    it('should return error without tenant context', async () => {
      const result = await tool.unassignTrailer({ trailerId: 'TR-201' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should handle service errors gracefully', async () => {
      mockTrailersService.unassignVehicle.mockRejectedValue(new Error('No vehicle assigned'));

      const result = await tool.unassignTrailer({
        trailerId: 'TR-201',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Failed to unassign');
      expect(parsed.error).toContain('No vehicle assigned');
    });
  });
});
