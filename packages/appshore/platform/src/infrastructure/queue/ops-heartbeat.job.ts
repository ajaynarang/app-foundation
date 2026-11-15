import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Job, Queue } from 'bullmq';
import { BULK_OPS_JOB_NAMES, QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { JOB_EVENTS, toLoggableError } from '@appshore/kernel/infrastructure/queue/job-events';
import { getProcessRole } from '@appshore/kernel/shared/utils/process-role';
import { PrismaService } from '../database/prisma.service';
import { applyJobSchedule, type JobScheduleRow } from './job-schedule';

export const OPS_HEARTBEAT_EVERY_MS = 5 * 60 * 1000;
/** The bulk-ops schedules live under `maintenance`, so an admin can pause the beat on the Schedules screen. */
const SCHEDULE_CATEGORY = 'maintenance';

/**
 * A repeatable no-op on `bulk-ops` whose only output is one `ops.heartbeat` log line every five minutes. The line
 * exists only when Redis accepted the repeatable, the scheduler promoted it, and a live consumer ran it, so its
 * absence (the worker-heartbeat-missing rule) catches any of the three breaking. It rides the shared lane on purpose:
 * that is the lane the outbox relay and the deadline sweeper run on, so the beat proves the consumer they depend on.
 * A long job on the lane delays the beat; the rule's fifteen-minute window allows for that.
 *
 * It runs with NO `job_schedules` row, like the outbox relay: it is liveness, not an opt-in chore. A row
 * ('maintenance', 'ops-heartbeat') is honoured on every boot: `isEnabled: false` removes the repeatable (how the
 * level 2 test-fire proves the rule pages when there is no worker to stop), a changed interval re-registers it.
 * It is not wrapped in `CronRun`: its own line is its signal (`cron-run-coverage.spec.ts` lists it).
 */
@Injectable()
export class OpsHeartbeatJobHandler implements QueueJobHandler, OnModuleInit {
  readonly jobNames = [BULK_OPS_JOB_NAMES.OPS_HEARTBEAT];
  private readonly logger = new Logger(OpsHeartbeatJobHandler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private readonly bulkOps: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit(): Promise<void> {
    const jobType = BULK_OPS_JOB_NAMES.OPS_HEARTBEAT;
    try {
      const stored = await this.prisma.jobSchedule.findUnique({
        where: { category_jobType: { category: SCHEDULE_CATEGORY, jobType } },
      });
      const row: JobScheduleRow = stored ?? {
        category: SCHEDULE_CATEGORY,
        jobType,
        scheduleType: 'interval',
        pattern: null,
        intervalMs: OPS_HEARTBEAT_EVERY_MS,
        isEnabled: true,
      };
      const outcome = await applyJobSchedule(this.bulkOps, row);
      if (outcome !== 'unchanged') this.logger.log(`Ops heartbeat ${outcome}`);
    } catch (err) {
      // Liveness must never block boot; the missing beat is itself the alert.
      this.logger.error({ msg: 'Could not register the ops heartbeat', err: toLoggableError(err) });
    }
  }

  run(job: Job): Promise<{ beatAt: string }> {
    const queue = job.queueName ?? QUEUE_NAMES.BULK_OPS;
    this.logger.log({
      msg: `Heartbeat from ${queue}`,
      event: JOB_EVENTS.OPS_HEARTBEAT,
      queue,
      process: getProcessRole(),
    });
    return Promise.resolve({ beatAt: new Date().toISOString() });
  }
}
