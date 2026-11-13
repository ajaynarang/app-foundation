import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { VendorCircuitBreakerService } from '@appshore/platform/infrastructure/queue/vendor-circuit-breaker.service';
import { AuthTokenService } from './auth-token.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { CronRun } from '@appshore/kernel/infrastructure/queue/job-events';
import { APP_JOB_NAMES } from '../../../platform-glue/queue/job-names';

/** BullMQ job name for the repeatable OAuth token refresh. */
const OAUTH_REFRESH_JOB_NAME = APP_JOB_NAMES.BULK_OPS.OAUTH_REFRESH;

interface OAuthRefreshJobData {
  tenantId: number;
  integrationId: string;
  vendor: string;
}

/**
 * Owns `oauth-refresh` on the `bulk-ops` queue. A plain handler — the BulkOpsQueueProcessor
 * dispatcher routes by name. Each run refreshes one tenant's integration and is one
 * `CronRun`. Circuit breaker: the vendor identifier comes
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

    // Every run, skipped or not, completes a CronRun: the repeatable stays registered (re-enabling needs no restart),
    // so the expected-interval series stays, and a deliberate skip must not read as a missed cron.
    const cron = new CronRun(this.logger, OAUTH_REFRESH_JOB_NAME);

    // Tenant pause guard
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenant?.jobsPaused) {
      this.logger.log(`Skipping OAuth refresh — tenant ${tenantId} is paused`);
      cron.complete({ vendor, skipped: 'tenant jobs paused' });
      return;
    }

    this.logger.log(`Refreshing OAuth token for ${vendor} (tenant ${tenantId})`);

    const config = await this.prisma.integrationConfig.findFirst({
      where: { integrationId, tenantId },
    });

    if (!config) {
      this.logger.warn(`Integration ${integrationId} not found, skipping refresh`);
      cron.complete({ vendor, skipped: 'integration not found' });
      return;
    }

    if (!config.isEnabled || config.status === 'NOT_CONFIGURED') {
      this.logger.log(`Integration ${integrationId} is disabled/unconfigured, skipping refresh`);
      cron.complete({ vendor, skipped: 'integration disabled or not configured' });
      return;
    }

    try {
      await this.authTokenService.refreshTokens(config.id);
      await this.circuitBreaker.recordSuccess(vendor);
      cron.succeeded();
      cron.complete({ vendor });
    } catch (err) {
      const error = err as Error & { nonRetryable?: boolean };

      // Non-retryable errors (e.g. invalid_grant) — don't trip the breaker;
      // bad credentials aren't a vendor health signal. Also don't re-throw: the
      // run is counted as this tenant's failure.
      if (error.nonRetryable) {
        cron.failed(tenantId, err);
        cron.complete({ vendor });
        return;
      }

      // A retryable failure goes back to BullMQ, which logs and reports it as a failed job.
      this.logger.warn(`OAuth refresh failed for ${vendor} tenant ${tenantId}; BullMQ will retry`);
      await this.circuitBreaker.recordFailure(vendor);
      throw err;
    }
  }
}
