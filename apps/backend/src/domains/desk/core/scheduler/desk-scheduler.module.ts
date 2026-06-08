import { Module } from '@nestjs/common';

import { PrismaModule } from '../../../../infrastructure/database/prisma.module';
import { DeskTriggerModule } from '../trigger/trigger.module';

import { DeskScheduleController } from './desk-schedule.controller';
import { DeskScheduleService } from './desk-schedule.service';
import { DeskSchedulerService } from './desk-scheduler.service';

/**
 * Desk scheduler module.
 *
 * Phase 3 of the queue-topology redesign removed the dedicated BullMQ
 * `desk-scheduler` queue; Phase 5 wired `DeskSchedulerService.runHeartbeat`
 * to the Inngest cron function `createDeskSchedulerFunction` (every minute,
 * same semantics as the old heartbeat — see desk-scheduler.function.ts). The
 * service is exported so the Inngest handler can resolve it via the `nestApp()`
 * DI bridge, and so manual triggers via `DeskScheduleController` /
 * `TriggerService` keep working.
 *
 * Imports DeskTriggerModule for TriggerService (the responsibility run
 * methods + generic `runByKey`) and PrismaModule for the tenant +
 * responsibility gating queries.
 */
@Module({
  imports: [PrismaModule, DeskTriggerModule],
  controllers: [DeskScheduleController],
  providers: [DeskSchedulerService, DeskScheduleService],
  exports: [DeskSchedulerService],
})
export class DeskSchedulerModule {}
