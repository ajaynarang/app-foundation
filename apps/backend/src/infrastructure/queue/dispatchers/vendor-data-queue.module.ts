import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../queue.module';
import { QUEUE_NAMES } from '../queue.constants';
import { jobHandlersToken, QueueJobHandler } from '../job-handler.contract';
import { IntegrationsModule } from '../../../domains/integrations/integrations.module';
import { OAuthModule } from '../../../domains/integrations/oauth/oauth.module';
import { LoadBoardModule } from '../../../domains/integrations/load-board/load-board.module';
import { EDIModule } from '../../../domains/integrations/edi/edi.module';
import { RecurringLanesModule } from '../../../domains/fleet/recurring-lanes/recurring-lanes.module';
import { VendorDataJobHandler } from '../../sync/vendor-data.processor';
import { OAuthRefreshJobHandler } from '../../../domains/integrations/oauth/oauth-refresh.processor';
import { SavedSearchJobHandler } from '../../../domains/integrations/load-board/saved-search/saved-search.processor';
import { TenderExpiryJobHandler } from '../../../domains/integrations/edi/tender/tender-expiry.processor';
import { LaneGenerationJobHandler } from '../../../domains/fleet/recurring-lanes/lane-generation.processor';
import { VendorDataQueueProcessor } from './vendor-data-queue.processor';

/**
 * Wires the single `vendor-data` queue dispatcher. Imports the five modules that
 * export the handler classes and assembles them into the queue's handler-array
 * token via an explicit factory.
 */
@Module({
  imports: [
    QueueModule,
    forwardRef(() => IntegrationsModule),
    forwardRef(() => OAuthModule),
    forwardRef(() => LoadBoardModule),
    forwardRef(() => EDIModule),
    forwardRef(() => RecurringLanesModule),
  ],
  providers: [
    VendorDataQueueProcessor,
    {
      provide: jobHandlersToken(QUEUE_NAMES.VENDOR_DATA),
      useFactory: (
        tms: VendorDataJobHandler,
        oauth: OAuthRefreshJobHandler,
        savedSearch: SavedSearchJobHandler,
        tender: TenderExpiryJobHandler,
        lanes: LaneGenerationJobHandler,
      ): QueueJobHandler[] => [tms, oauth, savedSearch, tender, lanes],
      inject: [
        VendorDataJobHandler,
        OAuthRefreshJobHandler,
        SavedSearchJobHandler,
        TenderExpiryJobHandler,
        LaneGenerationJobHandler,
      ],
    },
  ],
})
export class VendorDataQueueModule {}
