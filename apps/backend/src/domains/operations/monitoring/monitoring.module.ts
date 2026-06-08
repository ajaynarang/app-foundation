import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller';
import { LoadMonitoringService } from './services/load-monitoring.service';
import { MonitoringEngineService } from './services/monitoring-engine.service';
import { DataSourceResolverService } from './services/data-source-resolver.service';
import { EtaCalculatorService } from './services/eta-calculator.service';
import { DataSourceRegistry } from './data-sources/data-source.registry';
import { CheckRegistry } from './checks/check.registry';
import { DriverEventService } from './services/driver-event.service';
import { RouteEventService } from './services/route-event.service';
import { AlertsModule } from '../alerts/alerts.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { RoutingProviderModule } from '../../routing/providers/routing/routing-provider.module';

@Module({
  imports: [AlertsModule, IntegrationsModule, CacheModule, RoutingProviderModule],
  controllers: [MonitoringController],
  providers: [
    LoadMonitoringService,
    MonitoringEngineService,
    DataSourceResolverService,
    EtaCalculatorService,
    DataSourceRegistry,
    CheckRegistry,
    RouteEventService,
    DriverEventService,
  ],
  exports: [MonitoringEngineService, RouteEventService, LoadMonitoringService, EtaCalculatorService],
})
export class MonitoringModule {}
