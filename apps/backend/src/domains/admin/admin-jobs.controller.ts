import {
  Controller,
  Inject,
  Optional,
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
import { buildJobVocabulary, type JobVocabulary } from '@appshore/kernel/infrastructure/queue/job-vocabulary';
import { JOB_VOCABULARY } from '@appshore/platform/infrastructure/queue/job-vocabulary.token';
import { queueByName } from '@appshore/platform/infrastructure/queue/queue-by-name';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { ModuleRef } from '@nestjs/core';
import { Queue } from 'bullmq';
import { bullJobIdFromDbId } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { fieldError, invalidState } from '@appshore/kernel/shared/errors/api-errors';
import { AdminJobListQueryDto, AdminJobsTenantQueryDto } from './dto/admin-jobs-query.dto';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  AdminJobCategorySummaryResponse,
  AdminJobListResponse,
  AdminJobMetricsResponse,
  AdminJobResponse,
  AdminJobRetryResponse,
  AdminJobsPauseStateResponse,
} from './openapi.responses';
import { SystemScope, TargetTenant } from '@appshore/kernel/infrastructure/rls/system-scope.decorator';

const JOB_STATUS = JobStatusSchema.enum;

const JOB_ID_PARAM = { name: 'job_id', description: 'Job numeric id (listed in id-boundary.allowlist.json)' };
const TENANT_ID_PARAM = { name: 'tenant_id', description: 'Tenant numeric id (listed in id-boundary.allowlist.json)' };

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
@SystemScope('super-admin')
export class AdminJobsController {
  private readonly vocabulary: JobVocabulary;

  constructor(
    private readonly jobService: JobService,
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject(JOB_VOCABULARY) vocabulary?: JobVocabulary,
  ) {
    this.vocabulary = vocabulary ?? buildJobVocabulary();
  }

  /** Map a job category (kernel or app, from the merged job vocabulary) to its backing queue instance. */
  private queueForCategory(category: string): Queue | null {
    const queueName = this.vocabulary.categories[category]?.queue;
    return queueName ? queueByName(this.moduleRef, queueName) : null;
  }

  /** Every queue some category runs on, keyed by queue name. */
  private categoryQueues(): Record<string, Queue> {
    const queues: Record<string, Queue> = {};
    for (const category of this.vocabulary.allCategories) {
      const name = this.vocabulary.categories[category].queue;
      const queue = name in queues ? null : queueByName(this.moduleRef, name);
      if (queue) queues[name] = queue;
    }
    return queues;
  }

  @Get()
  @ApiOperation({ summary: 'List jobs across tenants — a cursor list, newest first' })
  @ApiResult(AdminJobListResponse)
  async listJobs(@Query() query: AdminJobListQueryDto) {
    return this.jobService.listAllJobs(query);
  }

  @Get('metrics')
  @ApiOperation({
    summary: "Today's job metrics — totals, success rate, failures, average duration (optionally one tenant)",
  })
  @ApiResult(AdminJobMetricsResponse)
  async getMetrics(@Query() query: AdminJobsTenantQueryDto) {
    return this.jobService.getMetrics(query.tenantId);
  }

  @Get('categories/summary')
  @ApiOperation({ summary: 'Per-category job summary for one tenant — 400 without tenant_id' })
  @ApiResult([AdminJobCategorySummaryResponse])
  async getCategorySummary(@Query() query: AdminJobsTenantQueryDto) {
    if (query.tenantId === undefined) {
      throw fieldError('tenant_id', 'tenant_id is required for the category summary');
    }
    return this.jobService.getCategorySummary(query.tenantId, this.vocabulary.allCategories, this.categoryQueues());
  }

  @Get(':job_id')
  @ApiOperation({ summary: 'Get one job' })
  @ApiParam(JOB_ID_PARAM)
  @ApiResult(AdminJobResponse)
  async getJob(@Param('job_id', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job) throw new NotFoundException('Job not found');
    return job;
  }

  @Post(':job_id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Retry a failed job (queued) — 409 when the job has not failed' })
  @ApiParam(JOB_ID_PARAM)
  @ApiResult(AdminJobRetryResponse, HttpStatus.ACCEPTED)
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
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pause a tenant's background jobs" })
  @ApiParam(TENANT_ID_PARAM)
  @ApiResult(AdminJobsPauseStateResponse)
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
  @TargetTenant('tenant_id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resume a tenant's background jobs" })
  @ApiParam(TENANT_ID_PARAM)
  @ApiResult(AdminJobsPauseStateResponse)
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
