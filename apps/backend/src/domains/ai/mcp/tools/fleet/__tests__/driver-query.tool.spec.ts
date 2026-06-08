import { DriverQueryTool } from '../driver-query.tool';

describe('DriverQueryTool', () => {
  let tool: DriverQueryTool;
  let mockPrisma: any;

  const mockDrivers = [
    {
      driverId: 'DRV-001',
      name: 'John Smith',
      status: 'ACTIVE',
      phone: '555-1234',
      email: 'john@test.com',
      assignedVehicle: { unitNumber: 'T-101' },
      licenseNumber: 'DL12345',
      licenseState: 'TX',
      cdlClass: 'A',
      endorsements: ['H', 'T'],
      hireDate: new Date('2024-01-15'),
      medicalCardExpiry: new Date('2027-06-15'),
      emergencyContactName: 'Jane Smith',
      emergencyContactPhone: '555-5678',
      notes: 'Reliable driver',
    },
  ];

  beforeEach(() => {
    mockPrisma = {
      driver: {
        findMany: jest.fn().mockResolvedValue(mockDrivers),
      },
    };

    tool = new DriverQueryTool(mockPrisma);
  });

  describe('queryDrivers', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.queryDrivers({ limit: 20 });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return drivers list with card data', async () => {
      const result = await tool.queryDrivers({ limit: 20, _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.drivers[0].name).toBe('John Smith');
      expect(parsed.drivers[0].assignedVehicle).toBe('T-101');
      expect((result as any)._card.type).toBe('driver_list');
    });

    it('should filter by status', async () => {
      await tool.queryDrivers({
        status: 'ACTIVE',
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'ACTIVE' }),
        }),
      );
    });

    it('should filter by search name', async () => {
      await tool.queryDrivers({
        search: 'John',
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'John', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should filter available only drivers', async () => {
      await tool.queryDrivers({
        availableOnly: true,
        limit: 20,
        _tenantId: 1,
      });
      expect(mockPrisma.driver.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            loads: { none: { status: { in: ['ASSIGNED', 'IN_TRANSIT'] } } },
          }),
        }),
      );
    });

    it('should handle null assignedVehicle', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([{ ...mockDrivers[0], assignedVehicle: null }]);
      const result = await tool.queryDrivers({ limit: 20, _tenantId: 1 });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.drivers[0].assignedVehicle).toBeNull();
    });
  });

  describe('getDriverDetail', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getDriverDetail({ driverName: 'John' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return driver detail with card', async () => {
      const result = await tool.getDriverDetail({
        driverName: 'John',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.name).toBe('John Smith');
      expect(parsed.licenseNumber).toBe('DL12345');
      expect((result as any)._card.type).toBe('driver_detail');
    });

    it('should return error when no driver found', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([]);
      const result = await tool.getDriverDetail({
        driverName: 'Nobody',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No driver found');
    });

    it('should return error when multiple drivers match', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([mockDrivers[0], { ...mockDrivers[0], name: 'John Doe' }]);
      const result = await tool.getDriverDetail({
        driverName: 'John',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('Multiple drivers');
      expect(parsed.matches).toBeDefined();
    });

    it('should handle null dates and optional fields', async () => {
      mockPrisma.driver.findMany.mockResolvedValue([
        {
          ...mockDrivers[0],
          hireDate: null,
          medicalCardExpiry: null,
          assignedVehicle: null,
        },
      ]);
      const result = await tool.getDriverDetail({
        driverName: 'John',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.hireDate).toBeNull();
      expect(parsed.medicalCardExpiry).toBeNull();
      expect(parsed.assignedVehicle).toBeNull();
    });
  });
});
