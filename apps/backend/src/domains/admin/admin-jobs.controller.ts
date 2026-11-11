import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  NotFoundException,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { JobStatusSchema } from '@app/shared-types';
import { JobService } from '@appshore/platform/infrastructure/queue/job.service';
import { ALL_CATEGORIES, JOB_CATEGORIES } from '@appshore/kernel/infrastructure/queue/job.types';
import type { JobCategory } from '@appshore/kernel/infrastructure/queue/job.types';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, bullJobIdFromDbId } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { fieldError, invalidState } from '@appshore/kernel/shared/errors/api-errors';
import { AdminJobListQueryDto, AdminJobsTenantQueryDto } from './dto/admin-jobs-query.dto';

const JOB_STATUS = JobStatusSchema.enum;

const JOBS_PAUSE_SELECT = { tenantId: true, companyName: true, jobsPaused: true, jobsPausedAt: true } as const;

/** A tenant's job-pause state, named by its public slug: the handler answers this, never the Prisma row. */
export function toJobsPauseState(tenant: {
  tenantId: string;
  companyName: string;
  jobsPaused: boolean;
  jobsPausedAt: Date | null;
}) {
  return {
    tenantId: tenant.tenantId,
    companyName: tenant.companyName,
    jobsPaused: tenant.jobsPaused,
    jobsPausedAt: tenant.jobsPausedAt,
  };
}

@Controller('admin/jobs')
@Roles(UserRole.SUPER_ADMIN)
export class AdminJobsController {
  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.EVENTS) private eventsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS) private webhooksQueue: Queue,
    @InjectQueue(QUEUE_NAMES.AI_BACKGROUND) private aiBackgroundQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private bulkOpsQueue: Queue,
  ) {}

  /** Map a job category to its backing queue instance. */
  private queueForCategory(category: string): Queue | null {
    const queueName = JOB_CATEGORIES[category as JobCategory]?.queue;
    switch (queueName) {
      case QUEUE_NAMES.EVENTS:
        return this.eventsQueue;
      case QUEUE_NAMES.NOTIFICATIONS:
        return this.notificationsQueue;
      case QUEUE_NAMES.WEBHOOKS:
        return this.webhooksQueue;
      case QUEUE_NAMES.AI_BACKGROUND:
        return this.aiBackgroundQueue;
      case QUEUE_NAMES.BULK_OPS:
        return this.bulkOpsQueue;
      default:
        return null;
    }
  }

  @Get()
  async listJobs(@Query() query: AdminJobListQueryDto) {
    return this.jobService.listAllJobs(query);
  }

  @Get('metrics')
  async getMetrics(@Query() query: AdminJobsTenantQueryDto) {
    return this.jobService.getMetrics(query.tenantId);
  }

  @Get('categories/summary')
  async getCategorySummary(@Query() query: AdminJobsTenantQueryDto) {
    if (query.tenantId === undefined) {
      throw fieldError('tenant_id', 'tenant_id is required for the category summary');
    }
    return this.jobService.getCategorySummary(query.tenantId, ALL_CATEGORIES, {
      [QUEUE_NAMES.EVENTS]: this.eventsQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.AI_BACKGROUND]: this.aiBackgroundQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
    });
  }

  @Get(':job_id')
  async getJob(@Param('job_id', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  @Post(':job_id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retryJob(@Param('job_id', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JOB_STATUS.FAILED) {
      throw invalidState('Only failed jobs can be retried');
    }

    await this.jobService.resetForRetry(jobId);

    const inputData = job.inputData as Record<string, any> | null;

    const targetQueue = this.queueForCategory(job.category);
    if (!targetQueue) {
      throw invalidState('Jobs of this kind cannot be retried from here');
    }

    await targetQueue.add(
      job.type,
      buildJobEnvelope(
        {
          jobId: job.id,
          tenantId: job.tenantId,
          submittedByDbId: job.submittedBy,
          inputHash: job.inputHash,
          ...inputData,
        },
        { tenantId: String(job.tenantId), source: 'api' },
      ),
      { jobId: bullJobIdFromDbId(job.category, job.id) },
    );

    return { jobId: job.id, status: JOB_STATUS.QUEUED };
  }

  @Post('tenants/:tenant_id/pause-jobs')
  @HttpCode(HttpStatus.OK)
  async pauseJobs(@Param('tenant_id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { jobsPaused: true, jobsPausedAt: new Date(), jobsPausedBy: user.dbId },
      select: JOBS_PAUSE_SELECT,
    });
    return toJobsPauseState(updated);
  }

  @Post('tenants/:tenant_id/resume-jobs')
  @HttpCode(HttpStatus.OK)
  async resumeJobs(@Param('tenant_id', ParseIntPipe) id: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { jobsPaused: false, jobsPausedAt: null, jobsPausedBy: null },
      select: JOBS_PAUSE_SELECT,
    });
    return toJobsPauseState(updated);
  }
}
