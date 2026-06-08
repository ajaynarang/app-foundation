import { TripActionTool } from '../trip-action.tool';

describe('TripActionTool', () => {
  let tool: TripActionTool;
  let mockTripService: any;

  beforeEach(() => {
    mockTripService = {
      create: jest.fn().mockResolvedValue({
        tripId: 'CNV-20260409-001',
        status: 'DRAFT',
        loadCount: 3,
        totalRevenueCents: 750000,
      }),
      findOne: jest.fn().mockResolvedValue({
        tripId: 'CNV-20260409-001',
        status: 'ASSIGNED',
        loadCount: 3,
        totalRevenueCents: 750000,
      }),
      addLoad: jest.fn().mockResolvedValue({ loadCount: 4 }),
      removeLoad: jest.fn().mockResolvedValue({ loadCount: 2 }),
    };

    tool = new TripActionTool(mockTripService);
  });

  describe('createTrip', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2'],
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });

    it('should return error without user context', async () => {
      const result = await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2'],
        _tenantId: 1,
        _userId: '',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('no user context');
    });

    it('should create trip successfully', async () => {
      const result = await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2', 'LOAD-3'],
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.tripId).toBe('CNV-20260409-001');
      expect(parsed.loadCount).toBe(3);
      expect(parsed.totalRevenueCents).toBe(750000);
      expect(mockTripService.create).toHaveBeenCalledWith(
        1,
        {
          loadIds: ['LOAD-1', 'LOAD-2', 'LOAD-3'],
          driverId: undefined,
          vehicleId: undefined,
        },
        42,
      );
    });

    it('should create trip with driver and vehicle', async () => {
      await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2'],
        driverId: 'drv_1',
        vehicleId: 'veh_1',
        _tenantId: 1,
        _userId: '42',
      });
      expect(mockTripService.create).toHaveBeenCalledWith(
        1,
        {
          loadIds: ['LOAD-1', 'LOAD-2'],
          driverId: 'drv_1',
          vehicleId: 'veh_1',
        },
        42,
      );
    });

    it('should handle service errors', async () => {
      mockTripService.create.mockRejectedValue(new Error('Loads already in trip'));
      const result = await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2'],
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Loads already in trip');
    });

    it('should handle errors without message', async () => {
      mockTripService.create.mockRejectedValue({});
      const result = await tool.createTrip({
        loadIds: ['LOAD-1', 'LOAD-2'],
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Failed to create trip');
    });
  });

  describe('getTripDetail', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.getTripDetail({ tripId: 'CNV-001' });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });

    it('should return trip details with card', async () => {
      const result = await tool.getTripDetail({
        tripId: 'CNV-20260409-001',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tripId).toBe('CNV-20260409-001');
      expect(parsed._card.title).toContain('CNV-20260409-001');
      expect(parsed._card.subtitle).toContain('3 loads');
    });

    it('should handle service errors', async () => {
      mockTripService.findOne.mockRejectedValue(new Error('Trip not found'));
      const result = await tool.getTripDetail({
        tripId: 'CNV-999',
        _tenantId: 1,
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Trip not found');
    });
  });

  describe('addLoadToTrip', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.addLoadToTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });

    it('should return error without user context', async () => {
      const result = await tool.addLoadToTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-1',
        _tenantId: 1,
        _userId: '',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('no user context');
    });

    it('should add load to trip successfully', async () => {
      const result = await tool.addLoadToTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-5',
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('4 loads');
      expect(mockTripService.addLoad).toHaveBeenCalledWith(1, 'CNV-001', 'LOAD-5', 42);
    });

    it('should handle service errors', async () => {
      mockTripService.addLoad.mockRejectedValue(new Error('Max 10 loads'));
      const result = await tool.addLoadToTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-5',
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Max 10 loads');
    });
  });

  describe('removeLoadFromTrip', () => {
    it('should return error without tenant context', async () => {
      const result = await tool.removeLoadFromTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-1',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBeDefined();
    });

    it('should return error without user context', async () => {
      const result = await tool.removeLoadFromTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-1',
        _tenantId: 1,
        _userId: '',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toContain('no user context');
    });

    it('should remove load from trip successfully', async () => {
      const result = await tool.removeLoadFromTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-3',
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.message).toContain('2 loads');
      expect(mockTripService.removeLoad).toHaveBeenCalledWith(1, 'CNV-001', 'LOAD-3', 42);
    });

    it('should handle service errors', async () => {
      mockTripService.removeLoad.mockRejectedValue(new Error('Minimum 2 loads required'));
      const result = await tool.removeLoadFromTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-3',
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Minimum 2 loads required');
    });

    it('should handle errors without message', async () => {
      mockTripService.removeLoad.mockRejectedValue({});
      const result = await tool.removeLoadFromTrip({
        tripId: 'CNV-001',
        loadNumber: 'LOAD-3',
        _tenantId: 1,
        _userId: '42',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('Failed to remove load from trip');
    });
  });
});
