import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JobStatus, UserRole } from '@prisma/client';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { FINANCE_JOB_NAMES, QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { JobService } from '../../infrastructure/queue/job.service';
import type { JobCategory } from '../../infrastructure/queue/job.types';
import { IntegrationSyncPayload, SyncJobType } from '../../infrastructure/sync/sync-job.types';
import { routeIntegrationJob } from '../../infrastructure/sync/integration-job-router';
import { buildJobEnvelope } from '../../infrastructure/queue/job-envelope.helper';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private integrationsService: IntegrationsService,
    private prisma: PrismaService,
    private jobService: JobService,
    @InjectQueue(QUEUE_NAMES.TELEMETRY) private telemetryQueue: Queue,
    @InjectQueue(QUEUE_NAMES.VENDOR_DATA) private vendorDataQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FINANCE) private financeQueue: Queue,
  ) {}

  // ---- Static routes (must come before parameterized routes) ----

  @Get()
  async listIntegrations(@Request() req) {
    return this.integrationsService.listIntegrations(req.user.tenantId);
  }

  /**
   * GET /integrations/vendors
   * Returns vendor registry metadata
   */
  @Get('vendors')
  getVendorRegistry() {
    return this.integrationsService.getVendorRegistry();
  }

  @Get('health')
  async getHealthSummary(@Request() req) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getHealthSummary(tenant.id);
  }

  @Get('sync-history')
  async getUnifiedSyncHistory(
    @Request() req,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('syncType') syncType?: string,
    @Query('status') status?: string,
  ) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getUnifiedSyncHistory(
      tenant.id,
      parseInt(limit || '20'),
      parseInt(offset || '0'),
      syncType || undefined,
      status || undefined,
    );
  }

  // ---- Fleet sync endpoints ----

  @Post('fleet/sync')
  @RequireFeature('tms_integration')
  async syncFleet(@Request() req) {
    const tenant = await this.getTenant(req);

    // Guard: prevent concurrent syncs
    const activeJobs = await this.jobService.listJobs(tenant.id, {
      category: 'vendor',
      status: [JobStatus.QUEUED, JobStatus.PROCESSING],
    });
    if (activeJobs.length > 0) {
      return {
        success: false,
        message: 'A sync is already in progress. Please wait for it to complete.',
      };
    }

    const allJobIds: number[] = [];

    // ELD sync first (creates fleet entities)
    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    if (eldIntegrations.length > 0) {
      const eldJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['fleet-sync']);
      allJobIds.push(...eldJobIds);
    }

    // TMS sync second (enriches fleet + creates loads)
    const tmsIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'TMS',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    // If both ELD + TMS exist, delay TMS by 30s so ELD creates fleet first
    const tmsDelay = eldIntegrations.length > 0 ? 30000 : 0;
    if (tmsDelay > 0) {
      const tmsJobIds = await this.enqueueSyncJobsWithDelay(
        tenant.id,
        req.user.dbId ?? null,
        tmsIntegrations,
        ['drivers', 'vehicles', 'loads'],
        tmsDelay,
      );
      allJobIds.push(...tmsJobIds);
    } else {
      const tmsJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, tmsIntegrations, [
        'drivers',
        'vehicles',
        'loads',
      ]);
      allJobIds.push(...tmsJobIds);
    }

    return {
      success: true,
      message: 'Fleet sync started. ELD creates fleet, TMS enriches with business data.',
      jobIds: allJobIds,
    };
  }

  @Post('fleet/sync-loads')
  @RequireFeature('tms_integration')
  async syncLoads(@Request() req) {
    const tenant = await this.getTenant(req);

    const tmsIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'TMS',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const jobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, tmsIntegrations, ['loads']);

    return {
      success: true,
      message: 'Loads sync started. New and updated loads will appear shortly.',
      jobIds,
    };
  }

  @Post('fleet/sync-drivers')
  @RequireFeature('tms_integration')
  async syncDrivers(@Request() req) {
    const tenant = await this.getTenant(req);
    const allJobIds: number[] = [];

    // ELD creates drivers first
    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    if (eldIntegrations.length > 0) {
      const eldJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['fleet-sync']);
      allJobIds.push(...eldJobIds);
    }

    // TMS enriches drivers
    const tmsIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'TMS',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const tmsDelay = eldIntegrations.length > 0 ? 30000 : 0;
    if (tmsDelay > 0) {
      const tmsJobIds = await this.enqueueSyncJobsWithDelay(
        tenant.id,
        req.user.dbId ?? null,
        tmsIntegrations,
        ['drivers'],
        tmsDelay,
      );
      allJobIds.push(...tmsJobIds);
    } else {
      const tmsJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, tmsIntegrations, ['drivers']);
      allJobIds.push(...tmsJobIds);
    }

    return {
      success: true,
      message: 'Drivers sync started. ELD creates, TMS enriches.',
      jobIds: allJobIds,
    };
  }

  @Post('fleet/sync-vehicles')
  @RequireFeature('tms_integration')
  async syncVehicles(@Request() req) {
    const tenant = await this.getTenant(req);
    const allJobIds: number[] = [];

    // ELD creates vehicles first
    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    if (eldIntegrations.length > 0) {
      const eldJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['fleet-sync']);
      allJobIds.push(...eldJobIds);
    }

    // TMS enriches vehicles
    const tmsIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'TMS',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const tmsDelay = eldIntegrations.length > 0 ? 30000 : 0;
    if (tmsDelay > 0) {
      const tmsJobIds = await this.enqueueSyncJobsWithDelay(
        tenant.id,
        req.user.dbId ?? null,
        tmsIntegrations,
        ['vehicles'],
        tmsDelay,
      );
      allJobIds.push(...tmsJobIds);
    } else {
      const tmsJobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, tmsIntegrations, ['vehicles']);
      allJobIds.push(...tmsJobIds);
    }

    return {
      success: true,
      message: 'Vehicles sync started. ELD creates, TMS enriches.',
      jobIds: allJobIds,
    };
  }

  // ---- ELD sync endpoints ----

  @Post('eld/sync')
  @RequireFeature('samsara_integration')
  async syncELD(@Request() req) {
    const tenant = await this.getTenant(req);

    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const jobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['hos', 'gps']);

    return {
      success: true,
      message: 'ELD sync started. HOS clocks and telematics will update shortly.',
      jobIds,
    };
  }

  @Post('eld/sync-hos')
  @RequireFeature('samsara_integration')
  async syncHOS(@Request() req) {
    const tenant = await this.getTenant(req);

    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const jobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['hos']);

    return {
      success: true,
      message: 'HOS sync started. Driver HOS clocks will update shortly.',
      jobIds,
    };
  }

  @Post('eld/sync-telematics')
  @RequireFeature('samsara_integration')
  async syncTelematics(@Request() req) {
    const tenant = await this.getTenant(req);

    const eldIntegrations = await this.prisma.integrationConfig.findMany({
      where: {
        tenantId: tenant.id,
        integrationType: 'ELD',
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: { id: true, displayName: true, integrationType: true },
    });

    const jobIds = await this.enqueueSyncJobs(tenant.id, req.user.dbId ?? null, eldIntegrations, ['gps']);

    return {
      success: true,
      message: 'Telematics sync started. Vehicle locations will update shortly.',
      jobIds,
    };
  }

  // ---- Parameterized routes (must come AFTER static routes) ----

  @Get(':integrationId')
  async getIntegration(@Param('integrationId') integrationId: string) {
    return this.integrationsService.getIntegration(integrationId);
  }

  @Post()
  async createIntegration(@Body() dto: CreateIntegrationDto, @Request() req) {
    return this.integrationsService.createIntegration(req.user.tenantId, dto);
  }

  @Patch(':integrationId')
  async updateIntegration(@Param('integrationId') integrationId: string, @Body() dto: UpdateIntegrationDto) {
    return this.integrationsService.updateIntegration(integrationId, dto);
  }

  @Delete(':integrationId')
  async deleteIntegration(@Param('integrationId') integrationId: string) {
    return this.integrationsService.deleteIntegration(integrationId);
  }

  @Post(':integrationId/test')
  async testConnection(@Param('integrationId') integrationId: string) {
    return this.integrationsService.testConnection(integrationId);
  }

  @Post(':integrationId/sync')
  async triggerSync(@Param('integrationId') integrationId: string, @Request() req) {
    const integration = await this.prisma.integrationConfig.findUnique({
      where: { integrationId },
      select: {
        id: true,
        tenantId: true,
        displayName: true,
        integrationType: true,
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // ACCOUNTING integrations enqueue on the shared FINANCE queue
    if (integration.integrationType === 'ACCOUNTING') {
      const job = await this.jobService.createJob({
        tenantId: integration.tenantId,
        submittedBy: req.user.dbId ?? null,
        category: 'finance',
        type: FINANCE_JOB_NAMES.INITIAL_SYNC,
        inputData: { integrationId, triggerSource: 'manual' },
      });
      await this.financeQueue.add(
        FINANCE_JOB_NAMES.INITIAL_SYNC,
        buildJobEnvelope(
          {
            jobId: job.id,
            tenantId: integration.tenantId,
            integrationId,
            type: 'initial-sync' as const,
            triggerSource: 'manual' as const,
          },
          { tenantId: String(integration.tenantId), source: 'api' },
        ),
      );
      return {
        success: true,
        message: `Sync started for ${integration.displayName}.`,
        jobIds: [job.id],
      };
    }

    if (integration.integrationType === 'ELD') {
      // Enqueue enrichment first (no delay)
      const enrichmentIds = await this.enqueueSyncJobs(
        integration.tenantId,
        req.user.dbId ?? null,
        [
          {
            id: integration.id,
            displayName: integration.displayName,
            integrationType: integration.integrationType,
          },
        ],
        ['fleet-sync'],
      );

      // Enqueue HOS + GPS with 30s delay so enrichment completes first
      const syncIds = await this.enqueueSyncJobsWithDelay(
        integration.tenantId,
        req.user.dbId ?? null,
        [
          {
            id: integration.id,
            displayName: integration.displayName,
            integrationType: integration.integrationType,
          },
        ],
        ['hos', 'gps'],
        30000,
      );

      return {
        success: true,
        message: `Sync started for ${integration.displayName}.`,
        jobIds: [...enrichmentIds, ...syncIds],
      };
    }

    const types = ['drivers', 'vehicles', 'loads'] as const;
    const jobIds = await this.enqueueSyncJobs(
      integration.tenantId,
      req.user.dbId ?? null,
      [
        {
          id: integration.id,
          displayName: integration.displayName,
          integrationType: integration.integrationType,
        },
      ],
      [...types],
    );

    return {
      success: true,
      message: `Sync started for ${integration.displayName}.`,
      jobIds,
    };
  }

  @Get(':integrationId/sync-history')
  async getSyncHistory(
    @Param('integrationId') integrationId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.integrationsService.getSyncHistory(integrationId, parseInt(limit || '50'), parseInt(offset || '0'));
  }

  @Get(':integrationId/sync-history/stats')
  async getSyncStats(@Param('integrationId') integrationId: string) {
    return this.integrationsService.getSyncStats(integrationId);
  }

  // ---- Helpers ----

  private async getTenant(req: any) {
    // req.user.tenantDbId is the numeric DB id set by JwtStrategy
    if (req.user.tenantDbId) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: req.user.tenantDbId },
      });
      if (!tenant) throw new NotFoundException('Tenant not found');
      return tenant;
    }
    // Fallback: look up by userId string
    const tenant = await this.prisma.tenant.findFirst({
      where: { users: { some: { userId: req.user.userId } } },
    });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  /**
   * Create Job records and enqueue Bull sync jobs for each integration × type combination.
   */
  private async enqueueSyncJobs(
    tenantId: number,
    submittedBy: number | null,
    integrations: {
      id: number;
      displayName: string;
      integrationType: string;
    }[],
    types: string[],
  ): Promise<number[]> {
    const jobIds: number[] = [];

    for (const integration of integrations) {
      for (const type of types) {
        // TMS types (drivers, vehicles, loads) → 'vendor'; ELD types (hos, gps) → 'telemetry'
        const jobCategory: JobCategory = ['drivers', 'vehicles', 'loads'].includes(type) ? 'vendor' : 'telemetry';

        const job = await this.jobService.createJob({
          tenantId,
          submittedBy,
          category: jobCategory,
          type,
          inputData: {
            integrationId: integration.id,
            integrationName: integration.displayName,
            integrationType: integration.integrationType,
            triggerSource: 'manual',
          },
        });

        const route = routeIntegrationJob(type as SyncJobType);
        const targetQueue = route.queue === QUEUE_NAMES.TELEMETRY ? this.telemetryQueue : this.vendorDataQueue;

        const payload: IntegrationSyncPayload = {
          jobId: job.id,
          tenantId,
          integrationId: integration.id,
          integrationName: integration.displayName,
          integrationType: integration.integrationType as IntegrationSyncPayload['integrationType'],
          type: type as SyncJobType,
          triggerSource: 'manual',
        };

        await targetQueue.add(route.jobName, buildJobEnvelope(payload, { tenantId: String(tenantId), source: 'api' }));

        jobIds.push(job.id);
      }
    }

    return jobIds;
  }

  /**
   * Like enqueueSyncJobs but adds a delay (ms) to each Bull job.
   */
  private async enqueueSyncJobsWithDelay(
    tenantId: number,
    submittedBy: number | null,
    integrations: {
      id: number;
      displayName: string;
      integrationType: string;
    }[],
    types: string[],
    delayMs: number,
  ): Promise<number[]> {
    const jobIds: number[] = [];

    for (const integration of integrations) {
      for (const type of types) {
        const jobCategory: JobCategory = ['drivers', 'vehicles', 'loads'].includes(type) ? 'vendor' : 'telemetry';

        const job = await this.jobService.createJob({
          tenantId,
          submittedBy,
          category: jobCategory,
          type,
          inputData: {
            integrationId: integration.id,
            integrationName: integration.displayName,
            integrationType: integration.integrationType,
            triggerSource: 'manual',
          },
        });

        const route = routeIntegrationJob(type as SyncJobType);
        const targetQueue = route.queue === QUEUE_NAMES.TELEMETRY ? this.telemetryQueue : this.vendorDataQueue;

        const payload: IntegrationSyncPayload = {
          jobId: job.id,
          tenantId,
          integrationId: integration.id,
          integrationName: integration.displayName,
          integrationType: integration.integrationType as IntegrationSyncPayload['integrationType'],
          type: type as SyncJobType,
          triggerSource: 'manual',
        };

        await targetQueue.add(route.jobName, buildJobEnvelope(payload, { tenantId: String(tenantId), source: 'api' }), {
          delay: delayMs,
        });

        jobIds.push(job.id);
      }
    }

    return jobIds;
  }
}
