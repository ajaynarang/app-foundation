import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';
import { VendorCircuitBreakerService } from '../../../infrastructure/queue/vendor-circuit-breaker.service';
import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

/** BullMQ job name for the repeatable OAuth token refresh. */
const OAUTH_REFRESH_JOB_NAME = 'oauth-refresh';

interface OAuthRefreshJobData {
  tenantId: number;
  integrationId: string;
  vendor: string;
}

/**
 * Owns `oauth-refresh` on the `bulk-ops` queue. A plain handler — the owning
 * queue dispatcher routes by name. Circuit breaker: the vendor identifier comes
 * from the job payload — when the remote OAuth endpoint is down we stop hammering
 * its IdP while the rest of the queue keeps moving.
 */
@Injectable()
export class OAuthRefreshJobHandler implements QueueJobHandler {
  readonly jobNames = [OAUTH_REFRESH_JOB_NAME];
  private readonly logger = new Logger(OAuthRefreshJobHandler.name);

  constructor(
    private readonly authTokenService: AuthTokenService,
    private readonly prisma: PrismaService,
    private readonly circuitBreaker: VendorCircuitBreakerService,
  ) {}

  async run(bullJob: Job<JobEnvelope<OAuthRefreshJobData>>): Promise<void> {
    const { tenantId, integrationId, vendor } = bullJob.data.payload;

    if (await this.circuitBreaker.isOpen(vendor)) {
      throw new Error(`Vendor circuit open for ${vendor} — deferring OAuth refresh`);
    }

    // Tenant pause guard
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping OAuth refresh — tenant ${tenantId} is paused`);
      return;
    }

    this.logger.log(`Refreshing OAuth token for ${vendor} (tenant ${tenantId})`);

    const config = await this.prisma.integrationConfig.findFirst({
      where: { integrationId, tenantId },
    });

    if (!config) {
      this.logger.warn(`Integration ${integrationId} not found, skipping refresh`);
      return;
    }

    if (!config.isEnabled || config.status === 'NOT_CONFIGURED') {
      this.logger.log(`Integration ${integrationId} is disabled/unconfigured, skipping refresh`);
      return;
    }

    try {
      await this.authTokenService.refreshTokens(config.id);
      await this.circuitBreaker.recordSuccess(vendor);
    } catch (err) {
      const error = err as Error & { nonRetryable?: boolean };
      this.logger.error(`OAuth refresh failed for ${vendor} tenant ${tenantId}: ${error.message}`);

      // Non-retryable errors (e.g. invalid_grant) — don't trip the breaker;
      // bad credentials aren't a vendor health signal. Also don't re-throw.
      if (error.nonRetryable) {
        return;
      }

      await this.circuitBreaker.recordFailure(vendor);
      throw err;
    }
  }
}
