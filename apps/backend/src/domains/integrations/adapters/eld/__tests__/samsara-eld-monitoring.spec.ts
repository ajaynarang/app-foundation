import { SamsaraELDAdapter } from '../samsara-eld.adapter';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SamsaraELDAdapter - Monitoring Methods', () => {
  let adapter: SamsaraELDAdapter;

  beforeEach(() => {
    adapter = new SamsaraELDAdapter();
    jest.clearAllMocks();
  });

  describe('getHOSClocks', () => {
    it('should fetch and transform HOS clock data from Samsara', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              driver: { id: 'drv-123', name: 'John Doe' },
              currentDutyStatus: { hosStatusType: 'driving' },
              clocks: {
                drive: { driveRemainingDurationMs: 3600000 },
                shift: { shiftRemainingDurationMs: 7200000 },
                cycle: {
                  cycleRemainingDurationMs: 180000000,
                  cycleStartedAtTime: '2026-02-09T00:00:00Z',
                  cycleTomorrowDurationMs: 190000000,
                },
                break: { timeUntilBreakDurationMs: 1800000 },
              },
              violations: {
                cycleViolationDurationMs: 0,
                shiftDrivingViolationDurationMs: 0,
              },
            },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await adapter.getHOSClocks('test-token');

      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.samsara.com/fleet/hos/clocks', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          driverId: 'drv-123',
          driverName: 'John Doe',
          currentDutyStatus: 'driving',
          driveTimeRemainingMs: 3600000,
          shiftTimeRemainingMs: 7200000,
          cycleTimeRemainingMs: 180000000,
          timeUntilBreakMs: 1800000,
        }),
      );
    });

    it('should throw on non-200 response', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Request failed with status code 401'));

      await expect(adapter.getHOSClocks('bad-token')).rejects.toThrow();
    });
  });

  describe('getVehicleLocations', () => {
    it('should fetch and transform GPS data via stats endpoint', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'veh-456',
              name: 'Truck-01',
              externalIds: { 'samsara.vin': '1FUJGHDV9JLJY8062' },
              gps: {
                latitude: 34.0522,
                longitude: -118.2437,
                speedMilesPerHour: 65,
                headingDegrees: 270,
                time: '2026-02-09T12:00:00Z',
              },
            },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await adapter.getVehicleLocations('test-token');

      expect(mockedAxios.get).toHaveBeenCalledWith('https://api.samsara.com/fleet/vehicles/stats?types=gps', {
        headers: { Authorization: 'Bearer test-token' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        vehicleId: 'veh-456',
        vin: '1FUJGHDV9JLJY8062',
        latitude: 34.0522,
        longitude: -118.2437,
        speed: 65,
        heading: 270,
        timestamp: '2026-02-09T12:00:00Z',
      });
    });

    it('should handle missing VIN gracefully', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              id: 'veh-789',
              name: 'Truck-02',
              gps: {
                latitude: 32.77,
                longitude: -96.8,
                speedMilesPerHour: 0,
                headingDegrees: 0,
                time: '2026-02-09T12:00:00Z',
              },
            },
          ],
        },
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await adapter.getVehicleLocations('test-token');

      expect(result[0].vin).toBeUndefined();
    });
  });
});
