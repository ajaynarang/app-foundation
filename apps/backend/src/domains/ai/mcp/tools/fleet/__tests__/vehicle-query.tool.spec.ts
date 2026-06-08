import { VehicleQueryTool } from '../vehicle-query.tool';

describe('VehicleQueryTool', () => {
  let tool: VehicleQueryTool;
  let mockPrisma: any;

  const mockVehicles = [
    {
      vehicleId: 'VEH-001',
      unitNumber: 'T-101',
      make: 'Freightliner',
      model: 'Cascadia',
      year: 2024,
      vin: '1FUJGLDR8CSXXX',
      equipmentType: 'DRY_VAN',
      status: 'AVAILABLE',
      fuelCapacityGallons: 150,
      currentFuelGallons: 100,
      assignedDriver: { name: 'John Smith' },
      licensePlate: 'ABC123',
      licensePlateState: 'TX',
      telematics: { odometer: 125000 },
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      vehicle: {
        findMany: jest.fn().mockResolvedValue(mockVehicles),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    tool = new VehicleQueryTool(mockPrisma);
  });

  describe('queryVehicles', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.queryVehicles({ limit: 20 });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return vehicles list with card data', async () => {
      const result = await tool.queryVehicles({ limit: 20, _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.totalCount).toBe(1);
      expect(parsed.vehicles[0].unitNumber).toBe('T-101');
      expect(parsed.vehicles[0].assignedDriver).toBe('John Smith');
      expect((result as any)._card.type).toBe('vehicle_list');
    });

    it('should filter by status', async () => {
      await tool.queryVehicles({
        status: 'AVAILABLE',
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'AVAILABLE' }),
        }),
      );
    });

    it('should filter by search term', async () => {
      await tool.queryVehicles({
        search: 'T-101',
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            unitNumber: { contains: 'T-101', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should filter by equipment type', async () => {
      await tool.queryVehicles({
        equipmentType: 'FLATBED',
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.vehicle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ equipmentType: 'FLATBED' }),
        }),
      );
    });

    it('should handle null assignedDriver', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([{ ...mockVehicles[0], assignedDriver: null }]);
      const result = await tool.queryVehicles({ limit: 20, _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.vehicles[0].assignedDriver).toBeNull();
    });
  });

  describe('getVehicleDetail', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getVehicleDetail({ vehicleUnit: 'T-101' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return vehicle detail with card', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([mockVehicles[0]]);
      const result = await tool.getVehicleDetail({
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.unitNumber).toBe('T-101');
      expect(parsed.make).toBe('Freightliner');
      expect(parsed.odometerMiles).toBe(125000);
      expect((result as any)._card.type).toBe('vehicle_detail');
    });

    it('should return error when no vehicle found', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([]);
      const result = await tool.getVehicleDetail({
        vehicleUnit: 'T-999',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No active vehicle');
    });

    it('should return matches when multiple vehicles found', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([
        mockVehicles[0],
        { ...mockVehicles[0], vehicleId: 'VEH-002', unitNumber: 'T-1010' },
      ]);
      const result = await tool.getVehicleDetail({
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('Multiple vehicles');
      expect(parsed.matches).toHaveLength(2);
    });

    it('should handle null telematics and assignedDriver', async () => {
      mockPrisma.vehicle.findMany.mockResolvedValue([{ ...mockVehicles[0], telematics: null, assignedDriver: null }]);
      const result = await tool.getVehicleDetail({
        vehicleUnit: 'T-101',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.odometerMiles).toBeNull();
      expect(parsed.assignedDriver).toBeNull();
    });
  });
});
