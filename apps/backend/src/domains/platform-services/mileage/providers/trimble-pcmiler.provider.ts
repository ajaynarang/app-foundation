import { Injectable, NotImplementedException } from '@nestjs/common';
import { IMileageProvider, MileageResult } from '../mileage-provider.interface';
import { Waypoint } from '../../shared/types';
import { TruckProfile } from '../../routing/routing-provider.interface';

@Injectable()
export class TrimblePcMilerProvider implements IMileageProvider {
  getRatedMiles(_origin: Waypoint, _destination: Waypoint): Promise<MileageResult> {
    return Promise.reject(new NotImplementedException('Trimble PC*Miler integration coming in Phase 2'));
  }

  getTruckMiles(_origin: Waypoint, _destination: Waypoint, _profile?: TruckProfile): Promise<MileageResult> {
    return Promise.reject(new NotImplementedException('Trimble PC*Miler integration coming in Phase 2'));
  }
}
