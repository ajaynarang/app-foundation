import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { TenantPlan, TenantStatus } from '@appshore/db';
import { TenantAddOnStatusEnum } from '@app/shared-types';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import type { QueueJobHandler } from '@appshore/kernel/infrastructure/queue/job-handler.contract';
import { BULK_OPS_JOB_NAMES } from '@appshore/kernel/infrastructure/queue/queue.constants';
import { CronRun } from '@appshore/kernel/infrastructure/queue/job-events';
import { forEachTenant } from '@appshore/kernel/infrastructure/rls/system-scope';

const TENANT_ADDON_STATUS = TenantAddOnStatusEnum.enum;

/**
 * Owns the `trial-expiry` maintenance cron on `bulk-ops`. Trial expiry cancels gifted add-ons
 * and transitions plan state. A QueueJobHandler — the BulkOpsQueueProcessor dispatcher
 * routes by name. Keeps its service name because `expireTrials()` is also
 * callable directly. Each run is one `CronRun`: a tenant that fails is counted and
 * reported, and the run goes on to the next.
 */
@Injectable()
export class TrialExpiryService implements QueueJobHandler {
  readonly jobNames = [BULK_OPS_JOB_NAMES.TRIAL_EXPIRY];
  private readonly logger = new Logger(TrialExpiryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async run(_job: Job<JobEnvelope<unknown>>): Promise<{ expired: number }> {
    return this.expireTrials();
  }

  /**
   * Expires trials for all active tenants whose trial period has ended.
   * Transitions TRIAL → TRIAL_EXPIRED, creates audit events and system alerts.
   */
  async expireTrials(): Promise<{ expired: number }> {
    this.logger.log('Running trial expiry check...');
    const cron = new CronRun(this.logger, BULK_OPS_JOB_NAMES.TRIAL_EXPIRY);

    const now = new Date();
    let expired = 0;

    // Lists ACTIVE trial tenants of every tenant under the declared reason, then expires each as its own tenant.
    // Only ACTIVE tenants: PENDING_APPROVAL, REJECTED and SUSPENDED are skipped.
    await forEachTenant(
      'cron.trial-expiry',
      async () => {
        const rows = await this.prisma.tenant.findMany({
          where: {
            plan: TenantPlan.TRIAL,
            status: TenantStatus.ACTIVE,
            trialEndsAt: { lte: now },
          },
          select: {
            id: true,
            tenantId: true,
            plan: true,
          },
        });
        if (rows.length > 0) this.logger.log(`Found ${rows.length} expired trial(s) to process.`);
        return rows;
      },
      async (tenant) => {
        try {
          await this.expireOne(tenant.id, now);
          expired++;
          cron.succeeded();
          this.logger.log(`Trial expired for tenant: ${tenant.tenantId}`);
        } catch (err) {
          cron.failed(tenant.id, err, tenant.tenantId);
        }
      },
    );

    cron.complete({ expired });
    return { expired };
  }

  /** One tenant: TRIAL → TRIAL_EXPIRED, the plan event, and its gifted add-ons cancelled, in one transaction. */
  private async expireOne(tenantDbId: number, now: Date): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantDbId },
        data: {
          plan: TenantPlan.TRIAL_EXPIRED,
          planAssignedAt: now,
          planAssignedBy: 'system-cron',
        },
      });

      await tx.tenantPlanEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenantDbId,
          fromPlan: TenantPlan.TRIAL,
          toPlan: TenantPlan.TRIAL_EXPIRED,
          changedBy: 'system-cron',
          reason: 'Trial period ended automatically',
        },
      });

      // Cancel all gifted add-ons — trial perks end with the trial
      await tx.tenantAddOn.updateMany({
        where: {
          tenantId: tenantDbId,
          source: 'gifted',
          status: TENANT_ADDON_STATUS.ACTIVE,
        },
        data: {
          status: TENANT_ADDON_STATUS.CANCELLED,
          cancelledAt: now,
          cancelledBy: 'system-trial-expiry',
        },
      });
    });
  }
}
