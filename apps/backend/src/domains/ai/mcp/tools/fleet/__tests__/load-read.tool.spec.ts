import { LoadReadTool } from '../load-read.tool';

describe('LoadReadTool', () => {
  let tool: LoadReadTool;
  let mockPrisma: any;

  const mockLoad = {
    loadNumber: 'L-1045',
    status: 'in_transit',
    customerName: 'Acme Corp',
    rateCents: 250000,
    weightLbs: 42000,
    commodityType: 'Paper',
    equipmentType: 'DRY_VAN',
    requiredEquipmentType: "53' Van",
    referenceNumber: 'PO-4521',
    specialRequirements: 'Driver assist unload',
    isRelay: false,
    pickupDate: new Date('2026-03-12T06:00:00Z'),
    deliveryDate: new Date('2026-03-14T18:00:00Z'),
    driver: { name: 'Mike Johnson', driverId: 'DRV-001' },
    vehicle: { unitNumber: 'T-101', vehicleId: 'VEH-001' },
    customer: { companyName: 'Acme Corporation' },
    stops: [
      {
        actionType: 'pickup',
        stop: { name: 'Chicago Warehouse', city: 'Chicago', state: 'IL' },
        sequenceOrder: 1,
        status: 'completed',
      },
      {
        actionType: 'delivery',
        stop: { name: 'Indy DC', city: 'Indianapolis', state: 'IN' },
        sequenceOrder: 2,
        status: 'en_route',
      },
    ],
    legs: [],
    notes: [{ id: 1 }, { id: 2 }],
    trip: null,
  };

  beforeEach(() => {
    mockPrisma = {
      load: {
        findFirst: jest.fn().mockResolvedValue(mockLoad),
      },
      document: {
        count: jest.fn().mockResolvedValue(3),
      },
    };

    tool = new LoadReadTool(mockPrisma);
  });

  describe('getLoadDetail', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getLoadDetail({ loadNumber: 'L-1045' });
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should return full load detail with card', async () => {
      const result = await tool.getLoadDetail({
        loadNumber: 'L-1045',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.loadNumber).toBe('L-1045');
      expect(parsed.rateDollars).toBe('2500.00');
      expect(parsed.customerName).toBe('Acme Corporation');
      expect(parsed.driver).toBe('Mike Johnson');
      expect(parsed.vehicle).toBe('T-101');
      expect(parsed.stops).toHaveLength(2);
      expect(parsed.documentCount).toBe(3);
      expect(parsed.noteCount).toBe(2);
      expect((result as any)._card.type).toBe('load_detail');
    });

    it('should return error when load not found', async () => {
      mockPrisma.load.findFirst.mockResolvedValue(null);
      const result = await tool.getLoadDetail({
        loadNumber: 'MISSING',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('No load found');
    });

    it('should strip L- prefix when searching', async () => {
      await tool.getLoadDetail({ loadNumber: 'L-1045', _tenantId: 1 });
      expect(mockPrisma.load.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                loadNumber: { contains: '1045', mode: 'insensitive' },
              }),
            ]),
          }),
        }),
      );
    });

    it('should include relay legs when isRelay is true', async () => {
      const relayLoad = {
        ...mockLoad,
        isRelay: true,
        legs: [
          {
            legId: 'leg_1',
            sequence: 1,
            status: 'completed',
            driver: { name: 'Driver A', driverId: 'DRV-A' },
            vehicle: { unitNumber: 'T-101', vehicleId: 'VEH-A' },
            actualMiles: 150,
          },
          {
            legId: 'leg_2',
            sequence: 2,
            status: 'in_transit',
            driver: null,
            vehicle: null,
            actualMiles: null,
          },
        ],
      };
      mockPrisma.load.findFirst.mockResolvedValue(relayLoad);

      const result = await tool.getLoadDetail({
        loadNumber: '1045',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.isRelay).toBe(true);
      expect(parsed.legs).toHaveLength(2);
      expect(parsed.legs[0].driver).toBe('Driver A');
      expect(parsed.legs[1].driver).toBe('Unassigned');
    });

    it('should handle null driver and vehicle', async () => {
      const loadNoDriver = {
        ...mockLoad,
        driver: null,
        vehicle: null,
        customer: null,
        rateCents: null,
      };
      mockPrisma.load.findFirst.mockResolvedValue(loadNoDriver);

      const result = await tool.getLoadDetail({
        loadNumber: '1045',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.driver).toBeNull();
      expect(parsed.vehicle).toBeNull();
      expect(parsed.customerName).toBe('Acme Corp');
      expect(parsed.rateDollars).toBeNull();
    });
  });
});
