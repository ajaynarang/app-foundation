import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module';
import { DeadlineHandlerRegistry } from './deadline-handler.registry';
import { DeadlineService } from './deadline.service';
import { DeadlineSweeper } from './deadline.sweeper';
import { DeadlineSweepScheduler } from './deadline-sweep.scheduler';
import { DEADLINE_HANDLERS } from './deadline.types';

/**
 * Timers as rows (ADR "Outbox and deadlines"): `DeadlineService` to schedule / cancel / read, the handler registry
 * (`DEADLINE_HANDLERS`) app modules register their kinds with, the sweeper (a `bulk-ops`
 * QueueJobHandler — the app's bulk-ops dispatcher module lists it) and its repeatable tick.
 * The tick needs the app's global QueueModule (the `bulk-ops` queue).
 */
@Module({
  imports: [PrismaModule],
  providers: [
    DeadlineHandlerRegistry,
    { provide: DEADLINE_HANDLERS, useExisting: DeadlineHandlerRegistry },
    DeadlineService,
    DeadlineSweeper,
    DeadlineSweepScheduler,
  ],
  exports: [DEADLINE_HANDLERS, DeadlineHandlerRegistry, DeadlineService, DeadlineSweeper],
})
export class DeadlinesModule {}
