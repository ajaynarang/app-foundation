import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { IMileageProvider, MileageResult } from './mileage-provider.interface';
import { Waypoint } from '../shared/types';
import { TruckProfile } from '../routing/routing-provider.interface';
import { HereMileageProvider } from './providers/here-mileage.provider';
import { TrimblePcMilerProvider } from './providers/trimble-pcmiler.provider';

@Injectable()
export class MileageService {
  private readonly logger = new Logger(MileageService.name);
  private readonly provider: IMileageProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly hereMileage: HereMileageProvider,
    private readonly trimblePcMiler: TrimblePcMilerProvider,
  ) {
    this.provider = this.resolveProvider(config.mileage.provider);
  }

  private resolveProvider(name: string): IMileageProvider {
    const providers: Record<string, IMileageProvider> = {
      here: this.hereMileage,
      trimble: this.trimblePcMiler,
    };
    return providers[name] ?? this.hereMileage;
  }

  async getRatedMiles(origin: Waypoint, destination: Waypoint): Promise<MileageResult> {
    return this.health.withHealthTracking('mileage', () => this.provider.getRatedMiles(origin, destination));
  }

  async getTruckMiles(origin: Waypoint, destination: Waypoint, profile?: TruckProfile): Promise<MileageResult> {
    return this.health.withHealthTracking('mileage', () => this.provider.getTruckMiles(origin, destination, profile));
  }
}
