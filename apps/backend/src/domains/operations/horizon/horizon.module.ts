import { Module } from '@nestjs/common';
import { HorizonController } from './horizon.controller';
import { HorizonService } from './horizon.service';
import { DriverUnavailabilityController } from './driver-unavailability/driver-unavailability.controller';
import { DriverUnavailabilityService } from './driver-unavailability/driver-unavailability.service';
import { VehicleUnavailabilityController } from './vehicle-unavailability/vehicle-unavailability.controller';
import { VehicleUnavailabilityService } from './vehicle-unavailability/vehicle-unavailability.service';
import { SallySuggestionsService } from './sally-suggestions/sally-suggestions.service';

@Module({
  controllers: [HorizonController, DriverUnavailabilityController, VehicleUnavailabilityController],
  providers: [HorizonService, DriverUnavailabilityService, VehicleUnavailabilityService, SallySuggestionsService],
  exports: [DriverUnavailabilityService, VehicleUnavailabilityService],
})
export class HorizonModule {}
