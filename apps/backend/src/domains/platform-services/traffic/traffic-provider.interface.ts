import { Waypoint } from '../shared/types';

export interface TrafficIncident {
  type: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface TrafficSegment {
  start: Waypoint;
  end: Waypoint;
  speed_mph: number;
  free_flow_speed_mph: number;
  jam_factor: number; // 0-10
  incidents?: TrafficIncident[];
}

export interface ITrafficProvider {
  getTrafficFlow(waypoints: Waypoint[]): Promise<TrafficSegment[]>;
  getIncidents(latitude: number, longitude: number, radiusMiles: number): Promise<TrafficIncident[]>;
}
