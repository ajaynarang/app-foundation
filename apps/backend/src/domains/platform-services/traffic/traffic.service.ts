import { Injectable, Logger } from '@nestjs/common';
import { PlatformServicesConfig } from '../platform-services.config';
import { PlatformHealthService } from '../platform-health.service';
import { ITrafficProvider, TrafficIncident, TrafficSegment } from './traffic-provider.interface';
import { Waypoint } from '../shared/types';
import { HereTrafficProvider } from './providers/here-traffic.provider';

@Injectable()
export class TrafficService {
  private readonly logger = new Logger(TrafficService.name);
  private readonly provider: ITrafficProvider;

  constructor(
    private readonly config: PlatformServicesConfig,
    private readonly health: PlatformHealthService,
    private readonly hereTraffic: HereTrafficProvider,
  ) {
    this.provider = this.resolveProvider(config.traffic.provider);
  }

  private resolveProvider(name: string): ITrafficProvider {
    const providers: Record<string, ITrafficProvider> = {
      here: this.hereTraffic,
    };
    return providers[name] ?? this.hereTraffic;
  }

  async getTrafficFlow(waypoints: Waypoint[]): Promise<TrafficSegment[]> {
    return this.health.withHealthTracking('traffic', () => this.provider.getTrafficFlow(waypoints));
  }

  async getIncidents(latitude: number, longitude: number, radiusMiles: number): Promise<TrafficIncident[]> {
    return this.health.withHealthTracking('traffic', () =>
      this.provider.getIncidents(latitude, longitude, radiusMiles),
    );
  }
}
