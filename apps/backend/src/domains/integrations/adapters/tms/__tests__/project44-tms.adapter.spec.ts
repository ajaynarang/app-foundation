import { Project44TMSAdapter } from '../project44-tms.adapter';

// Mock the mock.config — MOCK_TMS=false for all tests in this file
jest.mock('../../../../../infrastructure/mock/mock.config', () => ({
  MOCK_TMS: false,
  MOCK_DAT: false,
  isMockModeFor: () => false,
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('Project44TMSAdapter', () => {
  let adapter: Project44TMSAdapter;

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new Project44TMSAdapter();
  });

  // --------------------------------------------------------------------------
  // testConnection
  // --------------------------------------------------------------------------

  describe('testConnection', () => {
    it('should return false if clientId is missing', async () => {
      const result = await adapter.testConnection('', 'secret');
      expect(result).toBe(false);
    });

    it('should return false if clientSecret is missing', async () => {
      const result = await adapter.testConnection('id', '');
      expect(result).toBe(false);
    });

    it('should return true when OAuth token is obtained', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'tok',
          expires_in: 43200,
        }),
      });

      const result = await adapter.testConnection('id', 'secret');
      expect(result).toBe(true);
    });

    it('should return false when OAuth token request fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
      });

      const result = await adapter.testConnection('id', 'secret');
      expect(result).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // getActiveLoads
  // --------------------------------------------------------------------------

  describe('getActiveLoads', () => {
    it('should throw if credentials not configured', async () => {
      await expect(adapter.getActiveLoads('', 'secret')).rejects.toThrow(
        'project44 integration credentials are not configured',
      );
    });

    it('should fetch and transform loads', async () => {
      // First call = OAuth token, second call = loads API
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                externalLoadNumber: 'P44-001',
                id: 'p44-id',
                customerName: 'Acme',
                weight: 40000,
                commodityType: 'Dry Goods',
                status: 'IN_TRANSIT',
                pickupStopReference: {
                  address: '123 Main',
                  city: 'Dallas',
                  state: 'TX',
                  zip: '75001',
                  latitude: 32.7,
                  longitude: -96.8,
                },
                deliveryStopReference: {
                  address: '456 Elm',
                  city: 'Houston',
                  state: 'TX',
                  zip: '77001',
                  latitude: 29.8,
                  longitude: -95.4,
                },
              },
            ],
          }),
        });

      const loads = await adapter.getActiveLoads('id', 'secret');

      expect(loads).toHaveLength(1);
      expect(loads[0].load_id).toBe('P44-001');
      expect(loads[0].status).toBe('IN_TRANSIT');
      expect(loads[0].data_source).toBe('project44_tms');
      expect(loads[0].total_miles).toBeGreaterThan(0);
    });

    it('should throw when API returns error', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        });

      await expect(adapter.getActiveLoads('id', 'secret')).rejects.toThrow(
        'project44 API request failed — please try again',
      );
    });
  });

  // --------------------------------------------------------------------------
  // getLoad
  // --------------------------------------------------------------------------

  describe('getLoad', () => {
    it('should throw if credentials not configured', async () => {
      await expect(adapter.getLoad('', 'secret', 'load1')).rejects.toThrow(
        'project44 integration credentials are not configured',
      );
    });

    it('should fetch and transform a single load', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            externalLoadNumber: 'LOAD-1',
            customerName: 'Test',
            weight: 10000,
            status: 'DELIVERED',
            pickupStopReference: {
              city: 'A',
              state: 'TX',
              latitude: 30,
              longitude: -95,
            },
            deliveryStopReference: {
              city: 'B',
              state: 'TX',
              latitude: 31,
              longitude: -96,
            },
          }),
        });

      const load = await adapter.getLoad('id', 'secret', 'LOAD-1');

      expect(load.load_id).toBe('LOAD-1');
      expect(load.status).toBe('DELIVERED');
    });
  });

  // --------------------------------------------------------------------------
  // syncAllLoads
  // --------------------------------------------------------------------------

  describe('syncAllLoads', () => {
    it('should return load IDs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                externalLoadNumber: 'L1',
                status: 'ACTIVE',
                pickupStopReference: {},
                deliveryStopReference: {},
              },
              {
                externalLoadNumber: 'L2',
                status: 'ACTIVE',
                pickupStopReference: {},
                deliveryStopReference: {},
              },
            ],
          }),
        });

      const ids = await adapter.syncAllLoads('id', 'secret');
      expect(ids).toEqual(['L1', 'L2']);
    });
  });

  // --------------------------------------------------------------------------
  // getDrivers
  // --------------------------------------------------------------------------

  describe('getDrivers', () => {
    it('should throw if credentials not configured', async () => {
      await expect(adapter.getDrivers('', 'secret')).rejects.toThrow(
        'project44 integration credentials are not configured',
      );
    });

    it('should fetch and transform drivers', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'D1',
                firstName: 'John',
                lastName: 'Smith',
                phone: '+15551234567',
                email: 'john@test.com',
                status: 'ACTIVE',
              },
            ],
          }),
        });

      const drivers = await adapter.getDrivers('id', 'secret');

      expect(drivers).toHaveLength(1);
      expect(drivers[0].driver_id).toBe('D1');
      expect(drivers[0].first_name).toBe('John');
      expect(drivers[0].last_name).toBe('Smith');
      expect(drivers[0].data_source).toBe('project44_tms');
    });
  });

  // --------------------------------------------------------------------------
  // getVehicles
  // --------------------------------------------------------------------------

  describe('getVehicles', () => {
    it('should throw if credentials not configured', async () => {
      await expect(adapter.getVehicles('id', '')).rejects.toThrow(
        'project44 integration credentials are not configured',
      );
    });

    it('should fetch and transform vehicles', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                id: 'V1',
                unitNumber: 'UNIT-1',
                make: 'Freightliner',
                model: 'Cascadia',
                year: 2022,
                vin: 'VIN123',
                licensePlate: 'TX-1234',
                status: 'ACTIVE',
              },
            ],
          }),
        });

      const vehicles = await adapter.getVehicles('id', 'secret');

      expect(vehicles).toHaveLength(1);
      expect(vehicles[0].vehicle_id).toBe('V1');
      expect(vehicles[0].make).toBe('Freightliner');
      expect(vehicles[0].data_source).toBe('project44_tms');
    });
  });

  // --------------------------------------------------------------------------
  // Status mapping
  // --------------------------------------------------------------------------

  describe('status mapping', () => {
    it('should map all known load statuses', async () => {
      const statuses = [
        ['CREATED', 'ASSIGNED'],
        ['ACTIVE', 'ASSIGNED'],
        ['IN_TRANSIT', 'IN_TRANSIT'],
        ['DELIVERED', 'DELIVERED'],
        ['CANCELLED', 'CANCELLED'],
        ['PENDING', 'ASSIGNED'],
        ['UNKNOWN', 'ASSIGNED'], // default
      ];

      for (const [input, expected] of statuses) {
        mockFetch
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'tok', expires_in: 43200 }),
          })
          .mockResolvedValueOnce({
            ok: true,
            json: async () => ({
              data: [
                {
                  externalLoadNumber: `LOAD-${input}`,
                  status: input,
                  pickupStopReference: {},
                  deliveryStopReference: {},
                },
              ],
            }),
          });

        // Reset token cache by creating new adapter each time
        const testAdapter = new Project44TMSAdapter();
        const loads = await testAdapter.getActiveLoads('id', 'secret');
        expect(loads[0].status).toBe(expected);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Token caching
  // --------------------------------------------------------------------------

  describe('token caching', () => {
    it('should reuse cached token within expiry window', async () => {
      // First call creates token
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'cached-tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        })
        // Second call should reuse the token (no additional token fetch)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        });

      await adapter.getActiveLoads('id', 'secret');
      await adapter.getActiveLoads('id', 'secret');

      // Token endpoint called only once
      const tokenCalls = mockFetch.mock.calls.filter((call) => (call[0] as string).includes('oauth2/token'));
      expect(tokenCalls).toHaveLength(1);
    });
  });

  // --------------------------------------------------------------------------
  // calculateDistance
  // --------------------------------------------------------------------------

  describe('distance calculation', () => {
    it('should return 0 if coordinates missing', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ access_token: 'tok', expires_in: 43200 }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [
              {
                externalLoadNumber: 'L1',
                status: 'ACTIVE',
                pickupStopReference: {},
                deliveryStopReference: {},
              },
            ],
          }),
        });

      const loads = await adapter.getActiveLoads('id', 'secret');
      expect(loads[0].total_miles).toBe(0);
    });
  });
});
