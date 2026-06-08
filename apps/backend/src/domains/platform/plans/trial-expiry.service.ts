import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import type { JobEnvelope } from '@app/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantPlan, TenantStatus } from '@prisma/client';
import { TenantAddOnStatusEnum } from '@app/shared-types';
import { generateId } from '../../../shared/utils/id-generator';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';
import { FINANCE_JOB_NAMES } from '../../../infrastructure/queue/queue.constants';
import type { QueueJobHandler } from '../../../infrastructure/queue/job-handler.contract';

const TENANT_ADDON_STATUS = TenantAddOnStatusEnum.enum;

/**
 * Owns `trial-expiry` on the `finance` queue. Trial expiry is financially-tied
 * maintenance (cancels gifted add-ons, changes plan state), so it lives on
 * FINANCE rather than the slow-lane BULK_OPS queue. A QueueJobHandler — the
 * single FinanceQueueProcessor dispatcher routes by name. Keeps its service name
 * because `expireTrials()` is also callable directly.
 */
@Injectable()
export class TrialExpiryService implements QueueJobHandler {
  readonly jobNames = [FINANCE_JOB_NAMES.TRIAL_EXPIRY];
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

          await tx.alert.create({
            data: {
              alertId: generateId('alert'),
              tenantId: tenant.id,
              // System alert with no associated driver — driverId stays NULL
              // (Phase 2 Task 10). The old placeholder string 'system' was a
              // workaround for the previous NOT NULL constraint.
              alertType: 'TRIAL_EXPIRED',
              category: 'system',
              priority: 'HIGH',
              title: 'Trial Period Has Ended',
              message: `Your 30-day free trial for ${tenant.companyName} has ended. Upgrade to a paid plan to continue using SALLY and keep all your data.`,
              recommendedAction: 'Go to Account → Subscription to choose a plan.',
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
