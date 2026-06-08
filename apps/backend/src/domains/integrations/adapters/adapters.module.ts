import { Module } from '@nestjs/common';
import { SamsaraELDAdapter } from './eld/samsara-eld.adapter';
import { McLeodTMSAdapter } from './tms/mcleod-tms.adapter';
import { Project44TMSAdapter } from './tms/project44-tms.adapter';
import { AdapterFactoryService } from './adapter-factory.service';
import { QuickBooksApiClient } from '../accounting/vendors/quickbooks/quickbooks-api.client';
import { QuickBooksAdapter } from '../accounting/vendors/quickbooks/quickbooks.adapter';
import { DATLoadBoardAdapter } from '../load-board/adapters/dat/dat-load-board.adapter';

/**
 * AdaptersModule provides all external system adapters
 *
 * This module exists to avoid circular dependencies between
 * IntegrationsModule and SyncModule. Both can import this module
 * to access adapters without creating a cycle.
 *
 * Note: Weather and fuel price adapters have been removed.
 * These are now platform services managed centrally by SALLY
 * (see platform-services domain).
 */
@Module({
  providers: [
    // Adapters
    SamsaraELDAdapter,
    McLeodTMSAdapter,
    Project44TMSAdapter,
    // Accounting adapters
    QuickBooksApiClient,
    QuickBooksAdapter,
    // Load board adapters
    DATLoadBoardAdapter,
    // Factory
    AdapterFactoryService,
  ],
  exports: [
    // Export adapters for use by other modules
    SamsaraELDAdapter,
    McLeodTMSAdapter,
    Project44TMSAdapter,
    // Export accounting adapters
    QuickBooksApiClient,
    QuickBooksAdapter,
    // Export load board adapters
    DATLoadBoardAdapter,
    // Export factory
    AdapterFactoryService,
  ],
})
export class AdaptersModule {}
