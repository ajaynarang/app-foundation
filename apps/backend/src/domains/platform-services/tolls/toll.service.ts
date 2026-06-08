import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { ITollProvider, TollResult } from './toll-provider.interface';
import { Waypoint } from '../shared/types';
import { HereTollProvider } from './providers/here-toll.provider';

@Injectable()
export class TollService {
  private readonly logger = new Logger(TollService.name);
  private readonly provider: ITollProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly hereToll: HereTollProvider,
  ) {
    this.provider = this.resolveProvider(config.tolls.provider);
  }

  private resolveProvider(name: string): ITollProvider {
    const providers: Record<string, ITollProvider> = {
      here: this.hereToll,
    };
    return providers[name] ?? this.hereToll;
  }

  async calculateRouteTolls(
    waypoints: Waypoint[],
    vehicleClass?: 'CLASS_2' | 'CLASS_3' | 'CLASS_8',
  ): Promise<TollResult> {
    return this.health.withHealthTracking('tolls', () => this.provider.calculateRouteTolls(waypoints, vehicleClass));
  }
}
