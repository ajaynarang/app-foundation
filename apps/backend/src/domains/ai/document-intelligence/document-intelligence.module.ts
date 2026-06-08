import { Module, forwardRef } from '@nestjs/common';
import { QueueModule } from '../../../infrastructure/queue/queue.module';
import { FleetModule } from '../../fleet/fleet.module';
import { StorageModule } from '../../../infrastructure/storage/storage.module';
import { RateconController } from './ratecon/ratecon.controller';
import { RateconParserService } from './ratecon/ratecon-parser.service';
import { RateconJobHandler } from './ratecon/ratecon-job.handler';
import { JobsController } from './jobs.controller';
import { FuelReceiptController } from './fuel-receipt/fuel-receipt.controller';
import { FuelReceiptParserService } from './fuel-receipt/fuel-receipt-parser.service';
import { SallyAiModule } from '../sally-ai/sally-ai.module';

/**
 * Document Intelligence Module
 * Handles AI-powered document parsing for various freight document types.
 * Currently supports: Rate Confirmations (PDFs), Fuel Receipts (images)
 * Future: BOL, POD, Invoice parsing
 *
 * Note: Per-feature BullBoard registrations were removed in the Phase 3 queue
 * topology redesign — `QueueModule` now owns the BullBoard registrations for
 * every queue centrally (single source of truth, no scattered duplicates).
 *
 * `RateconJobHandler` owns the `ratecon` job name on the `documents` queue; it
 * contributes itself to the shared handler token that the single
 * `DocumentsQueueProcessor` dispatcher consumes (no per-class BullMQ worker).
 */
@Module({
  imports: [QueueModule, forwardRef(() => FleetModule), StorageModule, SallyAiModule],
  controllers: [RateconController, JobsController, FuelReceiptController],
  providers: [RateconParserService, FuelReceiptParserService, RateconJobHandler],
  exports: [RateconParserService, RateconJobHandler],
})
export class DocumentIntelligenceModule {}
