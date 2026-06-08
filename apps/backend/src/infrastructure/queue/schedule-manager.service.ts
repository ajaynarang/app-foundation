import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { QUEUE_NAMES } from './queue.constants';
import { JOB_CATEGORIES, JobCategory } from './job.types';

@Injectable()
export class ScheduleManagerService {
  private readonly logger = new Logger(ScheduleManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.TELEMETRY)
    private readonly telemetryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA)
    private readonly vendorDataQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT)
    private readonly safetyDetectQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DOCUMENTS) private readonly documentsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS) private readonly webhooksQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GEO_COMPUTE)
    private readonly geoComputeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
  ) {}

  private getQueueForCategory(category: JobCategory): Queue | null {
    const meta = JOB_CATEGORIES[category];
    if (!meta) return null;
    // queueMap is keyed by the new queue NAMES — `meta.queue` is the source of
    // truth (see job.types.ts) so we resolve the injected Queue instance via
    // that lookup. Multiple categories may point to the same queue (e.g.
    // `vendor` and `tms` both → vendor-data) — the map handles that naturally.
    const queueMap: Record<string, Queue> = {
      [QUEUE_NAMES.TELEMETRY]: this.telemetryQueue,
      [QUEUE_NAMES.VENDOR_DATA]: this.vendorDataQueue,
      [QUEUE_NAMES.SAFETY_DETECT]: this.safetyDetectQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
      [QUEUE_NAMES.DOCUMENTS]: this.documentsQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.FINANCE]: this.financeQueue,
      [QUEUE_NAMES.GEO_COMPUTE]: this.geoComputeQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
    };
    const queue = queueMap[meta.queue];
    if (!queue) {
      this.logger.warn(`No queue injected for category "${category}" (queue: ${meta.queue})`);
      return null;
    }
    return queue;
  }

  async listSchedules() {
    return this.prisma.jobSchedule.findMany({
      orderBy: [{ category: 'asc' }, { jobType: 'asc' }],
    });
  }

  async updateSchedule(
    id: number,
    data: { pattern?: string; intervalMs?: number; isEnabled?: boolean },
    updatedBy: number,
  ) {
    const existing = await this.prisma.jobSchedule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Schedule with id ${id} not found`);
    }

    const schedule = await this.prisma.jobSchedule.update({
      where: { id },
      data: { ...data, updatedBy },
    });

    try {
      await this.reloadSchedule(schedule.category as JobCategory, schedule.jobType);
    } catch (error) {
      this.logger.error(
        `Schedule ${id} updated in DB but failed to reload in BullMQ: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }

    return schedule;
  }

  async reloadSchedule(category: JobCategory, jobType: string) {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category, jobType } },
    });
    if (!schedule) return;

    const queue = this.getQueueForCategory(category);
    if (!queue) return;

    // Remove existing repeatables for this job type
    const repeatables = await queue.getRepeatableJobs();
    for (const r of repeatables) {
      if (r.name === jobType) {
        await queue.removeRepeatableByKey(r.key);
      }
    }

    if (!schedule.isEnabled) {
      this.logger.log(`Schedule disabled: ${category}/${jobType}`);
      return;
    }

    // For integration-scoped jobs (tms, eld), re-register per integration
    const meta = JOB_CATEGORIES[category];
    if (meta.requiredIntegration) {
      const integrationType = meta.requiredIntegration!;
      const integrations = await this.prisma.integrationConfig.findMany({
        where: {
          integrationType,
          isEnabled: true,
          status: { in: ['ACTIVE', 'CONFIGURED'] },
        },
        select: {
          id: true,
          tenantId: true,
          displayName: true,
          integrationType: true,
        },
      });

      for (const integration of integrations) {
        const repeatOpts =
          schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

        await queue.add(
          jobType,
          {
            tenantId: integration.tenantId,
            integrationId: integration.id,
            integrationName: integration.displayName,
            integrationType: integration.integrationType,
            type: jobType,
            triggerSource: 'scheduled',
          },
          {
            repeat: repeatOpts,
            jobId: `${category}-${jobType}-tenant-${integration.tenantId}-integration-${integration.id}`,
            // Repeatable jobs run on a short cron cycle, so limit retries
            // to avoid stacking failures (next cron tick will try again).
            attempts: 1,
            removeOnFail: { age: 86400 },
          },
        );
      }
    } else {
      // System-wide job (safety, maintenance, vendor)
      const repeatOpts =
        schedule.scheduleType === 'cron' ? { pattern: schedule.pattern } : { every: schedule.intervalMs };

      await queue.add(
        jobType,
        {},
        {
          repeat: repeatOpts,
          jobId: `${category}-${jobType}`,
        },
      );
    }

    this.logger.log(`Reloaded schedule: ${category}/${jobType}`);
  }

  async getSchedule(category: string, jobType: string) {
    return this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category, jobType } },
    });
  }
}
