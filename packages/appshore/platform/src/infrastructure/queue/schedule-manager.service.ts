import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { buildJobVocabulary, type JobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { JOB_VOCABULARY } from './job-vocabulary.token';
import { queueByName } from './queue-by-name';
import { applyJobSchedule, type JobScheduleOutcome } from './job-schedule';

@Injectable()
export class ScheduleManagerService {
  private readonly logger = new Logger(ScheduleManagerService.name);

  private readonly vocabulary: JobVocabulary;

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(JOB_VOCABULARY) vocabulary?: JobVocabulary,
  ) {
    this.vocabulary = vocabulary ?? buildJobVocabulary();
  }

  /** The queue a category runs on, from the merged job vocabulary (kernel and app categories alike). */
  private getQueueForCategory(category: string): Queue | null {
    const meta = this.vocabulary.categories[category];
    if (!meta) return null;
    const queue = queueByName(this.moduleRef, meta.queue);
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
      await this.reloadSchedule(schedule.category, schedule.jobType);
    } catch (error) {
      this.logger.error(
        `Schedule ${id} updated in DB but failed to reload in BullMQ: ${error instanceof Error ? error.message : error}`,
      );
      throw error;
    }

    return schedule;
  }

  /**
   * Make the queue match the `job_schedules` row for this job: removed when disabled, one repeatable with the row's
   * pattern or interval when enabled. A missing row changes nothing. Idempotent (`applyJobSchedule`), so it also runs
   * at boot for the foundation crons (`FoundationSchedulesRegistrar`) in both the API and the worker.
   */
  async reloadSchedule(category: string, jobType: string): Promise<JobScheduleOutcome | undefined> {
    const schedule = await this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category, jobType } },
    });
    if (!schedule) return undefined;

    const queue = this.getQueueForCategory(category);
    if (!queue) return undefined;

    const outcome = await applyJobSchedule(queue, schedule);
    if (outcome !== 'unchanged') this.logger.log(`Schedule ${outcome}: ${category}/${jobType}`);
    return outcome;
  }

  async getSchedule(category: string, jobType: string) {
    return this.prisma.jobSchedule.findUnique({
      where: { category_jobType: { category, jobType } },
    });
  }
}
