import { Injectable, NotImplementedException } from '@nestjs/common';
import { ITrafficProvider, TrafficIncident, TrafficSegment } from '../traffic-provider.interface';
import { Waypoint } from '../../shared/types';

@Injectable()
export class HereTrafficProvider implements ITrafficProvider {
  getTrafficFlow(_waypoints: Waypoint[]): Promise<TrafficSegment[]> {
    return Promise.reject(new NotImplementedException('HERE Traffic integration coming in Phase 2'));
  }

  getIncidents(_latitude: number, _longitude: number, _radiusMiles: number): Promise<TrafficIncident[]> {
    return Promise.reject(new NotImplementedException('HERE Traffic integration coming in Phase 2'));
  }
}
