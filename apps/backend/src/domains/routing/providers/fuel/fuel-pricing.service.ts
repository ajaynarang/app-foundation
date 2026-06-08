import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from '@sally/shared-types';
import { FuelStop } from './fuel-data-provider.interface';

/**
 * Average discount per gallon by fuel card type (industry standard estimates).
 * These represent typical negotiated fleet card discounts off retail price.
 */
const CARD_DISCOUNTS: Record<string, number> = {
  COMDATA: 0.4,
  EFS: 0.35,
  TCH: 0.3,
  FLEET_ONE: 0.38,
  WEX: 0.32,
};

/** Fallback discount for unknown card types */
const DEFAULT_CARD_DISCOUNT = 0.25;

/** National average diesel retail price (fallback when no live data) */
const DEFAULT_RETAIL_PRICE = 3.89;

export interface FuelPriceResult {
  pricePerGallon: number;
  pricingMethod: 'estimated_card_discount' | 'opis' | 'fuel_card_api';
  /**
   * Provenance so the planner never presents an estimate as a confirmed price:
   * LIVE = a real per-stop price (seeded/feed); ESTIMATED = national-avg minus a
   * card discount. The UI/narrative labels accordingly.
   */
  source: DataSource;
  savings?: number;
  retailPrice?: number;
}

/**
 * Fuel pricing service with entitlement-gated tiers.
 *
 * Tier 1 (default, all plans): Estimated card discount
 * Tier 2 (premium, flag: opis_pricing_enabled): OPIS rack pricing (future)
 * Tier 3 (enterprise, flag: fuel_card_api_enabled): Fuel card API pricing (future)
 */
@Injectable()
export class FuelPricingService {
  private readonly logger = new Logger(FuelPricingService.name);

  /**
   * Get estimated price for a fuel stop based on tenant's fuel card configuration.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- async signature reserved for future live-price lookups
  async getPriceForStop(stop: FuelStop, cardTypes: string[], overrideRetailPrice?: number): Promise<FuelPriceResult> {
    // If the stop already has a real per-stop price (seeded/feed), that's LIVE.
    if (stop.fuelPricePerGallon > 0) {
      return {
        pricePerGallon: stop.fuelPricePerGallon,
        pricingMethod: 'estimated_card_discount',
        source: 'LIVE',
        retailPrice: stop.fuelPricePerGallon,
      };
    }

    return this.estimateCardDiscount(cardTypes, overrideRetailPrice);
  }

  /**
   * Batch price a list of fuel stops.
   */
  async getPricesForStops(stops: FuelStop[], cardTypes: string[]): Promise<Map<string, FuelPriceResult>> {
    const prices = new Map<string, FuelPriceResult>();
    for (const stop of stops) {
      prices.set(stop.stopId, await this.getPriceForStop(stop, cardTypes));
    }
    return prices;
  }

  private estimateCardDiscount(cardTypes: string[], overrideRetailPrice?: number): FuelPriceResult {
    const retailPrice = overrideRetailPrice ?? DEFAULT_RETAIL_PRICE;

    // An override retail price (dispatcher-provided or recent IFTA/import) is a
    // better estimate but still an estimate, not a confirmed per-stop price.
    if (cardTypes.length === 0) {
      return {
        pricePerGallon: retailPrice,
        pricingMethod: 'estimated_card_discount',
        source: 'ESTIMATED',
        retailPrice,
      };
    }

    const bestDiscount = Math.max(...cardTypes.map((c) => CARD_DISCOUNTS[c] ?? DEFAULT_CARD_DISCOUNT));

    return {
      pricePerGallon: retailPrice - bestDiscount,
      pricingMethod: 'estimated_card_discount',
      source: 'ESTIMATED',
      savings: bestDiscount,
      retailPrice,
    };
  }
}
