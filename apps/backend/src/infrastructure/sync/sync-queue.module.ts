import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { PrismaModule } from '../database/prisma.module';
import { QueueModule } from '../queue/queue.module';
import {
  QUEUE_NAMES,
  GEO_COMPUTE_JOB_NAMES,
  SAFETY_DETECT_JOB_NAMES,
  NOTIFICATIONS_JOB_NAMES,
  BULK_OPS_JOB_NAMES,
} from '../queue/queue.constants';
import { buildJobEnvelope } from '../queue/job-envelope.helper';
import { routeIntegrationJob } from './integration-job-router';
import type { IntegrationSyncPayload, SyncJobType } from './sync-job.types';

export { SyncJobType, SyncJobData, SyncResult } from './sync-job.types';

@Module({
  imports: [PrismaModule, QueueModule],
  providers: [],
  exports: [],
})
export class SyncQueueModule implements OnModuleInit {
  private readonly logger = new Logger(SyncQueueModule.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.TELEMETRY)
    private readonly telemetryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA)
    private readonly vendorDataQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT)
    private readonly safetyDetectQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GEO_COMPUTE)
    private readonly geoComputeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.registerRepeatableJobs();
  }

  /**
   * Register BullMQ repeatable jobs for:
   * 1. Integration-scoped jobs (TMS/ELD) — one per active integration per type
   * 2. New system-wide jobs (operations, routing, maintenance/job-cleanup)
   *
   * Note: Other system-wide categories (compliance, lanes, notifications, etc.)
   * are registered by their own domain modules.
   */
  async registerRepeatableJobs(): Promise<void> {
    this.logger.log('Registering repeatable jobs...');

    try {
      let registered = 0;

      registered += await this.registerIntegrationJobs();
      registered += await this.registerOperationsJobs();
      registered += await this.registerRoutingJobs();
      registered += await this.registerMaintenanceJobCleanup();

      this.logger.log(`Registered ${registered} repeatable jobs total`);
    } catch (error) {
      this.logger.error('Failed to register repeatable jobs', error instanceof Error ? error.stack : error);
    }
  }

  private async registerIntegrationJobs(): Promise<number> {
    // Remove existing repeatables on both queues to avoid duplicates on restart.
    // ELD jobs live on `telemetry`; TMS jobs live on `vendor-data` (per the
    // 2026-05-27 queue topology redesign).
    for (const queue of [this.telemetryQueue, this.vendorDataQueue]) {
      const existingRepeatables = await queue.getRepeatableJobs();
      for (const repeatable of existingRepeatables) {
        await queue.removeRepeatableByKey(repeatable.key);
      }
    }

    const integrations = await this.prisma.integrationConfig.findMany({
      where: { isEnabled: true, status: { in: ['ACTIVE', 'CONFIGURED'] } },
      select: {
        id: true,
        tenantId: true,
        integrationType: true,
        displayName: true,
      },
    });

    let registered = 0;

    for (const integration of integrations) {
      let types: SyncJobType[];
      let category: string;

      if (integration.integrationType === 'TMS') {
        types = ['drivers', 'vehicles', 'loads'];
        category = 'tms';
      } else if (integration.integrationType === 'ELD') {
        types = ['hos', 'gps', 'dvir', 'fleet-sync'];
        category = 'eld';
      } else {
        // Skip non-TMS/ELD integrations (LOAD_BOARD, ACCOUNTING, etc.)
        continue;
      }

      for (const type of types) {
        const schedule = await this.prisma.jobSchedule.findUnique({
          where: { category_jobType: { category, jobType: type } },
        });
        if (!schedule?.isEnabled) continue;

        // Deterministic jitter per tenant for rate limit staggering
        const jitterMs = (integration.tenantId * 7919) % 60000;

        const repeatOpts =
          schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

        const route = routeIntegrationJob(type);
        const targetQueue = route.queue === QUEUE_NAMES.TELEMETRY ? this.telemetryQueue : this.vendorDataQueue;

        const payload: IntegrationSyncPayload = {
          tenantId: integration.tenantId,
          integrationId: integration.id,
          integrationName: integration.displayName,
          integrationType: integration.integrationType,
          type,
          triggerSource: 'scheduled',
        };

        const envelope = buildJobEnvelope(payload, {
          tenantId: String(integration.tenantId),
          source: 'cron',
        });

        await targetQueue.add(route.jobName, envelope, {
          repeat: repeatOpts,
          jobId: `${category}-${type}-tenant-${integration.tenantId}-integration-${integration.id}`,
          delay: jitterMs,
          attempts: 1,
          removeOnFail: { age: 86400 },
        });
        registered++;
      }
    }

    this.logger.log(`Registered ${registered} integration sync jobs for ${integrations.length} integrations`);
    return registered;
  }

  /**
   * Register the cron repeatables for the operations category, split across
   * the new (2026-05-27) queue topology:
   *
   *   - `load-monitoring`     → SAFETY_DETECT queue (SafetyDetectProcessor)
   *   - `alert-escalation`    → NOTIFICATIONS queue (AlertNotificationsProcessor)
   *   - `alert-unsnooze`      → NOTIFICATIONS queue
   *   - `alert-digest`        → NOTIFICATIONS queue
   *   - `shift-summary`       → NOTIFICATIONS queue
   *
   * Both queues are shared with other processors, so we only purge repeatables
   * whose `name` matches one of the operations job types — never blanket-purge.
   */
  private async registerOperationsJobs(): Promise<number> {
    const safetyDetectOpsJobs = new Set<string>([SAFETY_DETECT_JOB_NAMES.LOAD_MONITORING]);
    const notificationsOpsJobs = new Set<string>([
      NOTIFICATIONS_JOB_NAMES.ALERT_ESCALATION,
      NOTIFICATIONS_JOB_NAMES.ALERT_UNSNOOZE,
      NOTIFICATIONS_JOB_NAMES.ALERT_DIGEST,
      NOTIFICATIONS_JOB_NAMES.SHIFT_SUMMARY,
    ]);

    // Purge stale repeatables on each queue, scoped to the operations job names
    // this method owns. Siblings (shield audit on safety-detect, notifications
    // cleanup/document-expiry/invoice-overdue on notifications) are left alone.
    for (const repeatable of await this.safetyDetectQueue.getRepeatableJobs()) {
      if (safetyDetectOpsJobs.has(repeatable.name)) {
        await this.safetyDetectQueue.removeRepeatableByKey(repeatable.key);
      }
    }
    for (const repeatable of await this.notificationsQueue.getRepeatableJobs()) {
      if (notificationsOpsJobs.has(repeatable.name)) {
        await this.notificationsQueue.removeRepeatableByKey(repeatable.key);
      }
    }

    const schedules = await this.prisma.jobSchedule.findMany({
      where: { category: 'operations', isEnabled: true },
    });

    for (const schedule of schedules) {
      const repeatOpts =
        schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

      const envelope = buildJobEnvelope(
        {},
        {
          tenantId: 'system',
          source: 'cron',
        },
      );

      if (safetyDetectOpsJobs.has(schedule.jobType)) {
        await this.safetyDetectQueue.add(schedule.jobType, envelope, {
          repeat: repeatOpts,
          jobId: `operations-${schedule.jobType}`,
          attempts: 1,
          removeOnFail: { age: 86400 },
        });
      } else if (notificationsOpsJobs.has(schedule.jobType)) {
        await this.notificationsQueue.add(schedule.jobType, envelope, {
          repeat: repeatOpts,
          jobId: `operations-${schedule.jobType}`,
          attempts: 1,
          removeOnFail: { age: 86400 },
        });
      } else {
        this.logger.warn(`operations schedule "${schedule.jobType}" has no target queue in the v2 topology — skipping`);
      }
    }

    return schedules.length;
  }

  /**
   * Register geo-compute repeatable jobs (route-progress).
   * Previously ran via @Cron decorator in RoutePlanProgressScheduler.
   *
   * GEO_COMPUTE is shared with load-mileage-recalc (one-shot jobs, no
   * repeatables), so we only purge repeatables that this method owns — i.e.
   * those whose name matches the route-progress job — and leave others alone.
   */
  private async registerRoutingJobs(): Promise<number> {
    const existingRepeatables = await this.geoComputeQueue.getRepeatableJobs();
    for (const repeatable of existingRepeatables) {
      if (repeatable.name === GEO_COMPUTE_JOB_NAMES.ROUTE_PROGRESS) {
        await this.geoComputeQueue.removeRepeatableByKey(repeatable.key);
      }
    }

    const schedules = await this.prisma.jobSchedule.findMany({
      where: { category: 'routing', isEnabled: true },
    });

    for (const schedule of schedules) {
      const repeatOpts =
        schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

      const envelope = buildJobEnvelope(
        {},
        {
          tenantId: 'system',
          source: 'cron',
        },
      );

      await this.geoComputeQueue.add(schedule.jobType, envelope, {
        repeat: repeatOpts,
        jobId: `routing-${schedule.jobType}`,
        attempts: 1,
        removeOnFail: { age: 86400 },
      });
    }

    return schedules.length;
  }

  /**
   * Register the maintenance/job-cleanup repeatable job on the BULK_OPS queue.
   * Previously ran via @Cron decorator in JobCleanupJob.
   */
  private async registerMaintenanceJobCleanup(): Promise<number> {
    const jobName = BULK_OPS_JOB_NAMES.JOB_CLEANUP;

    const schedule = await this.prisma.jobSchedule.findUnique({
      where: {
        category_jobType: { category: 'maintenance', jobType: jobName },
      },
    });
    if (!schedule?.isEnabled) return 0;

    // Check if already registered by another module
    const existingJobs = await this.bulkOpsQueue.getRepeatableJobs();
    const alreadyScheduled = existingJobs.some((job) => job.name === jobName);
    if (alreadyScheduled) return 0;

    const repeatOpts =
      schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

    const envelope = buildJobEnvelope(
      {},
      {
        tenantId: 'system',
        source: 'cron',
      },
    );

    await this.bulkOpsQueue.add(jobName, envelope, {
      repeat: repeatOpts,
      jobId: `maintenance-${jobName}`,
      attempts: 1,
      removeOnFail: { age: 86400 },
    });

    return 1;
  }
}
