import { Module } from '@nestjs/common';

import { AdminAiSpendModule } from './admin-ai-spend.module';
import { AdminDeadlinesModule } from './admin-deadlines.module';
import { AdminEventsModule } from './admin-events.module';
import { AdminJobsModule } from './admin-jobs.module';

/**
 * AdminModule aggregates the super-admin infra routes:
 * - AdminJobsModule: BullMQ job/queue/schedule/cache inspection + controls
 * - AdminEventsModule: domain-event log browsing
 * - AdminAiSpendModule: per-tenant AI spend reporting
 * - AdminDeadlinesModule: timers (deadlines) across tenants and the durability health strip
 */
@Module({
  imports: [AdminJobsModule, AdminEventsModule, AdminAiSpendModule, AdminDeadlinesModule],
  exports: [AdminJobsModule, AdminEventsModule, AdminAiSpendModule, AdminDeadlinesModule],
})
export class AdminModule {}
