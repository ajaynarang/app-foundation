import { Module } from '@nestjs/common';

import { AdminAiSpendModule } from './admin-ai-spend.module';
import { AdminEventsModule } from './admin-events.module';
import { AdminJobsModule } from './admin-jobs.module';

/**
 * AdminModule aggregates the super-admin infra console surfaces:
 * - AdminJobsModule: BullMQ job/queue/schedule/cache inspection + controls
 * - AdminEventsModule: domain-event log browsing
 * - AdminAiSpendModule: per-tenant AI spend reporting
 */
@Module({
  imports: [AdminJobsModule, AdminEventsModule, AdminAiSpendModule],
  exports: [AdminJobsModule, AdminEventsModule, AdminAiSpendModule],
})
export class AdminModule {}
