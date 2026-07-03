import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantPlan, TenantStatus } from '@appshore/db';
import { TenantAddOnStatusEnum } from '@app/shared-types';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';

const TENANT_ADDON_STATUS = TenantAddOnStatusEnum.enum;

/** BullMQ job name owned by this handler. */
const TRIAL_EXPIRY_JOB_NAME = 'trial-expiry';

/**
 * Owns the `trial-expiry` maintenance job. Trial expiry cancels gifted add-ons
 * and transitions plan state. A QueueJobHandler — the owning queue dispatcher
 * routes by name. Keeps its service name because `expireTrials()` is also
 * callable directly.
 */
@Injectable()
export class TrialExpiryService implements QueueJobHandler {
  readonly jobNames = [TRIAL_EXPIRY_JOB_NAME];
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

    const now = new Date();

    // Only process ACTIVE tenants — skip PENDING_APPROVAL, REJECTED, SUSPENDED
    const expiredTrialTenants = await this.prisma.tenant.findMany({
      where: {
        plan: TenantPlan.TRIAL,
        status: TenantStatus.ACTIVE,
        trialEndsAt: { lte: now },
      },
      select: {
        id: true,
        tenantId: true,
        companyName: true,
        plan: true,
      },
    });

    if (expiredTrialTenants.length === 0) {
      this.logger.log('No expired trials found.');
      return { expired: 0 };
    }

    this.logger.log(`Found ${expiredTrialTenants.length} expired trial(s) to process.`);

    let expired = 0;

    for (const tenant of expiredTrialTenants) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.tenant.update({
            where: { id: tenant.id },
            data: {
              plan: TenantPlan.TRIAL_EXPIRED,
              planAssignedAt: now,
              planAssignedBy: 'system-cron',
            },
          });

          await tx.tenantPlanEvent.create({
            data: {
              id: generateUuidV7(),
              tenantId: tenant.id,
              fromPlan: TenantPlan.TRIAL,
              toPlan: TenantPlan.TRIAL_EXPIRED,
              changedBy: 'system-cron',
              reason: 'Trial period ended automatically',
            },
          });

          // Cancel all gifted add-ons — trial perks end with the trial
          await tx.tenantAddOn.updateMany({
            where: {
              tenantId: tenant.id,
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

        expired++;
        this.logger.log(`Trial expired for tenant: ${tenant.tenantId} (${tenant.companyName})`);
      } catch (err) {
        this.logger.error(`Failed to expire trial for tenant ${tenant.tenantId}: ${err?.message}`, err?.stack);
      }
    }

    this.logger.log(`Trial expiry complete. Expired ${expired}/${expiredTrialTenants.length} tenant(s).`);
    return { expired };
  }
}
