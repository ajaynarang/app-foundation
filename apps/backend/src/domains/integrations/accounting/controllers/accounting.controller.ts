import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  UseGuards,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JwtAuthGuard } from '../../../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { QUEUE_NAMES, FINANCE_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { QuickBooksApiClient } from '../vendors/quickbooks/quickbooks-api.client';
import { JobStatusSchema } from '@sally/shared-types';
import { AccountingSyncService } from '../services/accounting-sync.service';
import { AccountingMappingService } from '../services/accounting-mapping.service';
import { AccountingSyncJobData } from '../accounting-job.types';
import { AuthTokenService } from '../../oauth/auth-token.service';

const JOB_STATUS = JobStatusSchema.enum;

@Controller('accounting')
@UseGuards(JwtAuthGuard)
@Roles(UserRole.ADMIN, UserRole.OWNER)
export class AccountingController extends BaseTenantController {
  private readonly logger = new Logger(AccountingController.name);

  constructor(
    prisma: PrismaService,
    private readonly jobService: JobService,
    private readonly qbApiClient: QuickBooksApiClient,
    private readonly syncService: AccountingSyncService,
    private readonly mappingService: AccountingMappingService,
    private readonly authTokenService: AuthTokenService,
    @InjectQueue(QUEUE_NAMES.FINANCE)
    private readonly financeQueue: Queue,
  ) {
    super(prisma);
  }

  // ---------------------------------------------------------------------------
  // Status
  // ---------------------------------------------------------------------------

  @Get('status')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async getStatus(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);

    const config = await this.prisma.integrationConfig.findFirst({
      where: { tenantId: tenantDbId, integrationType: 'ACCOUNTING' },
    });

    if (!config || !config.credentials) {
      return { connected: false };
    }

    // Use cached company name from syncMetadata if available
    const meta = config.syncMetadata as Record<string, unknown> | null;
    const cachedCompanyName = (meta?.companyName as string | undefined) ?? null;
    const realmId = (config as any).realmId ?? null;

    if (cachedCompanyName) {
      return {
        connected: true,
        vendor: 'QUICKBOOKS',
        companyName: cachedCompanyName,
        realmId,
        lastSyncedAt: config.lastSyncAt?.toISOString() ?? null,
        status: config.status,
      };
    }

