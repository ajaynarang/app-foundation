import { SamsaraELDAdapter, SamsaraAuthError } from '../samsara-eld.adapter';
import axios, { AxiosError } from 'axios';

// Partial mock: keep AxiosError real, only mock HTTP methods
jest.mock('axios', () => {
  const actual = jest.requireActual('axios');
  const mockGet = jest.fn();
  const mockAxios = Object.assign(jest.fn(), actual, {
    get: mockGet,
    post: jest.fn(),
  });
  mockAxios.default = mockAxios;
  return mockAxios;
});
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** Helper: create a proper AxiosError with response.status */
function makeAxiosError(status: number, message = 'Error') {
  const error = new AxiosError(message, String(status));
  (error as any).response = { status, data: { message } };
  return error;
}

describe('SamsaraELDAdapter', () => {
  let adapter: SamsaraELDAdapter;

  beforeEach(() => {
    adapter = new SamsaraELDAdapter();
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────
  // getVehicles
  // ────────────────────────────────────────────────────────────────────────

  describe('getVehicles', () => {
    it('should map Samsara vehicles to ELDVehicleData[]', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: '281474996387574',
              name: 'Truck-01',
              vin: '1FUJGHDV9JLJY8062',
              licensePlate: 'TX R70-1836',
              serial: 'G9NP7UVUFS',
              gateway: { serial: 'G9NP-7UV-UFS', model: 'VG55NA' },
              esn: '471928S0565797',
              make: 'Freightliner',
              model: 'Cascadia',
              year: 2021,
              staticAssignedDriver: { id: '53207939' },
              cameraSerial: 'CAM-001',
            },
          ],
        },
      });

      const result = await adapter.getVehicles('test-token');

      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.samsara.com/fleet/vehicles', {
        headers: { Authorization: 'Bearer test-token' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '281474996387574',
        name: 'Truck-01',
        vin: '1FUJGHDV9JLJY8062',
        licensePlate: 'TX R70-1836',
        serial: 'G9NP7UVUFS',
        gateway: { serial: 'G9NP-7UV-UFS', model: 'VG55NA' },
        esn: '471928S0565797',
        make: 'Freightliner',
        model: 'Cascadia',
        year: 2021,
        staticAssignedDriverId: '53207939',
        cameraSerial: 'CAM-001',
      });
    });

    it('should handle empty vehicle list', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { data: [] } });
      const result = await adapter.getVehicles('test-token');
      expect(result).toEqual([]);
    });

    it('should handle vehicles without staticAssignedDriver', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { data: [{ id: '1', name: 'Truck', vin: 'VIN123' }] },
      });
      const result = await adapter.getVehicles('test-token');
      expect(result[0].staticAssignedDriverId).toBeUndefined();
    });

    it('should throw SamsaraAuthError on 401', async () => {
      mockedAxios.get.mockRejectedValueOnce(makeAxiosError(401, 'Unauthorized'));
      await expect(adapter.getVehicles('bad-token')).rejects.toThrow(SamsaraAuthError);
    });

    it('should throw original error on non-401 failure', async () => {
      mockedAxios.get.mockRejectedValueOnce(makeAxiosError(500, 'Server Error'));
      await expect(adapter.getVehicles('test-token')).rejects.toThrow('Server Error');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getDrivers
  // ────────────────────────────────────────────────────────────────────────

  describe('getDrivers', () => {
    it('should map Samsara drivers to ELDDriverData[]', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: '53207939',
              name: 'John Smith',
              username: 'jsmith',
              phone: '+19788856169',
              licenseNumber: 'NHL14227039',
              licenseState: 'NH',
              driverActivationStatus: 'active',
              eldSettings: { rulesets: [{ cycle: 'USA 70 hour / 8 day' }] },
              carrierSettings: { carrierName: 'Test Carrier' },
              tags: [{ id: '1', name: 'Team A' }],
              timezone: 'America/New_York',
            },
          ],
        },
      });

      const result = await adapter.getDrivers('test-token');

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '53207939',
        name: 'John Smith',
        username: 'jsmith',
        phone: '+19788856169',
        licenseNumber: 'NHL14227039',
        licenseState: 'NH',
        driverActivationStatus: 'active',
        eldSettings: { rulesets: [{ cycle: 'USA 70 hour / 8 day' }] },
        carrierSettings: { carrierName: 'Test Carrier' },
        tags: [{ id: '1', name: 'Team A' }],
        timezone: 'America/New_York',
      });
    });

    it('should handle empty driver list', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { data: [] } });
      const result = await adapter.getDrivers('test-token');
      expect(result).toEqual([]);
    });

    it('should throw SamsaraAuthError on 401', async () => {
      mockedAxios.get.mockRejectedValueOnce(makeAxiosError(401, 'Unauthorized'));
      await expect(adapter.getDrivers('bad-token')).rejects.toThrow(SamsaraAuthError);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getHOSClocks
  // ────────────────────────────────────────────────────────────────────────

  describe('getHOSClocks', () => {
    it('should map nested Samsara HOS response correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              driver: { id: '53207939', name: 'John Smith' },
              currentDutyStatus: { hosStatusType: 'driving' },
              clocks: {
                drive: { driveRemainingDurationMs: 36000000 },
                shift: { shiftRemainingDurationMs: 50400000 },
                cycle: { cycleRemainingDurationMs: 252000000 },
                break: { timeUntilBreakDurationMs: 28800000 },
              },
            },
          ],
        },
      });

      const result = await adapter.getHOSClocks('test-token');

      expect(result).toHaveLength(1);
      expect(result[0].driverId).toBe('53207939');
      expect(result[0].driverName).toBe('John Smith');
      expect(result[0].currentDutyStatus).toBe('driving');
      expect(result[0].driveTimeRemainingMs).toBe(36000000);
      expect(result[0].shiftTimeRemainingMs).toBe(50400000);
      expect(result[0].cycleTimeRemainingMs).toBe(252000000);
      expect(result[0].timeUntilBreakMs).toBe(28800000);
    });

    it('should handle missing clock fields with defaults', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [{ driver: { id: '123' }, currentDutyStatus: {}, clocks: {} }],
        },
      });

      const result = await adapter.getHOSClocks('test-token');
      expect(result[0].driverId).toBe('123');
      expect(result[0].driverName).toBe('');
      expect(result[0].currentDutyStatus).toBe('offDuty');
      expect(result[0].driveTimeRemainingMs).toBe(0);
    });

    it('should map all duty status variants', async () => {
      const statuses = [
        { input: 'driving', expected: 'driving' },
        { input: 'onDuty', expected: 'onDuty' },
        { input: 'on_duty', expected: 'onDuty' },
        { input: 'offDuty', expected: 'offDuty' },
        { input: 'off_duty', expected: 'offDuty' },
        { input: 'sleeperBerth', expected: 'sleeperBerth' },
        { input: 'sleeper_berth', expected: 'sleeperBerth' },
        { input: 'unknown_status', expected: 'offDuty' },
      ];

      for (const { input, expected } of statuses) {
        mockedAxios.get.mockResolvedValueOnce({
          data: {
            data: [
              {
                driver: { id: '1' },
                currentDutyStatus: { hosStatusType: input },
                clocks: {},
              },
            ],
          },
        });
        const result = await adapter.getHOSClocks('test-token');
        expect(result[0].currentDutyStatus).toBe(expected);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getVehicleLocations
  // ────────────────────────────────────────────────────────────────────────

  describe('getVehicleLocations', () => {
    it('should map GPS stats response to ELDVehicleLocationData[]', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: '281474996387574',
              name: 'Truck-01',
              gps: {
                latitude: 32.7767,
                longitude: -96.797,
                speedMilesPerHour: 62.5,
                headingDegrees: 180,
                time: '2026-04-06T12:00:00Z',
              },
            },
          ],
        },
      });

      const result = await adapter.getVehicleLocations('test-token');

      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.samsara.com/fleet/vehicles/stats?types=gps', {
        headers: { Authorization: 'Bearer test-token' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].latitude).toBe(32.7767);
      expect(result[0].longitude).toBe(-96.797);
      expect(result[0].speed).toBe(62.5);
    });

    it('should handle missing GPS data with defaults', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { data: [{ id: '1', name: 'Truck' }] },
      });
      const result = await adapter.getVehicleLocations('test-token');
      expect(result[0].latitude).toBe(0);
      expect(result[0].longitude).toBe(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getVehicleStatsFeed (pagination, cursor)
  // ────────────────────────────────────────────────────────────────────────

  describe('getVehicleStatsFeed', () => {
    it('should fetch vehicle stats feed without cursor (initial sync)', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: '123',
              name: 'Truck-1',
              gps: [
                {
                  latitude: 34.05,
                  longitude: -118.25,
                  speedMilesPerHour: 65,
                  headingDegrees: 90,
                  time: '2026-02-18T12:00:00Z',
                },
              ],
              fuelPercents: { value: 72, time: '2026-02-18T12:00:00Z' },
              engineStates: [{ value: 'On', time: '2026-02-18T12:00:00Z' }],
              gpsOdometerMeters: {
                value: 160934,
                time: '2026-02-18T12:00:00Z',
              },
            },
          ],
          pagination: { endCursor: 'cursor-abc', hasNextPage: false },
        },
      });

      const result = await adapter.getVehicleStatsFeed('test-token');
      expect(result.data).toHaveLength(1);
      expect(result.endCursor).toBe('cursor-abc');
    });

    it('should pass cursor as "after" param for incremental sync', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [{ id: '456', name: 'Truck-2' }],
          pagination: { endCursor: 'cursor-def', hasNextPage: false },
        },
      });

      const result = await adapter.getVehicleStatsFeed('test-token', 'cursor-abc');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://api.samsara.com/fleet/vehicles/stats/feed',
        expect.objectContaining({
          params: expect.objectContaining({ after: 'cursor-abc' }),
        }),
      );
      expect(result.endCursor).toBe('cursor-def');
    });

    it('should paginate when hasNextPage is true', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            data: [{ id: '1', name: 'T1' }],
            pagination: { endCursor: 'page1', hasNextPage: true },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: [{ id: '2', name: 'T2' }],
            pagination: { endCursor: 'page2', hasNextPage: false },
          },
        });

      const result = await adapter.getVehicleStatsFeed('test-token');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result.data).toHaveLength(2);
    });

    it('should reset cursor and retry on 400 with stale cursor', async () => {
      const axiosError = Object.assign(new Error('Request failed'), {
        response: { status: 400, data: { message: 'Invalid cursor' } },
      });

      mockedAxios.get.mockRejectedValueOnce(axiosError).mockResolvedValueOnce({
        data: {
          data: [{ id: '1', name: 'T1' }],
          pagination: { endCursor: 'fresh-cursor', hasNextPage: false },
        },
      });

      const result = await adapter.getVehicleStatsFeed('test-token', 'stale-cursor');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result.endCursor).toBe('fresh-cursor');
    });

    it('should throw on 400 without cursor (not a cursor issue)', async () => {
      mockedAxios.get.mockRejectedValueOnce(
        Object.assign(new Error('Request failed'), {
          response: { status: 400, data: { message: 'Bad request' } },
        }),
      );
      await expect(adapter.getVehicleStatsFeed('test-token')).rejects.toThrow('Request failed');
    });

    it('should throw SamsaraAuthError on 401 (not reset cursor)', async () => {
      mockedAxios.get.mockRejectedValueOnce(makeAxiosError(401, 'Unauthorized'));
      await expect(adapter.getVehicleStatsFeed('bad-token', 'some-cursor')).rejects.toThrow(SamsaraAuthError);
    });

    it('should limit cursor resets to 3', async () => {
      mockedAxios.get.mockRejectedValue(
        Object.assign(new Error('Invalid cursor'), {
          response: { status: 400, data: { message: 'Invalid cursor' } },
        }),
      );
      await expect(adapter.getVehicleStatsFeed('test-token', 'stale-cursor')).rejects.toThrow('Invalid cursor');
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // getDVIRs
  // ────────────────────────────────────────────────────────────────────────

  describe('getDVIRs', () => {
    it('should map DVIRs with defects correctly', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          data: [
            {
              id: 'dvir-001',
              vehicle: { id: 'v1', name: 'Truck-01' },
              driver: { id: 'd1', name: 'John' },
              inspectionType: 'pre_trip',
              condition: 'needs_repair',
              defects: [
                {
                  comment: 'Tire worn',
                  severity: 'critical',
                  mechanicsNotes: 'Replace tire',
                },
              ],
              mechanicOrAgentSignature: { signedAt: '2026-04-06T10:00:00Z' },
              startTime: '2026-04-06T08:00:00Z',
            },
          ],
          pagination: { endCursor: '', hasNextPage: false },
        },
      });

      const result = await adapter.getDVIRs('test-token', '2026-04-04T00:00:00Z');
      expect(result).toHaveLength(1);
      expect(result[0].condition).toBe('needs_repair');
      expect(result[0].defects[0].description).toBe('Tire worn');
      expect(result[0].mechanicSignedOff).toBe(true);
    });

    it('should paginate DVIRs', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                id: 'dvir-1',
                vehicle: { id: 'v1' },
                condition: 'satisfactory',
                defects: [],
                startTime: '2026-04-06T08:00:00Z',
              },
            ],
            pagination: { endCursor: 'page1', hasNextPage: true },
          },
        })
        .mockResolvedValueOnce({
          data: {
            data: [
              {
                id: 'dvir-2',
                vehicle: { id: 'v2' },
                condition: 'satisfactory',
                defects: [],
                startTime: '2026-04-06T09:00:00Z',
              },
            ],
            pagination: { endCursor: 'page2', hasNextPage: false },
          },
        });

      const result = await adapter.getDVIRs('test-token', '2026-04-04T00:00:00Z');
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  // testConnection
  // ────────────────────────────────────────────────────────────────────────

  describe('testConnection', () => {
    it('should return true on successful API call', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        status: 200,
        data: { data: [] },
      });
      const result = await adapter.testConnection('valid-token');
      expect(result).toBe(true);
    });

    it('should return false on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
      const result = await adapter.testConnection('bad-token');
      expect(result).toBe(false);
    });
  });
});
