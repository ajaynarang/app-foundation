import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaModule } from '../../../infrastructure/database/prisma.module';
import { CacheModule } from '../../../infrastructure/cache/cache.module';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { AdaptersModule } from '../adapters/adapters.module';
import { OAuthModule } from '../oauth/oauth.module';
import { FleetModule } from '../../fleet/fleet.module';
import { SallyAiModule } from '../../ai/sally-ai/sally-ai.module';
import { QUEUE_NAMES, VENDOR_DATA_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { LoadBoardController } from './load-board.controller';
import { LoadBoardService } from './load-board.service';
import { LoadBoardRecommendationsService } from './recommendations/load-board-recommendations.service';
import { SavedSearchService } from './saved-search/saved-search.service';
import { SavedSearchJobHandler } from './saved-search/saved-search.processor';
import { SearchQueryParser } from './nlp/search-query-parser';
import { LaneRateService } from './services/lane-rate.service';
import { SearchHistoryService } from './services/search-history.service';

@Module({
  imports: [PrismaModule, CacheModule, AdaptersModule, OAuthModule, FleetModule, SallyAiModule, QueueModule],
  controllers: [LoadBoardController],
  providers: [
    LoadBoardService,
    LoadBoardRecommendationsService,
    SavedSearchService,
    SavedSearchJobHandler,
    SearchQueryParser,
    LaneRateService,
    SearchHistoryService,
  ],
  exports: [LoadBoardService, SavedSearchService, SavedSearchJobHandler],
})
export class LoadBoardModule implements OnModuleInit {
  private readonly logger = new Logger(LoadBoardModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA)
    private readonly vendorDataQueue: Queue,
  ) {}

  async onModuleInit() {
    // Register repeatable job to poll saved searches every 15 minutes.
    // System-wide cron — tenantId is a synthetic 'system' marker since the
    // sweep iterates over every tenant inside the processor.
    await this.vendorDataQueue.add(
      VENDOR_DATA_JOB_NAMES.LOAD_BOARD_POLL,
      buildJobEnvelope({}, { tenantId: 'system', source: 'cron' }),
      { repeat: { every: 15 * 60_000 } },
    );
    this.logger.log('Registered saved search polling job (every 15 min)');
  }
}