    // Fetch company name from QB (only on first status check, then cache it)
    try {
      const creds = this.authTokenService.decryptCredentials(config.credentials);
      const accessToken = creds.accessToken ?? creds.access_token;
      const credRealmId = creds.realmId ?? creds.realm_id;

      const companyInfo = await this.qbApiClient.fetchCompanyInfo(accessToken, credRealmId);

      const companyName = companyInfo.CompanyInfo.CompanyName;

      await this.prisma.integrationConfig.update({
        where: { id: config.id },
        data: { syncMetadata: { ...(meta ?? {}), companyName } },
      });

      return {
        connected: true,
        vendor: 'QUICKBOOKS',
        companyName,
        realmId: credRealmId,
        lastSyncedAt: config.lastSyncAt?.toISOString() ?? null,
        status: config.status,
      };
    } catch {
      return {
        connected: true,
        vendor: 'QUICKBOOKS',
        companyName: null,
        realmId,
        lastSyncedAt: config.lastSyncAt?.toISOString() ?? null,
        status: config.status,
        error: 'Failed to fetch company info',
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Entity Mappings
  // ---------------------------------------------------------------------------

  @Get('mappings/:entityType')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async listMappings(@CurrentUser() user: any, @Param('entityType') entityTypeParam: string) {
    const tenantDbId = await this.getTenantDbId(user);

    const allowed = ['customer', 'vendor', 'class'];
    const entityType = entityTypeParam.toLowerCase();
    if (!allowed.includes(entityType)) {
      throw new BadRequestException(`Invalid entity type: ${entityTypeParam}`);
    }
    const config = await this.getIntegrationConfig(tenantDbId);
    return this.mappingService.listEntityMappings(tenantDbId, config.integrationId, entityType);
  }

  @Get('external-entities/:entityType')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async listExternalEntities(@CurrentUser() user: any, @Param('entityType') entityTypeParam: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const entityType = entityTypeParam.toLowerCase();
    const allowed = ['customer', 'vendor', 'class'];
    if (!allowed.includes(entityType)) {
      throw new BadRequestException(`Invalid entity type: ${entityTypeParam}`);
    }
    const config = await this.getIntegrationConfig(tenantDbId);
    return this.mappingService.listExternalEntities(config.integrationId, entityType);
  }

  @Patch('mappings/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async updateMapping(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { externalId: string; externalName: string },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.mappingService.updateMapping(parseInt(id, 10), tenantDbId, body.externalId, body.externalName);
  }

  @Post('mappings/:id/confirm')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async confirmMapping(@CurrentUser() user: any, @Param('id') id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.mappingService.confirmMapping(parseInt(id, 10), tenantDbId);
  }

  // ---------------------------------------------------------------------------
  // Account Mappings
  // ---------------------------------------------------------------------------

  @Get('account-mappings')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async listAccountMappings(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const config = await this.getIntegrationConfig(tenantDbId);
    return this.mappingService.listAccountMappings(tenantDbId, config.integrationId);
  }

  @Patch('account-mappings/:id')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async updateAccountMapping(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { externalAccountId: string; externalAccountName: string },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.mappingService.updateAccountMapping(
      parseInt(id, 10),
      tenantDbId,
      body.externalAccountId,
      body.externalAccountName,
    );
  }

  // ---------------------------------------------------------------------------
  // Sync Endpoints
  // ---------------------------------------------------------------------------

  @Post('sync/invoice/:invoiceId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async syncInvoice(@CurrentUser() user: any, @Param('invoiceId') invoiceNumber: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const config = await this.getIntegrationConfig(tenantDbId);

    // Guard: prevent duplicate sync for the same entity
    const activeJob = await this.prisma.job.findFirst({
      where: {
        tenantId: tenantDbId,
        category: 'finance',
        status: { in: [JOB_STATUS.QUEUED, JOB_STATUS.PROCESSING] },
        inputData: { path: ['entityId'], equals: invoiceNumber },
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (activeJob) {
      return {
        success: false,
        message: 'A sync for this invoice is already in progress.',
        jobId: activeJob.id,
      };
    }

    const job = await this.jobService.createJob({
      tenantId: tenantDbId,
      submittedBy: user.dbId ?? null,
      category: 'finance',
      type: FINANCE_JOB_NAMES.INVOICE,
      inputData: {
        integrationId: config.integrationId,
        entityId: invoiceNumber,
        triggerSource: 'manual',
      },
    });

    const invoicePayload: AccountingSyncJobData = {
      jobId: job.id,
      tenantId: tenantDbId,
      integrationId: config.integrationId,
      type: 'invoice',
      triggerSource: 'manual',
      entityId: invoiceNumber,
    };
    await this.financeQueue.add(
      FINANCE_JOB_NAMES.INVOICE,
      buildJobEnvelope(invoicePayload, { tenantId: String(tenantDbId), source: 'api' }),
    );

    return { success: true, jobId: job.id };
  }

  @Post('sync/settlement/:settlementId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async syncSettlement(@CurrentUser() user: any, @Param('settlementId') settlementId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const config = await this.getIntegrationConfig(tenantDbId);

    // Guard: prevent duplicate sync for the same entity
    const activeJob = await this.prisma.job.findFirst({
      where: {
        tenantId: tenantDbId,
        category: 'finance',
        status: { in: [JOB_STATUS.QUEUED, JOB_STATUS.PROCESSING] },
        inputData: { path: ['entityId'], equals: settlementId },
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (activeJob) {
      return {
        success: false,
        message: 'A sync for this settlement is already in progress.',
        jobId: activeJob.id,
      };
    }

    const job = await this.jobService.createJob({
      tenantId: tenantDbId,
      submittedBy: user.dbId ?? null,
      category: 'finance',
      type: FINANCE_JOB_NAMES.SETTLEMENT,
      inputData: {
        integrationId: config.integrationId,
        entityId: settlementId,
        triggerSource: 'manual',
      },
    });

    const settlementPayload: AccountingSyncJobData = {
      jobId: job.id,
      tenantId: tenantDbId,
      integrationId: config.integrationId,
      type: 'settlement',
      triggerSource: 'manual',
      entityId: settlementId,
    };
    await this.financeQueue.add(
      FINANCE_JOB_NAMES.SETTLEMENT,
      buildJobEnvelope(settlementPayload, { tenantId: String(tenantDbId), source: 'api' }),
    );

    return { success: true, jobId: job.id };
  }

  // ---------------------------------------------------------------------------
  // Setup / Initial Sync
  // ---------------------------------------------------------------------------

  @Post('setup/initial-sync')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  async triggerInitialSync(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    const config = await this.getIntegrationConfig(tenantDbId);

    const job = await this.jobService.createJob({
      tenantId: tenantDbId,
      submittedBy: user.dbId ?? null,
      category: 'finance',
      type: FINANCE_JOB_NAMES.INITIAL_SYNC,
      inputData: {
        integrationId: config.integrationId,
        triggerSource: 'manual',
      },
    });

    const initialSyncPayload: AccountingSyncJobData = {
      jobId: job.id,
      tenantId: tenantDbId,
      integrationId: config.integrationId,
      type: 'initial-sync',
      triggerSource: 'manual',
    };
    await this.financeQueue.add(
      FINANCE_JOB_NAMES.INITIAL_SYNC,
      buildJobEnvelope(initialSyncPayload, { tenantId: String(tenantDbId), source: 'api' }),
    );

    return {
      success: true,
      jobId: job.id,
      message: 'Initial entity sync started',
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async getIntegrationConfig(tenantId: number) {
    const config = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId,
        integrationType: 'ACCOUNTING',
        isEnabled: true,
      },
    });
    if (!config) {
      throw new NotFoundException('No active QuickBooks integration found');
    }
    return config;
  }
}
