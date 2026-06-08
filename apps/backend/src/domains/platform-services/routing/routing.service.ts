import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { IRoutingProvider, RouteResult, TruckProfile, Waypoint } from './routing-provider.interface';
import { HereMapsProvider } from './providers/here-maps.provider';

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly provider: IRoutingProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly hereMaps: HereMapsProvider,
  ) {
    this.provider = this.resolveProvider(config.routing.provider);
  }

  private resolveProvider(name: string): IRoutingProvider {
    const providers: Record<string, IRoutingProvider> = {
      here: this.hereMaps,
    };
    return providers[name] ?? this.hereMaps;
  }

  async getRoute(origin: Waypoint, destination: Waypoint, waypoints?: Waypoint[]): Promise<RouteResult> {
    return this.health.withHealthTracking('routing', () => this.provider.getRoute(origin, destination, waypoints));
  }

  async getTruckRoute(
    origin: Waypoint,
    destination: Waypoint,
    waypoints?: Waypoint[],
    profile?: TruckProfile,
  ): Promise<RouteResult> {
    return this.health.withHealthTracking('routing', () =>
      this.provider.getTruckRoute(origin, destination, waypoints, profile),
    );
  }
}
