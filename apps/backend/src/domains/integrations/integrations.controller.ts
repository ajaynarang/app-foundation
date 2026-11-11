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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '@appshore/platform/auth/guards/jwt-auth.guard';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { IntegrationSyncHistoryQueryDto, SyncHistoryQueryDto } from './dto/sync-history-query.dto';
import { QUEUE_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { JobService } from '@appshore/platform/infrastructure/queue/job.service';
import { buildJobEnvelope } from '@appshore/kernel/infrastructure/queue/job-envelope.helper';
import { JobStatusSchema } from '@app/shared-types';

/** BullMQ job name for a manually-triggered integration sync. */
const INTEGRATION_SYNC_JOB_NAME = 'integration-sync';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private integrationsService: IntegrationsService,
    private prisma: PrismaService,
    private jobService: JobService,
    @InjectQueue(QUEUE_NAMES.BULK_OPS) private bulkOpsQueue: Queue,
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
  async getUnifiedSyncHistory(@Request() req, @Query() query: SyncHistoryQueryDto) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getUnifiedSyncHistory(
      tenant.id,
      query.limit,
      query.offset,
      query.syncType,
      query.status,
    );
  }

  // ---- Parameterized routes (must come AFTER static routes) ----
  // Every :integrationId route resolves the caller's tenant and passes it to
  // the service, which scopes the lookup with where: { integrationId, tenantId }.
  // Cross-tenant ids get the same 404 as nonexistent ids (no information leak).

  @Get(':integration_id')
  async getIntegration(@Param('integration_id') integrationId: string, @Request() req) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getIntegration(integrationId, tenant.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createIntegration(@Body() dto: CreateIntegrationDto, @Request() req) {
    return this.integrationsService.createIntegration(req.user.tenantId, dto);
  }

  @Patch(':integration_id')
  async updateIntegration(
    @Param('integration_id') integrationId: string,
    @Body() dto: UpdateIntegrationDto,
    @Request() req,
  ) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.updateIntegration(integrationId, tenant.id, dto);
  }

  @Delete(':integration_id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIntegration(@Param('integration_id') integrationId: string, @Request() req): Promise<void> {
    const tenant = await this.getTenant(req);
    await this.integrationsService.deleteIntegration(integrationId, tenant.id);
  }

  @Post(':integration_id/test')
  @HttpCode(HttpStatus.OK)
  async testConnection(@Param('integration_id') integrationId: string, @Request() req) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.testConnection(integrationId, tenant.id);
  }

  @Post(':integration_id/sync')
  @HttpCode(HttpStatus.ACCEPTED)
  async triggerSync(@Param('integration_id') integrationId: string, @Request() req) {
    const tenant = await this.getTenant(req);
    const integration = await this.prisma.integrationConfig.findFirst({
      where: { integrationId, tenantId: tenant.id },
      select: {
        id: true,
        tenantId: true,
        integrationType: true,
      },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    // Enqueue a generic sync job on the slow-lane BULK_OPS queue. Register a
    // handler for INTEGRATION_SYNC_JOB_NAME to do the actual vendor pull.
    const job = await this.jobService.createJob({
      tenantId: integration.tenantId,
      submittedBy: req.user.dbId ?? null,
      category: 'maintenance',
      type: INTEGRATION_SYNC_JOB_NAME,
      inputData: { integrationId, triggerSource: 'manual' },
    });

    await this.bulkOpsQueue.add(
      INTEGRATION_SYNC_JOB_NAME,
      buildJobEnvelope(
        {
          jobId: job.id,
          tenantId: integration.tenantId,
          integrationId,
          triggerSource: 'manual' as const,
        },
        { tenantId: String(integration.tenantId), source: 'api' },
      ),
    );

    // 202 with the record to poll: the sync runs on the queue. Follow the job or the sync history.
    return { jobId: job.id, status: JobStatusSchema.enum.QUEUED };
  }

  @Get(':integration_id/sync-history')
  async getSyncHistory(
    @Param('integration_id') integrationId: string,
    @Request() req,
    @Query() query: IntegrationSyncHistoryQueryDto,
  ) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getSyncHistory(integrationId, tenant.id, query.limit, query.offset);
  }

  @Get(':integration_id/sync-history/stats')
  async getSyncStats(@Param('integration_id') integrationId: string, @Request() req) {
    const tenant = await this.getTenant(req);
    return this.integrationsService.getSyncStats(integrationId, tenant.id);
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
}
