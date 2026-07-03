import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { JOB_CATEGORIES, JobCategory } from '@appshore/kernel/infrastructure/queue/job.types';

@Injectable()
export class ScheduleManagerService {
  private readonly logger = new Logger(ScheduleManagerService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.EVENTS)
    private readonly eventsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS) private readonly webhooksQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AI_BACKGROUND)
    private readonly aiBackgroundQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
  ) {}

  private getQueueForCategory(category: JobCategory): Queue | null {
    const meta = JOB_CATEGORIES[category];
    if (!meta) return null;
    // queueMap is keyed by the queue NAMES — `meta.queue` is the source of
    // truth (see job.types.ts) so we resolve the injected Queue instance via
    // that lookup. Multiple categories may point to the same queue — the map
    // handles that naturally.
    const queueMap: Record<string, Queue> = {
      [QUEUE_NAMES.EVENTS]: this.eventsQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.AI_BACKGROUND]: this.aiBackgroundQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
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

    // System-wide repeatable job.
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

    this.logger.log(`Reloaded schedule: ${category}/${jobType}`);
  }

  async getSchedule(category: string, jobType: string) {
    return this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category, jobType } },
    });
  }
}
