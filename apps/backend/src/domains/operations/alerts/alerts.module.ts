import { Module, forwardRef } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertService } from './services/alert.service';
import { AlertStatsService } from './services/alert-stats.service';
import { AlertGroupingService } from './services/alert-grouping.service';
import { EscalationService } from './services/escalation.service';
import { AutoResolutionService } from './services/auto-resolution.service';
import { AlertGenerationService } from './services/alert-generation.service';
import { AlertAnalyticsService } from './services/alert-analytics.service';
import { AlertDigestService } from './services/alert-digest.service';
import { AlertTriggersService } from './services/alert-triggers.service';
import { AlertCacheService } from './services/alert-cache.service';
import { AlertBriefingService } from './services/alert-briefing.service';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { NotificationModule } from '../../../infrastructure/notification/notification.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { SallyAiModule } from '../../ai/sally-ai/sally-ai.module';

@Module({
  imports: [PrismaModule, NotificationModule, CacheModule, forwardRef(() => SallyAiModule)],
  controllers: [AlertsController],
  providers: [
    AlertService,
    AlertStatsService,
    AlertGroupingService,
    EscalationService,
    AutoResolutionService,
    AlertGenerationService,
    AlertAnalyticsService,
    AlertDigestService,
    AlertTriggersService,
    AlertCacheService,
    AlertBriefingService,
  ],
  exports: [
    AlertService,
    AlertStatsService,
    AlertGroupingService,
    EscalationService,
    AutoResolutionService,
    AlertGenerationService,
    AlertAnalyticsService,
    AlertDigestService,
    AlertTriggersService,
    AlertCacheService,
    AlertBriefingService,
  ],
})
export class AlertsModule {}
