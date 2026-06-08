import { Module } from '@nestjs/common';
import { DriversModule } from './drivers/drivers.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { TrailersModule } from './trailers/trailers.module';
import { LoadsModule } from './loads/loads.module';
import { TripModule } from './trips/trip.module';
import { CustomersModule } from './customers/customers.module';
import { DocumentsModule } from './documents/documents.module';
import { RecurringLanesModule } from './recurring-lanes/recurring-lanes.module';
import { StopsModule } from './stops/stops.module';
import { SearchModule } from './search/search.module';
import { LaneIntelligenceModule } from './lane-intelligence/lane-intelligence.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';

/**
 * FleetModule is an aggregate module that combines all fleet-related functionality.
 * It provides a single entry point for the entire fleet domain.
 *
 * Subdomains:
 * - Drivers: Driver management and activation
 * - Vehicles: Vehicle management
 * - Loads: Load and stop management
 * - Customers: Customer management and portal invitations
 * - Documents: Document management and compliance
 * - RecurringLanes: Recurring lane templates and auto-generation
 * - CustomFields: Tenant-defined custom data fields
 */
@Module({
  imports: [
    DriversModule,
    VehiclesModule,
    TrailersModule,
    LoadsModule,
    TripModule,
    CustomersModule,
    DocumentsModule,
    RecurringLanesModule,
    StopsModule,
    SearchModule,
    LaneIntelligenceModule,
    CustomFieldsModule,
  ],
  exports: [
    DriversModule,
    VehiclesModule,
    TrailersModule,
    LoadsModule,
    TripModule,
    CustomersModule,
    DocumentsModule,
    RecurringLanesModule,
    StopsModule,
    SearchModule,
    LaneIntelligenceModule,
    CustomFieldsModule,
  ],
})
export class FleetModule {}
