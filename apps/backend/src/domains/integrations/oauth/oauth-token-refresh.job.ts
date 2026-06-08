import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { QUEUE_NAMES } from '../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../infrastructure/queue/job-envelope.helper';
import { AuthTokenService } from './auth-token.service';
import { VENDOR_REGISTRY, getVendorOAuth } from '../vendor-registry';

/** BullMQ job name for the repeatable OAuth token refresh. */
const OAUTH_REFRESH_JOB_NAME = 'oauth-refresh';

@Injectable()
export class OAuthTokenRefreshJob implements OnModuleInit {
  private readonly logger = new Logger(OAuthTokenRefreshJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authTokenService: AuthTokenService,
    @InjectQueue(QUEUE_NAMES.BULK_OPS)
    private readonly bulkOpsQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.clearExistingRefreshJobs();
    await this.registerAllRefreshJobs();
  }

  private async clearExistingRefreshJobs() {
    try {
      const repeatableJobs = await this.bulkOpsQueue.getRepeatableJobs();
      for (const job of repeatableJobs) {
        if (job.name === OAUTH_REFRESH_JOB_NAME) {
          await this.bulkOpsQueue.removeRepeatableByKey(job.key);
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to clear existing OAuth refresh jobs: ${(err as Error).message}`);
    }
  }

  /**
   * Register refresh jobs for all active OAuth integrations.
   * Skips integrations that connected via API token (not OAuth).
   */
  private async registerAllRefreshJobs() {
    const configs = await this.prisma.integrationConfig.findMany({
      where: {
        isEnabled: true,
        status: { in: ['ACTIVE', 'CONFIGURED'] },
      },
      select: {
        id: true,
        integrationId: true,
        tenantId: true,
        vendor: true,
        credentials: true,
      },
    });

    let registered = 0;
    for (const config of configs) {
      const vendorMeta = VENDOR_REGISTRY[config.vendor];
      const oauthConfig = vendorMeta ? getVendorOAuth(vendorMeta) : undefined;
      if (!oauthConfig) continue;

      // Skip integrations that connected via API token, not OAuth
      if (config.credentials) {
        try {
          const creds = this.authTokenService.decryptCredentials(config.credentials);
          if (
            creds.authMethod === 'api_token' ||
            (!creds.authMethod && creds.apiToken && !creds.accessToken && !creds.access_token)
          ) {
            continue;
          }
        } catch {
          continue;
        }
      }

      await this.registerForIntegration(
        config.tenantId,
        config.integrationId,
        config.vendor,
        oauthConfig.tokenExpirySeconds,
      );
      registered++;
    }

    this.logger.log(`Registered OAuth token refresh for ${registered} integration(s)`);
  }

  /**
   * Register a token refresh job for a single integration.
   * Called at OAuth callback time and on module init.
   */
  async registerForIntegration(
    tenantId: number,
    integrationId: string,
    vendor: string,
    tokenExpirySeconds: number,
  ): Promise<void> {
    const refreshIntervalMs = Math.floor(tokenExpirySeconds * 0.8) * 1000;
    const jobId = `oauth-refresh-${vendor}-${tenantId}`;

    await this.bulkOpsQueue.add(
      OAUTH_REFRESH_JOB_NAME,
      buildJobEnvelope({ tenantId, integrationId, vendor }, { tenantId: String(tenantId), source: 'cron' }),
      { jobId, repeat: { every: refreshIntervalMs } },
    );

    this.logger.log(
      `Registered OAuth refresh for ${vendor} tenant ${tenantId} (every ${Math.floor(refreshIntervalMs / 1000)}s)`,
    );
  }

  /**
   * Remove refresh job for a vendor+tenant (called on disconnect).
   */
  async removeForIntegration(vendor: string, tenantId: number): Promise<void> {
    const repeatableJobs = await this.bulkOpsQueue.getRepeatableJobs();
    const jobId = `oauth-refresh-${vendor}-${tenantId}`;
    for (const job of repeatableJobs) {
      if (job.id === jobId) {
        await this.bulkOpsQueue.removeRepeatableByKey(job.key);
        this.logger.log(`Removed OAuth refresh for ${vendor} tenant ${tenantId}`);
      }
    }
  }
}
