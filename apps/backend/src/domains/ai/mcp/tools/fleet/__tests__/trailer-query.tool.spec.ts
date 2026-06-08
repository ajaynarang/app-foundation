import { TrailerQueryTool } from '../trailer-query.tool';

describe('TrailerQueryTool', () => {
  let tool: TrailerQueryTool;
  let mockPrisma: any;

  const TENANT_ID = 1;

  const mockTrailer = {
    trailerId: 'TRL-001',
    unitNumber: 'TR-201',
    equipmentType: 'DRY_VAN',
    status: 'AVAILABLE',
    vin: '1HSHBABN0YH123456',
    licensePlate: 'ABC1234',
    licensePlateState: 'TX',
    make: 'Great Dane',
    model: 'Champion',
    year: 2023,
    lengthFeet: 53,
    maxPayloadLbs: 45000,
    ownershipType: 'OWNED',
    reeferMake: null,
    reeferModel: null,
    reeferSerial: null,
    registrationExpiry: new Date('2026-12-31'),
    insuranceExpiry: new Date('2026-06-30'),
    annualInspectionDate: new Date('2026-03-15'),
    nextMaintenanceDate: new Date('2026-05-01'),
    notes: 'Good condition',
    assignedVehicle: null,
  };

  const mockTrailerWithVehicle = {
    ...mockTrailer,
    trailerId: 'TRL-002',
    unitNumber: 'TR-202',
    status: 'ASSIGNED',
    assignedVehicle: { vehicleId: 'VEH-001', unitNumber: 'T-101' },
  };

  beforeEach(() => {
    mockPrisma = {
      trailer: {
        findMany: jest.fn().mockResolvedValue([mockTrailer]),
        findFirst: jest.fn(),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    tool = new TrailerQueryTool(mockPrisma);
  });

  describe('listTrailers', () => {
    it('should return formatted list scoped by tenantId', async () => {
      const result = await tool.listTrailers({
        limit: 20,
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.totalCount).toBe(1);
      expect(parsed.trailers[0].unitNumber).toBe('TR-201');
      expect(mockPrisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            lifecycleStatus: 'ACTIVE',
          }),
        }),
      );
    });

    it('should filter by status when provided', async () => {
      await tool.listTrailers({
        status: 'AVAILABLE',
        limit: 20,
        _tenantId: TENANT_ID,
      });

      expect(mockPrisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'AVAILABLE',
          }),
        }),
      );
    });

    it('should filter by equipmentType when provided', async () => {
      await tool.listTrailers({
        equipmentType: 'REEFER',
        limit: 20,
        _tenantId: TENANT_ID,
      });

      expect(mockPrisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            equipmentType: 'REEFER',
          }),
        }),
      );
    });

    it('should search by unitNumber when search provided', async () => {
      await tool.listTrailers({
        search: 'TR-2',
        limit: 20,
        _tenantId: TENANT_ID,
      });

      expect(mockPrisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            unitNumber: { contains: 'TR-2', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should respect limit parameter', async () => {
      await tool.listTrailers({
        limit: 5,
        _tenantId: TENANT_ID,
      });

      expect(mockPrisma.trailer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
        }),
      );
    });

    it('should return error without tenant context', async () => {
      const result = await tool.listTrailers({ limit: 20 });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should include _card with trailer_list type', async () => {
      const result = await tool.listTrailers({
        limit: 20,
        _tenantId: TENANT_ID,
      });

      expect((result as any)._card.type).toBe('trailer_list');
      expect((result as any)._card.data.trailers).toHaveLength(1);
    });
  });

  describe('getTrailer', () => {
    it('should find trailer by unitNumber', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([mockTrailer]);

      const result = await tool.getTrailer({
        trailerUnit: 'TR-201',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.unitNumber).toBe('TR-201');
      expect(parsed.equipmentType).toBe('DRY_VAN');
      expect(parsed.registrationExpiry).toBe('2026-12-31');
    });

    it('should fall back to trailerId when no unitNumber match', async () => {
      // First call (unitNumber search) returns empty
      mockPrisma.trailer.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([mockTrailer]);

      const result = await tool.getTrailer({
        trailerUnit: 'TRL-001',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.trailerId).toBe('TRL-001');
      // Verify two calls: first by unitNumber, then by trailerId
      expect(mockPrisma.trailer.findMany).toHaveBeenCalledTimes(2);
    });

    it('should return "not found" message when no match', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([]);

      const result = await tool.getTrailer({
        trailerUnit: 'NONEXISTENT',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No active trailer found');
    });

    it('should return multiple matches message when ambiguous', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([mockTrailer, mockTrailerWithVehicle]);

      const result = await tool.getTrailer({
        trailerUnit: 'TR-20',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.message).toContain('Multiple trailers');
      expect(parsed.matches).toHaveLength(2);
    });

    it('should include assigned vehicle details', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([mockTrailerWithVehicle]);

      const result = await tool.getTrailer({
        trailerUnit: 'TR-202',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.assignedVehicle).toEqual({
        vehicleId: 'VEH-001',
        unitNumber: 'T-101',
      });
    });

    it('should return error without tenant context', async () => {
      const result = await tool.getTrailer({ trailerUnit: 'TR-201' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should include _card with trailer_detail type for single result', async () => {
      mockPrisma.trailer.findMany.mockResolvedValue([mockTrailer]);

      const result = await tool.getTrailer({
        trailerUnit: 'TR-201',
        _tenantId: TENANT_ID,
      });

      expect((result as any)._card.type).toBe('trailer_detail');
    });
  });

  describe('findAvailableTrailer', () => {
    it('should return first available trailer matching equipment type', async () => {
      mockPrisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await tool.findAvailableTrailer({
        equipmentType: 'DRY_VAN',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.trailer.unitNumber).toBe('TR-201');
      expect(parsed.message).toContain('Found available');
      expect(mockPrisma.trailer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenantId: TENANT_ID,
            status: 'AVAILABLE',
            lifecycleStatus: 'ACTIVE',
            equipmentType: 'DRY_VAN',
          }),
        }),
      );
    });

    it('should return "none available" when no match', async () => {
      mockPrisma.trailer.findFirst.mockResolvedValue(null);

      const result = await tool.findAvailableTrailer({
        equipmentType: 'REEFER',
        _tenantId: TENANT_ID,
      });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No available REEFER trailer');
    });

    it('should return error without tenant context', async () => {
      const result = await tool.findAvailableTrailer({
        equipmentType: 'DRY_VAN',
      });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should include _card with trailer_detail type', async () => {
      mockPrisma.trailer.findFirst.mockResolvedValue(mockTrailer);

      const result = await tool.findAvailableTrailer({
        equipmentType: 'DRY_VAN',
        _tenantId: TENANT_ID,
      });

      expect((result as any)._card.type).toBe('trailer_detail');
    });
  });
});
