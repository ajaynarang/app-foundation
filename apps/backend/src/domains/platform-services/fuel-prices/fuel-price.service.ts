import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { IFuelPriceProvider, FuelStation, FuelStationQuery } from './fuel-price-provider.interface';
import { GasBuddyProvider } from './providers/gasbuddy.provider';

@Injectable()
export class FuelPriceService {
  private readonly logger = new Logger(FuelPriceService.name);
  private readonly provider: IFuelPriceProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly gasBuddy: GasBuddyProvider,
  ) {
    this.provider = this.resolveProvider(config.fuelPrices.provider);
  }

  private resolveProvider(name: string): IFuelPriceProvider {
    const providers: Record<string, IFuelPriceProvider> = {
      gasbuddy: this.gasBuddy,
    };
    return providers[name] ?? this.gasBuddy;
  }

  async findStations(query: FuelStationQuery): Promise<FuelStation[]> {
    return this.health.withHealthTracking('fuelPrices', () => this.provider.findStations(query));
  }

  async getStationPrice(stationId: string): Promise<FuelStation> {
    return this.health.withHealthTracking('fuelPrices', () => this.provider.getStationPrice(stationId));
  }
}
