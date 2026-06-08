import { Module, forwardRef } from '@nestjs/common';
import { LoadsModule } from '../../fleet/loads/loads.module';
import { ConfigModule } from '@nestjs/config';
import { HOS_CONSTANTS } from '@sally/shared-types';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { HOSComplianceModule } from '../hos-compliance/hos-compliance.module';
import { RoutingProviderModule } from '../providers/routing/routing-provider.module';
import { WeatherProviderModule } from '../providers/weather/weather-provider.module';
import { FuelProviderModule } from '../providers/fuel/fuel-provider.module';
import { TollProviderModule } from '../providers/tolls/toll-provider.module';
import { AdaptersModule } from '../../integrations/adapters/adapters.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { SettingsModule } from '../../platform/settings/settings.module';
import { FuelCardsModule } from '../../platform-services/fuel-cards/fuel-cards.module';
import { GeocodingModule } from '../../platform-services/geocoding/geocoding.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { HOSRuleEngineService } from '../hos-compliance/services/hos-rule-engine.service';
import { RoutePlanningEngineService } from './services/route-planning-engine.service';
import { RoutePlanPersistenceService } from './services/route-plan-persistence.service';
import { RouteSimulator } from './services/route-simulator';
import { GeoJSONService } from './services/geojson.service';
import { RoutePlanProgressService } from './services/route-plan-progress.service';
import { RoutePlanProgressJobHandler } from './jobs/route-plan-progress.processor';
import { RoutePlanFeedbackService } from './services/route-plan-feedback.service';
import { RoutePlanningController } from './controllers/route-planning.controller';

@Module({
  imports: [
    PrismaModule,
    HOSComplianceModule,
    RoutingProviderModule,
    WeatherProviderModule,
    FuelProviderModule,
    TollProviderModule,
    AdaptersModule,
    forwardRef(() => IntegrationsModule),
    SettingsModule,
    FuelCardsModule,
    GeocodingModule,
    ConfigModule,
    forwardRef(() => LoadsModule),
    QueueModule,
  ],
  controllers: [RoutePlanningController],
  providers: [
    {
      provide: RouteSimulator,
      useFactory: (hosEngine: HOSRuleEngineService) => {
        return new RouteSimulator(hosEngine, HOS_CONSTANTS.MIN_REST_HOURS);
      },
      inject: [HOSRuleEngineService],
    },
    RoutePlanningEngineService,
    RoutePlanPersistenceService,
    RoutePlanFeedbackService,
    GeoJSONService,
    RoutePlanProgressService,
    RoutePlanProgressJobHandler,
  ],
  exports: [
    RoutePlanningEngineService,
    RoutePlanPersistenceService,
    GeoJSONService,
    RoutePlanProgressService,
    RoutePlanProgressJobHandler,
  ],
})
export class RoutePlanningModule {}
