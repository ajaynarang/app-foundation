import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  ParseIntPipe,
  Query,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { JobStatus, UserRole } from '@prisma/client';
import { JobStatusSchema } from '@sally/shared-types';
import {
  QUEUE_NAMES,
  DOCUMENTS_JOB_NAMES,
  VENDOR_DATA_JOB_NAMES,
  bullJobIdFromDbId,
  type QueueName,
} from '../../../infrastructure/queue/queue.constants';
import { JOB_CATEGORIES, type JobCategory } from '../../../infrastructure/queue/job.types';
import { JobService } from '../../../infrastructure/queue/job.service';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { routeIntegrationJob } from '../../../infrastructure/sync/integration-job-router';
import type { IntegrationSyncPayload, SyncJobType } from '../../../infrastructure/sync/sync-job.types';

const JOB_STATUS = JobStatusSchema.enum;

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobService: JobService,
    @InjectQueue(QUEUE_NAMES.DOCUMENTS)
    private readonly documentsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.TELEMETRY)
    private readonly telemetryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA)
    private readonly vendorDataQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT)
    private readonly safetyDetectQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GEO_COMPUTE)
    private readonly geoComputeQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS)
    private readonly notificationsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.WEBHOOKS)
    private readonly webhooksQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EVENTS)
    private readonly eventsQueue: Queue,
  ) {}

  /**
   * Resolve an injected BullMQ queue instance by its registered name.
   * Covers every queue that any JOB_CATEGORIES entry can route to — so a
   * cancel call against any valid Job.category finds its live BullMQ job
   * instead of silently no-oping the removal.
   */
  private queueByName(name: QueueName): Queue | undefined {
    const registry: Partial<Record<QueueName, Queue>> = {
      [QUEUE_NAMES.DOCUMENTS]: this.documentsQueue,
      [QUEUE_NAMES.TELEMETRY]: this.telemetryQueue,
      [QUEUE_NAMES.VENDOR_DATA]: this.vendorDataQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
      [QUEUE_NAMES.SAFETY_DETECT]: this.safetyDetectQueue,
      [QUEUE_NAMES.FINANCE]: this.financeQueue,
      [QUEUE_NAMES.GEO_COMPUTE]: this.geoComputeQueue,
      [QUEUE_NAMES.NOTIFICATIONS]: this.notificationsQueue,
      [QUEUE_NAMES.WEBHOOKS]: this.webhooksQueue,
      [QUEUE_NAMES.EVENTS]: this.eventsQueue,
    };
    return registry[name];
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List jobs for the current tenant' })
  async listJobs(
    @CurrentUser() user: any,
    @Query('category') category?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('dismissed') dismissed?: string,
  ) {
    let statusArray: JobStatus[] | undefined;
    if (status) {
      const allowed = Object.values(JobStatus) as string[];
      const parsed = status
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s.length > 0);
      const invalid = parsed.filter((s) => !allowed.includes(s));
      if (invalid.length > 0) {
        throw new BadRequestException(`Invalid status value(s): ${invalid.join(', ')}. Allowed: ${allowed.join(', ')}`);
      }
      statusArray = parsed as JobStatus[];
    }
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.jobService.listJobsPaginated(user.tenantDbId, {
      category,
      type,
      status: statusArray,
      dateFrom,
      dateTo,
      limit: Math.min(isNaN(parsedLimit) ? 20 : parsedLimit, 100),
      offset: isNaN(parsedOffset) ? 0 : parsedOffset,
      ...(dismissed !== undefined && { dismissed: dismissed === 'true' }),
    });
  }

  @Get('categories/summary')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get category summary for the current tenant' })
  async getCategorySummary(@CurrentUser() user: any) {
    const visibleCategories = await this.jobService.getVisibleCategories(user.tenantDbId);
    return this.jobService.getCategorySummary(user.tenantDbId, visibleCategories, {
      [QUEUE_NAMES.TELEMETRY]: this.telemetryQueue,
      [QUEUE_NAMES.VENDOR_DATA]: this.vendorDataQueue,
      [QUEUE_NAMES.DOCUMENTS]: this.documentsQueue,
      [QUEUE_NAMES.BULK_OPS]: this.bulkOpsQueue,
      [QUEUE_NAMES.SAFETY_DETECT]: this.safetyDetectQueue,
    });
  }

  @Get(':jobId')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get job details' })
  async getJob(@CurrentUser() user: any, @Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job || job.tenantId !== user.tenantDbId) {
      throw new NotFoundException('Job not found');
    }
    return job;
  }

  @Post(':jobId/retry')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Retry a failed job' })
  async retryJob(@CurrentUser() user: any, @Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job || job.tenantId !== user.tenantDbId) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JOB_STATUS.FAILED) {
      throw new BadRequestException('Only failed jobs can be retried');
    }

    await this.jobService.resetForRetry(jobId);

    const inputData = job.inputData as any;

    const bullJobId = bullJobIdFromDbId(job.category, job.id);

    if (job.category === 'documents') {
      // Remove old BullMQ job from Redis so the jobId can be reused
      const existingBullJob = await this.documentsQueue.getJob(bullJobId);
      if (existingBullJob) await existingBullJob.remove();

      await this.documentsQueue.add(
        DOCUMENTS_JOB_NAMES.RATECON,
        buildJobEnvelope(
          {
            jobId: job.id,
            tenantId: job.tenantId,
            submittedByUserId: user.userId,
            submittedByDbId: job.submittedBy,
            fileName: inputData.fileName,
            s3Key: inputData.s3Key,
            fileBase64: inputData.fileBase64, // backwards compat for old jobs
            strategy: inputData.strategy || 'text-first',
            inputHash: job.inputHash,
            forceReparse: true,
          },
          { tenantId: String(job.tenantId), source: 'api', userId: user.userId },
        ),
        {
          jobId: bullJobId,
          removeOnComplete: { age: 3600, count: 100 },
          removeOnFail: { age: 86400, count: 200 },
        },
      );
    } else if (job.category === 'vendor' || job.category === 'telemetry') {
      // Vendor (drivers/vehicles/loads, lane auto-generation) and telemetry
      // (hos/gps/dvir/fleet-sync) jobs share the integration sync retry path.
      // Lane retries are job-type-discriminated below — anything with type
      // `lanes-auto-generation` re-enqueues the single-lane retry job.
      if (job.type === 'auto-generation' || job.type === VENDOR_DATA_JOB_NAMES.LANES_AUTO_GENERATION) {
        await this.vendorDataQueue.add(
          VENDOR_DATA_JOB_NAMES.LANES_RETRY_SINGLE,
          buildJobEnvelope(
            {
              retryJobId: job.id,
              recurringLaneDbId: inputData.recurringLaneDbId,
              tenantId: job.tenantId,
            },
            { tenantId: String(job.tenantId), source: 'api', userId: user.userId },
          ),
        );
      } else {
        const route = routeIntegrationJob(job.type as SyncJobType);
        const targetQueue = route.queue === QUEUE_NAMES.TELEMETRY ? this.telemetryQueue : this.vendorDataQueue;

        const payload: IntegrationSyncPayload = {
          jobId: job.id,
          tenantId: job.tenantId,
          integrationId: inputData.integrationId,
          integrationName: inputData.integrationName,
          integrationType: inputData.integrationType,
          type: job.type as SyncJobType,
          triggerSource: 'manual',
        };

        await targetQueue.add(
          route.jobName,
          buildJobEnvelope(payload, { tenantId: String(job.tenantId), source: 'api', userId: user.userId }),
        );
      }
    } else {
      throw new BadRequestException(`Retry not supported for category: ${job.category}`);
    }

    return { jobId: job.id, status: JOB_STATUS.QUEUED };
  }

  @Patch(':jobId/dismiss')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Dismiss a job (hide from ghost cards)' })
  async dismissJob(@CurrentUser() user: any, @Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job || job.tenantId !== user.tenantDbId) {
      throw new NotFoundException('Job not found');
    }
    if (job.submittedBy !== user.dbId) {
      throw new ForbiddenException('Only the job submitter can dismiss');
    }
    await this.jobService.dismissJob(jobId, user.tenantDbId);
    return { jobId, dismissed: true };
  }

  @Delete(':jobId')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Cancel a queued or processing job' })
  async cancelJob(@CurrentUser() user: any, @Param('jobId', ParseIntPipe) jobId: number) {
    const job = await this.jobService.getJob(jobId);
    if (!job || job.tenantId !== user.tenantDbId) {
      throw new NotFoundException('Job not found');
    }
    if (job.status !== JOB_STATUS.QUEUED && job.status !== JOB_STATUS.PROCESSING) {
      throw new BadRequestException('Only queued or processing jobs can be cancelled');
    }

    // Best-effort removal of the live BullMQ job from Redis. We look it up on the
    // queue that actually processes this category, using the same prefixed token
    // the enqueue side uses (`bullJobIdFromDbId`). If the queue or the BullMQ job
    // is already gone (worker crashed, job orphaned), we still mark the DB row
    // CANCELLED below so the job never stays stuck — recovery always succeeds.
    //
    // JOB_CATEGORIES is the single source of truth for category → queue mapping.
    // After the 2026-05-27 wipe + re-key, every Job.category value MUST be a
    // JOB_CATEGORIES key — if it isn't, that's a bug worth surfacing loudly.
    if (!(job.category in JOB_CATEGORIES)) {
      throw new BadRequestException(`Unknown job category: ${job.category}`);
    }
    const queueName = JOB_CATEGORIES[job.category as JobCategory].queue;
    const queue = this.queueByName(queueName);
    if (queue) {
      const bullJob = await queue.getJob(bullJobIdFromDbId(job.category, jobId));
      if (bullJob) await bullJob.remove();
    }

    await this.jobService.cancelJob(jobId);
    return { jobId: job.id, status: JOB_STATUS.CANCELLED };
  }
}
