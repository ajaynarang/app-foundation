import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  BadRequestException,
  NotFoundException,
  ParseIntPipe,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JobStatus, UserRole } from '@appshore/db';
import { JobStatusSchema } from '@app/shared-types';
import { JobService } from '../../infrastructure/queue/job.service';
import { ALL_CATEGORIES, JOB_CATEGORIES } from '../../infrastructure/queue/job.types';
import type { JobCategory } from '../../infrastructure/queue/job.types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, bullJobIdFromDbId } from '../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../infrastructure/queue/job-envelope.helper';

const JOB_STATUS = JobStatusSchema.enum;

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
  async listJobs(
    @Query('tenantId') tenantId?: string,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const statusArray = status
      ? (status.split(',').filter((s) => (Object.values(JobStatus) as string[]).includes(s)) as JobStatus[])
      : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    const parsedTenantId = tenantId ? parseInt(tenantId, 10) : undefined;

    if (parsedTenantId !== undefined && isNaN(parsedTenantId)) {
      throw new BadRequestException('tenantId must be a number');
    }

    return this.jobService.listAllJobsPaginated({
      tenantId: parsedTenantId,
      category,
      type,
      status: statusArray,
      limit: Math.min(isNaN(parsedLimit) ? 20 : parsedLimit, 100),
      offset: isNaN(parsedOffset) ? 0 : parsedOffset,
      dateFrom,
      dateTo,
    });
  }

  @Get('metrics')
  async getMetrics(@Query('tenantId') tenantId?: string) {
    const parsedTenantId = tenantId ? parseInt(tenantId, 10) : undefined;
    if (parsedTenantId !== undefined && isNaN(parsedTenantId)) {
      throw new BadRequestException('tenantId must be a number');
    }
    return this.jobService.getMetrics(parsedTenantId);
  }

  @Get('categories/summary')
  async getCategorySummary(@Query('tenantId') tenantId?: string) {
    if (!tenantId) {
      throw new BadRequestException('tenantId required for category summary');
    }
    const parsedTenantId = parseInt(tenantId, 10);
    if (isNaN(parsedTenantId)) {
      throw new BadRequestException('tenantId must be a number');
    }
    return this.jobService.getCategorySummary(parsedTenantId, ALL_CATEGORIES, {
      [QUEUE_NAMES.EVENTS]: this.eventsQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.AI_BACKGROUND]: this.aiBackgroundQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
    });
  }

  @Get(':jobId')
  async getJob(@Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  @Post(':jobId/retry')
  async retryJob(@Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    if (job.status !== JOB_STATUS.FAILED) {
      throw new BadRequestException('Only failed jobs can be retried');
    }

    await this.jobService.resetForRetry(jobId);

    const inputData = job.inputData as Record<string, any> | null;

    const targetQueue = this.queueForCategory(job.category);
    if (!targetQueue) {
      throw new BadRequestException(`Retry not supported for category: ${job.category}`);
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

  @Post('tenants/:id/pause-jobs')
  async pauseJobs(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id },
      data: {
        jobsPaused: true,
        jobsPausedAt: new Date(),
        jobsPausedBy: user.dbId,
      },
      select: {
        id: true,
        companyName: true,
        jobsPaused: true,
        jobsPausedAt: true,
      },
    });
  }

  @Post('tenants/:id/resume-jobs')
  async resumeJobs(@Param('id', ParseIntPipe) id: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    return this.prisma.tenant.update({
      where: { id },
      data: { jobsPaused: false, jobsPausedAt: null, jobsPausedBy: null },
      select: { id: true, companyName: true, jobsPaused: true },
    });
  }
}
