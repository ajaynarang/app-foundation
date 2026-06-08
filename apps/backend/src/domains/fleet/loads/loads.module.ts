import { Module, forwardRef } from '@nestjs/common';
import { EventBusModule } from '../../../infrastructure/events/event-bus.module';
import { LoadsController } from './controllers/loads.controller';
import { LoadMessagesController } from './controllers/load-messages.controller';
import { TrackingController } from './controllers/tracking.controller';
import { CustomerLoadsController } from './controllers/customer-loads.controller';
import { MoneyCodesController } from './controllers/money-codes.controller';
import { DriverActionsController } from './controllers/driver-actions.controller';
import { LoadsService } from './services/loads.service';
import { LoadEventsService } from './services/load-events.service';
import { LoadChargesService } from './services/load-charges.service';
import { LoadNotesService } from './services/load-notes.service';
import { LoadReversalService } from './services/load-reversal.service';
import { LoadLegService } from './services/load-leg.service';
import { LoadTrackingService } from './services/load-tracking.service';
import { LoadShareLinkService } from './services/load-share-link.service';
import { CustomerLoadService } from './services/customer-load.service';
import { LoadQueryService } from './services/load-query.service';
import { StopGeocodingService } from './services/stop-geocoding.service';
import { LoadCreationService } from './services/load-creation.service';
import { LoadDraftService } from './services/load-draft.service';
import { LoadStatusService } from './services/load-status.service';
import { LoadAssignmentService } from './services/load-assignment.service';
import { StopStatusService } from './services/stop-status.service';
import { DriverRecommendationService } from './services/driver-recommendation.service';
import { MoneyCodeService } from './services/money-code.service';
import { DriverActionsService } from './services/driver-actions.service';
import { DispatchSheetPdfService } from './services/dispatch-sheet-pdf.service';
import { DispatchSheetEmailService } from './services/dispatch-sheet-email.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { PushModule } from '../../../infrastructure/push/push.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { GeocodingModule } from '../../platform-services/geocoding/geocoding.module';
import { StopsModule } from '../stops/stops.module';
import { LoadMileageModule } from '../../routing/load-mileage/load-mileage.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { RoutePlanningModule } from '../../routing/route-planning/route-planning.module';
import { AlertsModule } from '../../operations/alerts/alerts.module';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { DriversModule } from '../drivers/drivers.module';

/**
 * LoadsModule encapsulates all load-related functionality.
 * Part of the Fleet domain.
 *
 * IntegrationDataService is injected directly (via forwardRef) to avoid
 * a circular module dependency: LoadsModule → IntegrationsModule → ... → McpToolsModule → InvoicingModule → LoadsModule.
 */
@Module({
  imports: [
    PrismaModule,
    EventBusModule,
    PushModule,
    CacheModule,
    GeocodingModule,
    StopsModule,
    LoadMileageModule,
    forwardRef(() => IntegrationsModule),
    forwardRef(() => RoutePlanningModule),
    forwardRef(() => AlertsModule),
    CustomFieldsModule,
    // forwardRef — DriversModule pulls in IntegrationsModule which cycles back here.
    forwardRef(() => DriversModule),
  ],
  controllers: [
    LoadsController,
    LoadMessagesController,
    TrackingController,
    CustomerLoadsController,
    MoneyCodesController,
    DriverActionsController,
  ],
  providers: [
    LoadsService,
    LoadEventsService,
    LoadChargesService,
    LoadNotesService,
    LoadReversalService,
    LoadLegService,
    LoadTrackingService,
    LoadShareLinkService,
    CustomerLoadService,
    LoadQueryService,
    StopGeocodingService,
    LoadCreationService,
    LoadDraftService,
    LoadStatusService,
    LoadAssignmentService,
    StopStatusService,
    DriverRecommendationService,
    MoneyCodeService,
    DriverActionsService,
    DispatchSheetPdfService,
    DispatchSheetEmailService,
  ],
  exports: [
    LoadsService,
    LoadEventsService,
    LoadNotesService,
    LoadReversalService,
    LoadLegService,
    DriverRecommendationService,
    MoneyCodeService,
    DriverActionsService,
  ],
})
export class LoadsModule {}
