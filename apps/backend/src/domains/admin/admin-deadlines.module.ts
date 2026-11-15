import { Module } from '@nestjs/common';
import { PrismaModule } from '@appshore/platform/infrastructure/database/prisma.module';
import { DeadlinesModule } from '@appshore/platform/infrastructure/deadlines/deadlines.module';
import { AdminDeadlinesController } from './admin-deadlines.controller';
import { OUTBOX_HEALTH_READER, PrismaOutboxHealthReader } from './outbox-health.reader';
import { OpsBacklogGaugesReporter } from './ops-backlog-gauges.reporter';

/**
 * The super-admin Timers routes: every tenant's deadlines and the outbox backlog beside them. The same two readings
 * feed the backlog gauges the alert rules watch (`OpsBacklogGaugesReporter`).
 */
@Module({
  imports: [PrismaModule, DeadlinesModule],
  controllers: [AdminDeadlinesController],
  providers: [{ provide: OUTBOX_HEALTH_READER, useClass: PrismaOutboxHealthReader }, OpsBacklogGaugesReporter],
})
export class AdminDeadlinesModule {}
