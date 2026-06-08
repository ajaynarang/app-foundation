import { FuelPricingService } from '../fuel-pricing.service';
import { FuelStop } from '../fuel-data-provider.interface';

const BASE_STOP: Pick<FuelStop, 'city' | 'state' | 'amenities' | 'distanceFromRoute'> = {
  city: 'Dallas',
  state: 'TX',
  amenities: [],
  distanceFromRoute: 0,
};

describe('FuelPricingService', () => {
  let service: FuelPricingService;

  beforeEach(() => {
    service = new FuelPricingService();
  });

  // ─── getPriceForStop ───────────────────────────────────────────────────

  describe('getPriceForStop', () => {
    it('should return stop price when fuelPricePerGallon is set', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Pilot Travel',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 3.75,
        brand: 'Pilot',
        ...BASE_STOP,
      };

      const result = await service.getPriceForStop(stop, ['COMDATA']);

      expect(result.pricePerGallon).toBe(3.75);
      expect(result.pricingMethod).toBe('estimated_card_discount');
      expect(result.source).toBe('LIVE'); // a real per-stop price
      expect(result.retailPrice).toBe(3.75);
    });

    it('should apply card discount when stop has no price', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Pilot Travel',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Pilot',
        ...BASE_STOP,
      };

      const result = await service.getPriceForStop(stop, ['COMDATA']);

      // COMDATA discount = $0.40, default retail = $3.89
      expect(result.pricePerGallon).toBe(3.89 - 0.4);
      expect(result.savings).toBe(0.4);
      expect(result.retailPrice).toBe(3.89);
      expect(result.source).toBe('ESTIMATED'); // national avg − card discount, not a confirmed price
    });

    it('should use retail price when no card types specified', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Local Station',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Local',
        ...BASE_STOP,
      };

      const result = await service.getPriceForStop(stop, []);

      expect(result.pricePerGallon).toBe(3.89); // Default retail
      expect(result.savings).toBeUndefined();
    });

    it('should use the best (highest) discount across multiple card types', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Test',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Test',
        ...BASE_STOP,
      };

      const result = await service.getPriceForStop(stop, [
        'COMDATA', // $0.40
        'EFS', // $0.35
        'TCH', // $0.30
      ]);

      expect(result.savings).toBe(0.4); // Best discount
      expect(result.pricePerGallon).toBe(3.89 - 0.4);
    });

    it('should use default discount for unknown card types', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Test',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Test',
        ...BASE_STOP,
      };

      const result = await service.getPriceForStop(stop, ['UNKNOWN_CARD']);

      expect(result.savings).toBe(0.25); // Default discount
      expect(result.pricePerGallon).toBe(3.89 - 0.25);
    });

    it('should use override retail price when provided', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Test',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Test',
        city: 'Dallas',
        state: 'TX',
        amenities: [],
        distanceFromRoute: 0,
      };

      const result = await service.getPriceForStop(stop, ['COMDATA'], 4.5);

      expect(result.retailPrice).toBe(4.5);
      expect(result.pricePerGallon).toBe(4.5 - 0.4);
    });

    it('should return all known card type discounts correctly', async () => {
      const stop: FuelStop = {
        stopId: 'stop-1',
        name: 'Test',
        lat: 32.78,
        lon: -96.8,
        fuelPricePerGallon: 0,
        brand: 'Test',
        city: 'Dallas',
        state: 'TX',
        amenities: [],
        distanceFromRoute: 0,
      };

      const cardDiscounts: Record<string, number> = {
        COMDATA: 0.4,
        EFS: 0.35,
        TCH: 0.3,
        FLEET_ONE: 0.38,
        WEX: 0.32,
      };

      for (const [card, expectedDiscount] of Object.entries(cardDiscounts)) {
        const result = await service.getPriceForStop(stop, [card]);
        expect(result.savings).toBe(expectedDiscount);
      }
    });
  });

  // ─── getPricesForStops ─────────────────────────────────────────────────

  describe('getPricesForStops', () => {
    it('should return prices for all stops', async () => {
      const stops: FuelStop[] = [
        {
          stopId: 'stop-1',
          name: 'Pilot',
          lat: 32.78,
          lon: -96.8,
          fuelPricePerGallon: 3.75,
          brand: 'Pilot',
          city: 'Dallas',
          state: 'TX',
          amenities: ['restroom', 'food'],
          distanceFromRoute: 0.5,
        },
        {
          stopId: 'stop-2',
          name: 'Loves',
          lat: 33.0,
          lon: -97.0,
          fuelPricePerGallon: 0,
          brand: 'Loves',
          city: 'Fort Worth',
          state: 'TX',
          amenities: ['restroom', 'shower'],
          distanceFromRoute: 1.2,
        },
      ];

      const result = await service.getPricesForStops(stops, ['COMDATA']);

      expect(result.size).toBe(2);
      expect(result.get('stop-1')?.pricePerGallon).toBe(3.75);
      expect(result.get('stop-2')?.pricePerGallon).toBe(3.89 - 0.4);
    });

    it('should return empty map for empty stops array', async () => {
      const result = await service.getPricesForStops([], ['COMDATA']);

      expect(result.size).toBe(0);
    });
  });
});
