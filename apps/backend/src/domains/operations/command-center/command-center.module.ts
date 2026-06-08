import { Module } from '@nestjs/common';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { CommandCenterController } from './command-center.controller';
import { CommandCenterService } from './command-center.service';
import { RouteProgressTrackerService } from '../monitoring/services/route-progress-tracker.service';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { IntegrationsModule } from '../../integrations/integrations.module';
import { OverviewService } from './services/overview.service';
import { MapDataService } from './services/map-data.service';
import { MessageSummaryService } from './services/message-summary.service';
import { ShiftNotesService } from './services/shift-notes.service';
import { SystemHealthService } from './services/system-health.service';
import { ActiveLoadsService } from './services/active-loads.service';
import { RiskScoreService } from './services/risk-score.service';
import { TowerWireService } from './services/tower-wire.service';
import { TowerSseSubscriber } from './services/tower-sse.subscriber';
import { TowerRiskProjectionSubscriber } from './services/tower-risk-projection.subscriber';

@Module({
  imports: [CacheModule, MonitoringModule, IntegrationsModule],
  controllers: [CommandCenterController],
  providers: [
    CommandCenterService,
    RouteProgressTrackerService,
    OverviewService,
    MapDataService,
    MessageSummaryService,
    ShiftNotesService,
    SystemHealthService,
    ActiveLoadsService,
    RiskScoreService,
    TowerWireService,
    TowerSseSubscriber,
    TowerRiskProjectionSubscriber,
  ],
  exports: [CommandCenterService, ActiveLoadsService, RiskScoreService, TowerWireService],
})
export class CommandCenterModule {}
