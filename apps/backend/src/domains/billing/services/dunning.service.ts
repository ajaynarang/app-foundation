/**
 * Dunning Service
 *
 * Handles failed payment recovery and tenant suspension.
 *
 * Flow:
 * 1. Payment fails -> update subscription to PAST_DUE, create alert, notify
 * 2. Payment succeeds after failure -> restore subscription to ACTIVE
 * 3. After max retries -> suspend tenant (restricts platform access)
 */
import { Injectable, Logger } from '@nestjs/common';
import { BillingSubscriptionStatus, TenantPlan } from '@appshore/db';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { PlansService } from '../../platform/plans/plans.service';
import { NormalizedBillingEvent } from '../adapters/payment-provider.interface';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';

const MAX_RETRY_COUNT = 3;

@Injectable()
export class DunningService {
  private readonly logger = new Logger(DunningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
  ) {}

  /**
   * Handle a failed payment event from the webhook.
   * Transitions subscription to PAST_DUE and tracks retry count.
   * After MAX_RETRY_COUNT failures, suspends the tenant.
   */
  async handlePaymentFailed(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;

    // Try to identify the tenant from the invoice's customer
    const providerCustomerId = (data.customer ?? data.customer_id) as string;
    if (!providerCustomerId) {
      this.logger.warn(`Payment failed event without customer ID: ${event.providerEventId}`);
      return;
    }

    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
      include: { tenant: { select: { tenantId: true, id: true } } },
    });
    if (!billingCustomer) {
      this.logger.warn(`BillingCustomer not found for failed payment: ${providerCustomerId}`);
      return;
    }

    const tenantId = billingCustomer.tenant.tenantId;
    const tenantDbId = billingCustomer.tenantId;

    // Update subscription status to PAST_DUE
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] },
      },
    });

    if (!subscription) {
      this.logger.warn(`No active subscription found for payment failure: tenant ${tenantId}`);
      return;
    }

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { status: BillingSubscriptionStatus.PAST_DUE },
    });

    // Track retry count scoped to the current billing period
    const periodStart = subscription.currentPeriodStart ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const failedPaymentCount = await this.prisma.tenantPlanEvent.count({
      where: {
        tenantId: tenantDbId,
        reason: { contains: 'Payment failed' },
        createdAt: { gte: periodStart },
      },
    });

    // Log the payment failure as a plan event for audit trail
    await this.prisma.tenantPlanEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId: tenantDbId,
        fromPlan: subscription.plan,
        toPlan: subscription.plan,
        changedBy: 'billing-system',
        reason: `Payment failed (attempt ${failedPaymentCount + 1}/${MAX_RETRY_COUNT})`,
      },
    });

    this.logger.warn(`Payment failed for tenant ${tenantId} (attempt ${failedPaymentCount + 1}/${MAX_RETRY_COUNT})`);

    // If max retries exceeded, suspend the tenant
    if (failedPaymentCount + 1 >= MAX_RETRY_COUNT) {
      await this.suspendTenant(tenantDbId);
    }
  }

  /**
   * Handle a successful payment after a previous failure.
   * Restores the subscription from PAST_DUE to ACTIVE.
   */
  async handlePaymentSucceeded(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;
    const providerCustomerId = (data.customer ?? data.customer_id) as string;
    if (!providerCustomerId) return;

    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
    });
    if (!billingCustomer) return;

    // Check if the subscription was in PAST_DUE state
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: billingCustomer.tenantId,
        status: BillingSubscriptionStatus.PAST_DUE,
      },
    });

    if (subscription) {
      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: { status: BillingSubscriptionStatus.ACTIVE },
      });

      this.logger.log(`Subscription restored from PAST_DUE for tenant ${billingCustomer.tenantId}`);
    }
  }

  /**
   * Suspend a tenant after max payment retries.
   * Transitions the subscription and tenant plan to SUSPENDED.
   */
  async suspendTenant(tenantDbId: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantDbId },
      select: { tenantId: true, plan: true },
    });
    if (!tenant) return;

    // Update subscription status
    await this.prisma.billingSubscription.updateMany({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] },
      },
      data: { status: BillingSubscriptionStatus.SUSPENDED },
    });

    // Suspend the tenant's plan
    await this.plansService.assignPlan(
      tenant.tenantId,
      TenantPlan.SUSPENDED,
      'billing-system',
      'Suspended due to repeated payment failures',
    );

    this.logger.warn(`Tenant ${tenant.tenantId} suspended due to payment failures`);
  }
}
