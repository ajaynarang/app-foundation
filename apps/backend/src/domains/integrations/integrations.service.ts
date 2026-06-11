import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobStatusSchema } from '@app/shared-types';
import { PrismaService } from '../../infrastructure/database/prisma.service';

const JOB_STATUS = JobStatusSchema.enum;
import { CredentialsService } from './credentials/credentials.service';
import { IntegrationDataService } from './services/integration-data.service';
import { CreateIntegrationDto } from './dto/create-integration.dto';
import { UpdateIntegrationDto } from './dto/update-integration.dto';
import { VENDOR_REGISTRY, getVendorCredentialFields, type ConnectionMethod } from './vendor-registry';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants';
import { JobService } from '../../infrastructure/queue/job.service';
import { buildJobEnvelope } from '../../infrastructure/queue/job-envelope.helper';
import { randomUUID } from 'crypto';

/** BullMQ job name for a manually-triggered integration sync. */
const INTEGRATION_SYNC_JOB_NAME = 'integration-sync';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private prisma: PrismaService,
    private credentials: CredentialsService,
    private integrationManager: IntegrationDataService,
    private readonly jobService: JobService,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
  ) {}

  /**
   * Get vendor registry merged with DB runtime config.
   * Filters unavailable vendors, strips envPrefix from OAuth config,
   * applies display order and custom display names.
   */
  async getVendorRegistry() {
    const dbConfigs = await this.prisma.vendorConfig.findMany();
    const configMap = new Map(dbConfigs.map((c) => [c.vendorId, c]));

    return Object.values(VENDOR_REGISTRY)
      .map((vendor) => {
        const dbConfig = configMap.get(vendor.id);

        // Filter out unavailable vendors
        if (dbConfig && !dbConfig.isAvailable) return null;

        // Process connection methods: strip envPrefix, optionally remove OAuth
        const connectionMethods: ConnectionMethod[] = vendor.connectionMethods
          .map((method) => {
            if (method.type === 'oauth') {
              // Strip OAuth entirely if disabled in DB
              if (dbConfig && !dbConfig.isOAuthEnabled) return null;
              // Strip envPrefix (security: don't expose env var names)
              const { envPrefix: _envPrefix, ...safeConfig } = method.config;
              return { type: 'oauth' as const, config: safeConfig };
            }
            return method;
          })
          .filter(Boolean) as ConnectionMethod[];

        return {
          ...vendor,
          connectionMethods,
          displayName: dbConfig?.customDisplayName ?? vendor.displayName,
          displayOrder: dbConfig?.displayOrder ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  }

  /**
   * Get integration health summary for a tenant.
   *
   * Returns per-integration status, active sync jobs, and the last successful
   * sync per integration type for the tenant's configured integrations.
   */
  async getHealthSummary(tenantId: number) {
    const [integrations, activeJobs] = await Promise.all([
      this.prisma.integrationConfig.findMany({
        where: { tenantId },
        select: {
          integrationId: true,
          integrationType: true,
          vendor: true,
          displayName: true,
          isEnabled: true,
          status: true,
          lastSyncAt: true,
          lastSuccessAt: true,
          lastErrorAt: true,
          lastErrorMessage: true,
        },
      }),
      // Active syncs from jobs table
      this.prisma.job.findMany({
        where: {
          tenantId,
          category: 'maintenance',
          type: INTEGRATION_SYNC_JOB_NAME,
          status: { in: [JOB_STATUS.QUEUED, JOB_STATUS.PROCESSING] },
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
        select: { type: true, inputData: true, startedAt: true },
      }),
    ]);

    const formatIntegration = (i: (typeof integrations)[0]) => ({
      id: i.integrationId,
      vendor: i.vendor,
      displayName: i.displayName,
      isEnabled: i.isEnabled,
      status: i.status,
      lastSyncAt: i.lastSyncAt?.toISOString() ?? null,
      lastSuccessAt: i.lastSuccessAt?.toISOString() ?? null,
      hasError: !!i.lastErrorAt && (!i.lastSuccessAt || i.lastErrorAt > i.lastSuccessAt),
      lastErrorMessage: i.lastErrorMessage,
    });

    // Get last successful sync per type from jobs table
    const lastSyncByType = await this.prisma.job.groupBy({
      by: ['type'],
      where: {
        tenantId,
        category: 'maintenance',
        type: INTEGRATION_SYNC_JOB_NAME,
        status: JOB_STATUS.COMPLETED,
      },
      _max: {
        completedAt: true,
      },
    });

    return {
      hasIntegrations: integrations.length > 0,
      activeSyncs: activeJobs.map((j) => ({
        type: (j.inputData as Record<string, any>)?.integrationType ?? 'UNKNOWN',
        vendor: (j.inputData as Record<string, any>)?.integrationName ?? 'UNKNOWN',
        syncType: j.type?.toUpperCase(),
        startedAt: j.startedAt?.toISOString() ?? new Date().toISOString(),
      })),
      configuredTypes: integrations.map((i) => i.integrationType),
      integrations: integrations.map(formatIntegration),
      lastSyncByType: Object.fromEntries(
        lastSyncByType.map((entry) => [entry.type?.toUpperCase(), entry._max.completedAt?.toISOString() ?? null]),
      ),
    };
  }

  /**
   * List all integrations for a tenant
   */
  async listIntegrations(tenantId: number | string) {
    // If tenantId is a string (from JWT), look up the numeric ID
    let numericTenantId: number;
    if (typeof tenantId === 'string') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId },
        select: { id: true },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      numericTenantId = tenant.id;
    } else {
      numericTenantId = tenantId;
    }

    const integrations = await this.prisma.integrationConfig.findMany({
      where: { tenantId: numericTenantId },
      select: {
        integrationId: true,
        integrationType: true,
        vendor: true,
        displayName: true,
        isEnabled: true,
        status: true,
        lastSyncAt: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastErrorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return integrations.map((i) => ({
      id: i.integrationId,
      integrationType: i.integrationType,
      vendor: i.vendor,
      displayName: i.displayName,
      isEnabled: i.isEnabled,
      status: i.status,
      lastSyncAt: i.lastSyncAt?.toISOString(),
      lastSuccessAt: i.lastSuccessAt?.toISOString(),
      lastErrorAt: i.lastErrorAt?.toISOString(),
      lastErrorMessage: i.lastErrorMessage,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
    }));
  }

  /**
   * Assert an integration exists AND belongs to the tenant.
   * Returns the integration row or throws the same 404 for "doesn't exist"
   * and "belongs to another tenant" (no cross-tenant information leak).
   */
  private async assertIntegrationInTenant(integrationId: string, tenantId: number) {
    const integration = await this.prisma.integrationConfig.findFirst({
      where: { integrationId, tenantId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    return integration;
  }

  /**
   * Get a specific integration (tenant-scoped)
   */
  async getIntegration(integrationId: string, tenantId: number) {
    const integration = await this.assertIntegrationInTenant(integrationId, tenantId);

    return {
      id: integration.integrationId,
      integrationType: integration.integrationType,
      vendor: integration.vendor,
      displayName: integration.displayName,
      isEnabled: integration.isEnabled,
      status: integration.status,
      lastSyncAt: integration.lastSyncAt?.toISOString(),
      lastSuccessAt: integration.lastSuccessAt?.toISOString(),
      lastErrorAt: integration.lastErrorAt?.toISOString(),
      lastErrorMessage: integration.lastErrorMessage,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
    };
  }

  /**
   * Create new integration
   */
  async createIntegration(tenantId: number | string, dto: CreateIntegrationDto) {
    // Validate vendor exists in registry
    const vendorMeta = VENDOR_REGISTRY[dto.vendor];
    if (!vendorMeta) {
      throw new BadRequestException(`Unsupported vendor: ${dto.vendor}`);
    }

    // Validate required credentials provided
    const credentialFields = getVendorCredentialFields(vendorMeta);
    const missingFields = credentialFields.filter((f) => f.required && !dto.credentials?.[f.name]);
    if (missingFields.length > 0) {
      throw new BadRequestException(`Missing required credentials: ${missingFields.map((f) => f.name).join(', ')}`);
    }

    // If tenantId is a string (from JWT), look up the numeric ID
    let numericTenantId: number;
    if (typeof tenantId === 'string') {
      const tenant = await this.prisma.tenant.findUnique({
        where: { tenantId },
        select: { id: true },
      });
      if (!tenant) {
        throw new NotFoundException('Tenant not found');
      }
      numericTenantId = tenant.id;
    } else {
      numericTenantId = tenantId;
    }

    // Check if integration already exists
    const existing = await this.prisma.integrationConfig.findFirst({
      where: {
        tenantId: numericTenantId,
        integrationType: dto.integrationType,
        vendor: dto.vendor,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Integration already exists for ${vendorMeta.displayName}. Please edit the existing integration instead.`,
      );
    }

    // Encrypt credentials if provided (dynamically encrypt all credential fields)
    let encryptedCredentials = null;
    if (dto.credentials) {
      encryptedCredentials = {};
      for (const [key, value] of Object.entries(dto.credentials)) {
        encryptedCredentials[key] = value ? this.credentials.encrypt(value) : value;
      }
    }

    const integration = await this.prisma.integrationConfig.create({
      data: {
        integrationId: `int_${randomUUID()}`,
        tenantId: numericTenantId,
        integrationType: dto.integrationType,
        vendor: dto.vendor,
        displayName: dto.displayName,
        credentials: encryptedCredentials,
        isEnabled: true,
        status: 'CONFIGURED',
      },
    });

    // Auto-trigger an initial sync on the slow-lane BULK_OPS queue. Register a
    // handler for INTEGRATION_SYNC_JOB_NAME to do the actual vendor pull.
    try {
      const job = await this.jobService.createJob({
        tenantId: numericTenantId,
        submittedBy: null,
        category: 'maintenance',
        type: INTEGRATION_SYNC_JOB_NAME,
        inputData: {
          integrationId: integration.id,
          integrationName: integration.displayName,
          integrationType: integration.integrationType,
          triggerSource: 'auto',
        },
      });

      await this.bulkOpsQueue.add(
        INTEGRATION_SYNC_JOB_NAME,
        buildJobEnvelope(
          {
            jobId: job.id,
            tenantId: numericTenantId,
            integrationId: integration.id,
            triggerSource: 'auto' as const,
          },
          { tenantId: String(numericTenantId), source: 'api' },
        ),
      );

      this.logger.log(`Auto-triggered initial sync for integration ${integration.integrationId}`);
    } catch (error) {
      this.logger.warn(`Failed to auto-trigger initial sync: ${(error as Error).message}`);
      // Non-fatal — a manual sync or scheduled job will catch it.
    }

    return {
      id: integration.integrationId,
      integrationType: integration.integrationType,
      vendor: integration.vendor,
      displayName: integration.displayName,
      isEnabled: integration.isEnabled,
      status: integration.status,
      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
    };
  }

  /**
   * Update integration (tenant-scoped)
   */
  async updateIntegration(integrationId: string, tenantId: number, dto: UpdateIntegrationDto) {
    const existing = await this.assertIntegrationInTenant(integrationId, tenantId);

    // Encrypt credentials if provided (dynamically encrypt all credential fields)
    let encryptedCredentials = existing.credentials;
    if (dto.credentials) {
      encryptedCredentials = { ...(existing.credentials as any) };
      for (const [key, value] of Object.entries(dto.credentials)) {
        if (value) {
          encryptedCredentials[key] = this.credentials.encrypt(value);
        }
      }
    }

    const updated = await this.prisma.integrationConfig.update({
      where: { integrationId },
      data: {
        displayName: dto.displayName,
        credentials: encryptedCredentials,
        isEnabled: dto.isEnabled,
      },
    });

    return {
      id: updated.integrationId,
      integrationType: updated.integrationType,
      vendor: updated.vendor,
      displayName: updated.displayName,
      isEnabled: updated.isEnabled,
      status: updated.status,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Delete integration (tenant-scoped)
   */
  async deleteIntegration(integrationId: string, tenantId: number) {
    await this.assertIntegrationInTenant(integrationId, tenantId);

    await this.prisma.integrationConfig.delete({
      where: { integrationId },
    });

    return { success: true };
  }

  /**
   * Test connection (tenant-scoped)
   */
  async testConnection(integrationId: string, tenantId: number) {
    await this.assertIntegrationInTenant(integrationId, tenantId);

    const success = await this.integrationManager.testConnection(integrationId);

    return {
      success,
      message: success ? 'Connection successful' : 'Connection failed - check credentials',
    };
  }

  /**
   * Get sync history for an integration (from jobs table, tenant-scoped)
   */
  async getSyncHistory(integrationId: string, tenantId: number, limit: number = 50, offset: number = 0) {
    const integration = await this.assertIntegrationInTenant(integrationId, tenantId);

    const jobs = await this.prisma.job.findMany({
      where: {
        tenantId,
        category: { in: ['vendor', 'telemetry', 'finance'] },
        inputData: { path: ['integrationId'], equals: integrationId },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return jobs.map((job) => this.mapJobToSyncHistoryItem(job, integration));
  }

  /**
   * Get sync statistics for an integration (from jobs table, tenant-scoped)
   */
  async getSyncStats(integrationId: string, tenantId: number) {
    await this.assertIntegrationInTenant(integrationId, tenantId);

    const where = {
      tenantId,
      category: { in: ['vendor', 'telemetry', 'finance'] },
      inputData: {
        path: ['integrationId'] as string[],
        equals: integrationId,
      },
    };

    const [total, successful, failed] = await Promise.all([
      this.prisma.job.count({ where }),
      this.prisma.job.count({ where: { ...where, status: JOB_STATUS.COMPLETED } }),
      this.prisma.job.count({ where: { ...where, status: JOB_STATUS.FAILED } }),
    ]);

    return {
      totalSyncs: total,
      successfulSyncs: successful,
      failedSyncs: failed,
      successRate: total > 0 ? (successful / total) * 100 : 0,
    };
  }

  /**
   * Get unified sync history across all integrations for a tenant.
   * Powers the Sync Details slide-over panel.
   */
  async getUnifiedSyncHistory(
    tenantId: number,
    limit: number = 20,
    offset: number = 0,
    syncType?: string,
    status?: string,
  ) {
    const where: any = {
      tenantId,
      category: { in: ['vendor', 'telemetry'] },
    };

    if (syncType) {
      where.type = syncType.toLowerCase();
    }
    if (status) {
      where.status = this.mapSyncStatusToJobStatus(status);
    }

    const [jobs, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.job.count({ where }),
    ]);

    // Fetch integration details for display
    const integrationIds = [
      ...new Set(jobs.map((j) => (j.inputData as Record<string, any>)?.integrationId).filter(Boolean)),
    ];

    const integrations =
      integrationIds.length > 0
        ? await this.prisma.integrationConfig.findMany({
            where: { id: { in: integrationIds as number[] } },
            select: {
              id: true,
              vendor: true,
              integrationType: true,
              displayName: true,
            },
          })
        : [];

    const integrationMap = new Map(integrations.map((i) => [i.id, i]));

    return {
      items: jobs.map((job) => {
        const inputData = job.inputData as Record<string, any>;
        const integration = integrationMap.get(inputData?.integrationId);
        return this.mapJobToSyncHistoryItem(job, integration ?? null);
      }),
      total,
      limit,
      offset,
    };
  }

  // ---- Helpers ----

  /**
   * Map a Job record to the sync history item shape expected by the frontend.
   */
  private mapJobToSyncHistoryItem(
    job: any,
    integration: {
      vendor?: string;
      integrationType?: string;
      displayName?: string;
    } | null,
  ) {
    const inputData = job.inputData;
    const resultData = job.resultData;

    return {
      id: job.id,
      syncType: job.type?.toUpperCase() ?? 'UNKNOWN',
      triggerSource: inputData?.triggerSource ?? 'scheduled',
      status: this.mapJobStatusToSyncStatus(job.status),
      startedAt: job.startedAt?.toISOString() ?? job.createdAt?.toISOString(),
      completedAt: job.completedAt?.toISOString() ?? null,
      durationMs:
        job.startedAt && job.completedAt
          ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
          : null,
      recordsProcessed: resultData?.recordsProcessed ?? 0,
      recordsCreated: resultData?.recordsCreated ?? 0,
      recordsUpdated: resultData?.recordsExisting ?? 0,
      errorDetails: job.errorDetails ?? (job.errorMessage ? { message: job.errorMessage } : null),
      vendor: integration?.vendor ?? inputData?.integrationName ?? 'UNKNOWN',
      integrationType: integration?.integrationType ?? inputData?.integrationType ?? 'UNKNOWN',
      displayName: integration?.displayName ?? inputData?.integrationName ?? 'UNKNOWN',
    };
  }

  private mapJobStatusToSyncStatus(jobStatus: string): string {
    switch (jobStatus) {
      case 'queued':
      case 'processing':
        return 'running';
      case 'completed':
        return 'success';
      case 'failed':
        return 'failed';
      default:
        return jobStatus;
    }
  }

  private mapSyncStatusToJobStatus(syncStatus: string): string | { in: string[] } {
    switch (syncStatus) {
      case 'running':
        return { in: ['queued', 'processing'] };
      case 'success':
        return 'completed';
      case 'failed':
        return 'failed';
      default:
        return syncStatus;
    }
  }
}
