import { Test, TestingModule } from '@nestjs/testing';
import { FuelPriceService } from '../fuel-price.service';
import { GasBuddyProvider } from '../providers/gasbuddy.provider';
import { PlatformServicesConfig } from '../../platform-services.config';
import { PlatformHealthService } from '../../platform-health.service';
import { FuelStation, FuelStationQuery } from '../fuel-price-provider.interface';

describe('FuelPriceService', () => {
  let service: FuelPriceService;
  let gasBuddy: jest.Mocked<GasBuddyProvider>;
  let health: jest.Mocked<PlatformHealthService>;

  const mockStation: FuelStation = {
    station_id: 'gb_station_001',
    name: 'Pilot Travel Center',
    brand: 'Pilot',
    address: 'Exit 45, I-35 South',
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    latitude: 32.7767,
    longitude: -96.797,
    price_per_gallon: 3.45,
    diesel_price: 3.89,
    distance_miles: 2.3,
    amenities: ['truck_parking', 'showers', 'restaurant', 'atm', 'wifi'],
    last_updated: '2026-02-24T00:00:00.000Z',
    data_source: 'mock_gasbuddy',
  };

  beforeEach(async () => {
    const mockGasBuddy = {
      findStations: jest.fn().mockResolvedValue([mockStation]),
      getStationPrice: jest.fn().mockResolvedValue(mockStation),
    };

    const mockHealth: any = {
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordError: jest.fn().mockResolvedValue(undefined),
    };
    mockHealth.withHealthTracking = jest.fn().mockImplementation(async (_service: string, fn: () => Promise<any>) => {
      const start = Date.now();
      try {
        const result = await fn();
        await mockHealth.recordSuccess(_service, Date.now() - start);
        return result;
      } catch (error) {
        await mockHealth.recordError(_service, error instanceof Error ? error : new Error(String(error)));
        throw error;
      }
    });

    const mockConfig = {
      fuelPrices: {
        provider: 'gasbuddy',
        apiKey: 'test-key',
        configured: true,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FuelPriceService,
        { provide: GasBuddyProvider, useValue: mockGasBuddy },
        { provide: PlatformHealthService, useValue: mockHealth },
        { provide: PlatformServicesConfig, useValue: mockConfig },
      ],
    }).compile();

    service = module.get(FuelPriceService);
    gasBuddy = module.get(GasBuddyProvider);
    health = module.get(PlatformHealthService);
  });

  describe('findStations', () => {
    it('should return stations from the provider', async () => {
      const query: FuelStationQuery = {
        latitude: 32.7767,
        longitude: -96.797,
      };

      const result = await service.findStations(query);

      expect(result).toEqual([mockStation]);
      expect(gasBuddy.findStations).toHaveBeenCalledWith(query);
    });

    it('should record success on health service', async () => {
      const query: FuelStationQuery = {
        latitude: 32.7767,
        longitude: -96.797,
      };

      await service.findStations(query);

      expect(health.recordSuccess).toHaveBeenCalledWith('fuelPrices', expect.any(Number));
    });

    it('should record error and rethrow on failure', async () => {
      const query: FuelStationQuery = {
        latitude: 32.7767,
        longitude: -96.797,
      };
      const error = new Error('API timeout');
      gasBuddy.findStations.mockRejectedValue(error);

      await expect(service.findStations(query)).rejects.toThrow('API timeout');
      expect(health.recordError).toHaveBeenCalledWith('fuelPrices', error);
    });
  });

  describe('getStationPrice', () => {
    it('should return a station from the provider', async () => {
      const result = await service.getStationPrice('gb_station_001');

      expect(result).toEqual(mockStation);
      expect(gasBuddy.getStationPrice).toHaveBeenCalledWith('gb_station_001');
    });

    it('should record success on health service', async () => {
      await service.getStationPrice('gb_station_001');

      expect(health.recordSuccess).toHaveBeenCalledWith('fuelPrices', expect.any(Number));
    });

    it('should record error and rethrow on failure', async () => {
      const error = new Error('Station not found');
      gasBuddy.getStationPrice.mockRejectedValue(error);

      await expect(service.getStationPrice('unknown')).rejects.toThrow('Station not found');
      expect(health.recordError).toHaveBeenCalledWith('fuelPrices', error);
    });
  });
});
