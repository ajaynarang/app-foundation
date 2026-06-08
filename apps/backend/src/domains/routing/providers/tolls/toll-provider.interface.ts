import { SourcedValue } from '@sally/shared-types';
import { LatLon, TruckProfile } from '../routing/routing-provider.interface';

export const TOLL_PROVIDER = 'TOLL_PROVIDER';

/**
 * Estimates the toll cost for a planned route.
 *
 * The result is a {@link SourcedValue} so the planner never presents a fabricated
 * "$0.00" as truth: when no toll feed is connected the provider returns
 * `NOT_AVAILABLE` (value: null) and the UI renders "Tolls: not included" rather
 * than implying the route is toll-free.
 */
export interface TollProvider {
  /**
   * @param waypoints  ordered route points (origin → … → destination)
   * @param truckProfile  axle/weight class drives the toll tariff
   * @returns toll cost in CENTS, tagged with provenance (LIVE / NOT_AVAILABLE)
   */
  estimateRouteToll(waypoints: LatLon[], truckProfile?: TruckProfile): Promise<SourcedValue>;
}
