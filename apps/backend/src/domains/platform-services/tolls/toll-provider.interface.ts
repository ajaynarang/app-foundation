import { Waypoint } from '../shared/types';

export interface TollPoint {
  name: string;
  location: Waypoint;
  cost_cents: number;
  payment_methods: string[];
}

export interface TollResult {
  total_cost_cents: number;
  currency: string;
  toll_points: TollPoint[];
}

export interface ITollProvider {
  calculateRouteTolls(waypoints: Waypoint[], vehicleClass?: 'CLASS_2' | 'CLASS_3' | 'CLASS_8'): Promise<TollResult>;
}
