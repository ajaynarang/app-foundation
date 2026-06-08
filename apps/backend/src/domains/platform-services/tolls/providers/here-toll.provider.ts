import { Injectable, NotImplementedException } from '@nestjs/common';
import { ITollProvider, TollResult } from '../toll-provider.interface';
import { Waypoint } from '../../shared/types';

@Injectable()
export class HereTollProvider implements ITollProvider {
  calculateRouteTolls(_waypoints: Waypoint[], _vehicleClass?: 'CLASS_2' | 'CLASS_3' | 'CLASS_8'): Promise<TollResult> {
    return Promise.reject(new NotImplementedException('HERE Toll integration coming in Phase 2'));
  }
}
