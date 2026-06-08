import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { PlatformServicesConfig } from '../../platform-services.config';
import { IFuelPriceProvider, FuelStation, FuelStationQuery } from '../fuel-price-provider.interface';

/**
 * GasBuddy Provider
 *
 * Implements IFuelPriceProvider for the GasBuddy fuel price API.
 * Currently returns mock data for testing. Real GasBuddy API
 * integration is planned for Phase 2/3.
 *
 * Real GasBuddy API: https://www.gasbuddy.com/business
 */
@Injectable()
export class GasBuddyProvider implements IFuelPriceProvider {
  private readonly logger = new Logger(GasBuddyProvider.name);
  private readonly useMockData = true;

  constructor(private readonly config: PlatformServicesConfig) {}

  /**
   * Find fuel stations near a location
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies IFuelPriceProvider contract
  async findStations(query: FuelStationQuery): Promise<FuelStation[]> {
    if (this.useMockData) {
      return this.getMockStations(query);
    }

    try {
      // TODO: Implement actual GasBuddy API integration
      // const response = await fetch(`${gasBuddyApiUrl}/stations`, {
      //   headers: { 'X-API-Key': apiKey },
      //   body: JSON.stringify(query)
      // });
      throw new InternalServerErrorException('Live fuel price data is not available yet');
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(
        `Failed to fetch fuel stations from GasBuddy: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to fetch fuel stations — please try again');
    }
  }

  /**
   * Get current price for a specific station
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies IFuelPriceProvider contract
  async getStationPrice(stationId: string): Promise<FuelStation> {
    if (this.useMockData) {
      const stations = this.getMockStations({
        latitude: 32.7767,
        longitude: -96.797,
      });
      return stations.find((s) => s.station_id === stationId) || stations[0];
    }

    try {
      // TODO: Implement actual GasBuddy API integration
      throw new InternalServerErrorException('Live fuel price data is not available yet');
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error(
        `Failed to fetch station from GasBuddy: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException('Failed to fetch fuel station data — please try again');
    }
  }

  /**
   * Generate realistic mock fuel station data for testing
   */
  private getMockStations(query: FuelStationQuery): FuelStation[] {
    const baseStations: FuelStation[] = [
      {
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
        last_updated: new Date().toISOString(),
        data_source: 'mock_gasbuddy',
      },
      {
        station_id: 'gb_station_002',
        name: "Love's Travel Stop",
        brand: "Love's",
        address: '1200 Highway 67',
        city: 'Dallas',
        state: 'TX',
        zip: '75202',
        latitude: 32.7555,
        longitude: -96.8089,
        price_per_gallon: 3.42,
        diesel_price: 3.85,
        distance_miles: 3.8,
        amenities: ['truck_parking', 'showers', 'restaurant'],
        last_updated: new Date().toISOString(),
        data_source: 'mock_gasbuddy',
      },
      {
        station_id: 'gb_station_003',
        name: 'Flying J Travel Plaza',
        brand: 'Flying J',
        address: '4500 Interstate 20',
        city: 'Dallas',
        state: 'TX',
        zip: '75203',
        latitude: 32.7481,
        longitude: -96.7958,
        price_per_gallon: 3.48,
        diesel_price: 3.92,
        distance_miles: 4.2,
        amenities: ['truck_parking', 'showers', 'restaurant', 'scales'],
        last_updated: new Date().toISOString(),
        data_source: 'mock_gasbuddy',
      },
      {
        station_id: 'gb_station_004',
        name: 'TA Express',
        brand: 'TravelCenters of America',
        address: '800 Service Road',
        city: 'Dallas',
        state: 'TX',
        zip: '75204',
        latitude: 32.7912,
        longitude: -96.7856,
        price_per_gallon: 3.39,
        diesel_price: 3.82,
        distance_miles: 5.1,
        amenities: ['truck_parking', 'showers', 'restaurant', 'repair'],
        last_updated: new Date().toISOString(),
        data_source: 'mock_gasbuddy',
      },
      {
        station_id: 'gb_station_005',
        name: 'Petro Stopping Center',
        brand: 'Petro',
        address: '2100 Truck Plaza Dr',
        city: 'Dallas',
        state: 'TX',
        zip: '75205',
        latitude: 32.8067,
        longitude: -96.7689,
        price_per_gallon: 3.51,
        diesel_price: 3.95,
        distance_miles: 6.8,
        amenities: ['truck_parking', 'showers', 'restaurant', 'theater'],
        last_updated: new Date().toISOString(),
        data_source: 'mock_gasbuddy',
      },
    ];

    // Filter by radius if specified
    let filteredStations = baseStations;
    if (query.radius_miles) {
      filteredStations = baseStations.filter((s) => (s.distance_miles ?? 0) <= (query.radius_miles ?? 25));
    }

    // Sort by price or distance
    if (query.sort_by === 'PRICE') {
      filteredStations.sort((a, b) => {
        const priceA = query.fuel_type === 'DIESEL' ? (a.diesel_price ?? a.price_per_gallon) : a.price_per_gallon;
        const priceB = query.fuel_type === 'DIESEL' ? (b.diesel_price ?? b.price_per_gallon) : b.price_per_gallon;
        return priceA - priceB;
      });
    } else {
      filteredStations.sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0));
    }

    // Limit results
    const maxResults = query.max_results || 10;
    return filteredStations.slice(0, maxResults);
  }
}
