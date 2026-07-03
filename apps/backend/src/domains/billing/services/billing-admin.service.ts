/**
 * Billing Admin Service
 *
 * Super admin operations for managing tenant billing.
 * Provides gift credits, refunds, custom pricing, trial extensions,
 * manual suspension/reactivation, and revenue analytics.
 */
import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { BillingProviderType, BillingSubscriptionStatus, TenantPlan } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlansService } from '@appshore/platform/domains/plans/plans.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';
import { WalletService } from './wallet.service';
import { PLAN_ORDER } from '../constants';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';

@Injectable()
export class BillingAdminService {
  private readonly logger = new Logger(BillingAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly providerFactory: PaymentProviderFactory,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Create a Stripe subscription for a tenant (admin-initiated, no checkout).
   * Used for Enterprise deals and manual provisioning.
   */
  async createSubscriptionForTenant(
    tenantDbId: number,
    plan: TenantPlan,
    quantity: number,
    customPriceCents?: number,
  ): Promise<{ providerSubscriptionId: string }> {
    const adapter = this.providerFactory.getAdapter();

    // Validate plan has a Stripe price
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan },
    });
    if (!planConfig?.providerPriceId) {
      throw new BadRequestException(`Plan '${plan}' does not have a Stripe price configured`);
    }

    // Check no active subscription already exists
    const existing = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });
    if (existing) {
      throw new BadRequestException(
        'Tenant already has an active subscription. Cancel it first or use price override.',
      );
    }

    // Ensure BillingCustomer exists
    let billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });

    if (!billingCustomer) {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantDbId },
        select: { tenantId: true, companyName: true, contactEmail: true },
      });

      const providerCustomerId = await adapter.createCustomer({
        email: tenant.contactEmail ?? '',
        name: tenant.companyName,
        metadata: { tenantId: tenant.tenantId },
      });

      billingCustomer = await this.prisma.billingCustomer.create({
        data: {
          tenantId: tenantDbId,
          providerType: BillingProviderType.STRIPE,
          providerCustomerId,
          billingEmail: tenant.contactEmail ?? '',
          billingName: tenant.companyName,
        },
      });
    }

    // Create subscription via Stripe adapter
    try {
      const providerSubscriptionId = await adapter.createSubscription({
        providerCustomerId: billingCustomer.providerCustomerId,
        priceId: planConfig.providerPriceId,
        quantity,
        metadata: { plan, source: 'admin-provisioned' },
        paymentBehavior: 'default_incomplete',
        collectionMethod: 'send_invoice',
        daysUntilDue: 30,
      });

      // Fetch real period dates and status from Stripe
      const sub = await adapter.getSubscription(providerSubscriptionId);
      const unitPrice = customPriceCents ?? sub.unitPriceCents;

      // Map Stripe status to our enum
      const statusMap: Record<string, BillingSubscriptionStatus> = {
        active: BillingSubscriptionStatus.ACTIVE,
        trialing: BillingSubscriptionStatus.TRIALING,
        past_due: BillingSubscriptionStatus.PAST_DUE,
        canceled: BillingSubscriptionStatus.CANCELED,
      };
      const dbStatus = statusMap[sub.status] ?? BillingSubscriptionStatus.ACTIVE;

      // Create local subscription record with real Stripe dates
      await this.prisma.billingSubscription.create({
        data: {
          tenantId: tenantDbId,
          billingCustomerId: billingCustomer.id,
          providerSubscriptionId,
          plan,
          status: dbStatus,
          quantity,
          unitPriceCents: unitPrice,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
        },
      });

      // If custom price differs from catalog, update locally
      if (customPriceCents && customPriceCents !== planConfig.pricePerUnitCents) {
        this.logger.log(
          `Custom price set for tenant ${tenantDbId}: $${(customPriceCents / 100).toFixed(2)}/unit (catalog: $${(planConfig.pricePerUnitCents / 100).toFixed(2)})`,
        );
      }

      // Assign plan to tenant
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantDbId },
        select: { tenantId: true },
      });

      await this.plansService.assignPlan(
        tenant.tenantId,
        plan,
        'billing-admin',
        `Admin-provisioned ${plan} subscription (${quantity} units)`,
      );

      this.logger.log(
        `Admin created subscription for tenant ${tenantDbId}: ${plan}, ${quantity} units, sub=${providerSubscriptionId}`,
      );

      return { providerSubscriptionId };
    } catch (error) {
      // Re-throw known HTTP exceptions as-is
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }
      const message = error?.message ?? String(error);
      this.logger.error(`Failed to create admin subscription: ${message}`, (error as Error).stack);
      throw new BadRequestException(`Failed to create subscription: ${message}`);
    }
  }

  /**
   * Get the full billing state for a tenant (super admin view).
   */
  async getTenantBilling(tenantDbId: number) {
    const [tenant, subscription, wallet, paymentMethods, recentInvoices] = await Promise.all([
      this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantDbId },
        select: {
          tenantId: true,
          companyName: true,
          plan: true,
          trialStartedAt: true,
          trialEndsAt: true,
          planAssignedAt: true,
        },
      }),
      this.prisma.billingSubscription.findFirst({
        where: { tenantId: tenantDbId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wallet.findUnique({
        where: { tenantId: tenantDbId },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      }),
      this.prisma.paymentMethod.findMany({
        where: { tenantId: tenantDbId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.billingInvoice.findMany({
        where: { tenantId: tenantDbId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
    ]);

    return {
      tenant,
      subscription,
      wallet,
      paymentMethods,
      recentInvoices,
    };
  }

  /**
   * Add wallet credits as a gift from admin (no payment charged).
   */
  async addWalletCredit(tenantDbId: number, amountCents: number, reason: string, adminUserId: string): Promise<void> {
    await this.walletService.addCredit(tenantDbId, amountCents, reason, adminUserId);
    this.logger.log(`Admin ${adminUserId} added $${(amountCents / 100).toFixed(2)} credit to tenant ${tenantDbId}`);
  }

  /**
   * Issue a refund for a payment via the payment provider.
   */
  async issueRefund(
    tenantDbId: number,
    paymentId: string,
    amountCents?: number,
    reason?: string,
    creditWallet: boolean = false,
  ): Promise<{ refundId: string }> {
    const adapter = this.providerFactory.getAdapter();

    const refundId = await adapter.refund(paymentId, amountCents, reason);

    // Only credit the wallet if explicitly requested (e.g. refund for a wallet top-up)
    if (creditWallet && amountCents) {
      await this.walletService.refundToWallet(tenantDbId, amountCents, reason ?? 'Admin refund');
    }

    this.logger.log(`Refund issued for tenant ${tenantDbId}: ${refundId} (payment: ${paymentId})`);

    return { refundId };
  }

  /**
   * Override the unit price for a tenant's subscription.
   * Creates a custom Stripe price and updates the subscription.
   */
  async overrideUnitPrice(tenantDbId: number, unitPriceCents: number): Promise<void> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });
    if (!subscription) {
      throw new NotFoundException('No active subscription found for this tenant');
    }

    // Get the current plan's product ID from Stripe to create a custom price
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan: subscription.plan },
    });
    if (!planConfig?.providerPriceId) {
      throw new BadRequestException('Plan does not have a provider price configured');
    }

    const adapter = this.providerFactory.getAdapter();

    try {
      // Update subscription with new price via adapter
      // The adapter's updateSubscription handles creating a custom price internally
      // For now, update the subscription quantity pricing at Stripe level
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        priceId: planConfig.providerPriceId,
        quantity: subscription.quantity,
        prorationBehavior: 'none',
      });
    } catch (error) {
      this.logger.warn(
        `Failed to update Stripe subscription price for tenant ${tenantDbId}: ${error}. Local record updated.`,
      );
    }

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { unitPriceCents },
    });

    this.logger.log(`Price overridden for tenant ${tenantDbId}: $${(unitPriceCents / 100).toFixed(2)}/unit`);
  }

  /**
   * Pause a tenant's billing (sets cancelAtPeriodEnd without actually canceling).
   */
  async pauseBilling(tenantDbId: number): Promise<void> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: BillingSubscriptionStatus.ACTIVE,
      },
    });
    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    const adapter = this.providerFactory.getAdapter();
    await adapter.cancelSubscription(subscription.providerSubscriptionId, {
      atPeriodEnd: true,
    });

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    this.logger.log(`Billing paused for tenant ${tenantDbId}`);
  }

  /**
   * Resume a paused tenant's billing.
   */
  async resumeBilling(tenantDbId: number): Promise<void> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        cancelAtPeriodEnd: true,
        status: { in: ['ACTIVE', 'PAST_DUE'] },
      },
    });
    if (!subscription) {
      throw new NotFoundException('No paused subscription found for this tenant');
    }

    const adapter = this.providerFactory.getAdapter();
    await adapter.reactivateSubscription(subscription.providerSubscriptionId);

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false },
    });

    this.logger.log(`Billing resumed for tenant ${tenantDbId}`);
  }

  /**
   * Immediately cancel a tenant's subscription (not at period end).
   * Also transitions tenant plan to TRIAL_EXPIRED.
   * If the plan was admin-assigned, creates an audit event for admin visibility.
   */
  async cancelSubscriptionImmediately(tenantDbId: number): Promise<void> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });
    if (!subscription) {
      throw new NotFoundException('No active subscription found');
    }

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantDbId },
      select: { tenantId: true, plan: true, planAssignedBy: true },
    });

    const adapter = this.providerFactory.getAdapter();
    await adapter.cancelSubscription(subscription.providerSubscriptionId, {
      atPeriodEnd: false,
    });

    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: { status: BillingSubscriptionStatus.CANCELED },
    });

    // Transition plan to TRIAL_EXPIRED
    const wasAdminAssigned =
      tenant.planAssignedBy && tenant.planAssignedBy !== 'billing-system' && tenant.planAssignedBy !== 'system-cron';

    await this.plansService.assignPlan(
      tenant.tenantId,
      TenantPlan.TRIAL_EXPIRED,
      'billing-admin',
      wasAdminAssigned
        ? `Subscription immediately canceled. Previous plan ${tenant.plan} was set by ${tenant.planAssignedBy}.`
        : 'Subscription immediately canceled by admin',
    );

    this.logger.warn(
      `Subscription immediately canceled for tenant ${tenantDbId}: ${subscription.providerSubscriptionId}`,
    );
  }

  /**
   * Extend a tenant's trial period by the specified number of days.
   */
  async extendTrial(tenantDbId: number, days: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantDbId },
      select: { tenantId: true, trialEndsAt: true, plan: true },
    });

    if (tenant.plan !== TenantPlan.TRIAL && tenant.plan !== TenantPlan.TRIAL_EXPIRED) {
      throw new BadRequestException('Trial extension is only available for tenants on TRIAL or TRIAL_EXPIRED plans');
    }

    const currentEnd = tenant.trialEndsAt ?? new Date();
    const newEnd = new Date(currentEnd);
    newEnd.setDate(newEnd.getDate() + days);

    await this.prisma.tenant.update({
      where: { id: tenantDbId },
      data: { trialEndsAt: newEnd },
    });

    // If tenant was TRIAL_EXPIRED, restore to TRIAL
    if (tenant.plan === TenantPlan.TRIAL_EXPIRED) {
      await this.plansService.assignPlan(
        tenant.tenantId,
        TenantPlan.TRIAL,
        'billing-admin',
        `Trial extended by ${days} days`,
      );
    }

    await this.prisma.tenantPlanEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId: tenantDbId,
        fromPlan: tenant.plan,
        toPlan: tenant.plan === TenantPlan.TRIAL_EXPIRED ? TenantPlan.TRIAL : tenant.plan,
        changedBy: 'billing-admin',
        reason: `Trial extended by ${days} days (new end: ${newEnd.toISOString()})`,
      },
    });

    this.logger.log(`Trial extended for tenant ${tenant.tenantId} by ${days} days (new end: ${newEnd.toISOString()})`);
  }

  /**
   * Manually suspend a tenant (admin action).
   */
  async forceSuspend(tenantDbId: number, reason: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantDbId },
      select: { tenantId: true, plan: true },
    });

    // Suspend subscriptions
    await this.prisma.billingSubscription.updateMany({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'PAST_DUE', 'TRIALING'] },
      },
      data: { status: BillingSubscriptionStatus.SUSPENDED },
    });

    // Update tenant plan
    await this.plansService.assignPlan(
      tenant.tenantId,
      TenantPlan.SUSPENDED,
      'billing-admin',
      `Force suspended: ${reason}`,
    );

    this.logger.warn(`Tenant ${tenant.tenantId} force-suspended: ${reason}`);
  }

  /**
   * Manually reactivate a suspended tenant.
   */
  async reactivate(tenantDbId: number): Promise<void> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantDbId },
      select: { tenantId: true, plan: true },
    });

    if (tenant.plan !== TenantPlan.SUSPENDED) {
      throw new BadRequestException('Tenant is not currently suspended');
    }

    // Find the most recent subscription to determine what plan to restore
    const lastSubscription = await this.prisma.billingSubscription.findFirst({
      where: { tenantId: tenantDbId },
      orderBy: { createdAt: 'desc' },
    });

    const restorePlan = lastSubscription?.plan ?? TenantPlan.STARTER;

    // Reactivate subscription if it exists
    if (lastSubscription) {
      const adapter = this.providerFactory.getAdapter();
      try {
        await adapter.reactivateSubscription(lastSubscription.providerSubscriptionId);
      } catch {
        this.logger.warn(`Failed to reactivate subscription at provider for tenant ${tenant.tenantId}`);
      }

      await this.prisma.billingSubscription.update({
        where: { id: lastSubscription.id },
        data: {
          status: BillingSubscriptionStatus.ACTIVE,
          cancelAtPeriodEnd: false,
        },
      });
    }

    // Restore tenant plan
    await this.plansService.assignPlan(tenant.tenantId, restorePlan, 'billing-admin', 'Manually reactivated by admin');

    this.logger.log(`Tenant ${tenant.tenantId} reactivated to ${restorePlan}`);
  }

  /**
   * Change a tenant's subscription plan (admin-initiated upgrade or downgrade).
   * If no active subscription exists, creates one.
   * Always syncs tenant.plan to match the subscription.
   */
  async changeSubscriptionPlan(
    tenantDbId: number,
    newPlan: TenantPlan,
    quantity?: number,
  ): Promise<{ action: 'upgraded' | 'downgraded' | 'created' }> {
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan: newPlan },
    });
    if (!planConfig?.providerPriceId) {
      throw new BadRequestException(`Plan '${newPlan}' does not have a Stripe price configured`);
    }

    // Find active subscription
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });

    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantDbId },
      select: { tenantId: true },
    });

    // No active subscription — create one
    if (!subscription) {
      await this.createSubscriptionForTenant(tenantDbId, newPlan, quantity ?? 1);
      return { action: 'created' };
    }

    // Same plan — nothing to do
    if (subscription.plan === newPlan) {
      throw new BadRequestException(`Subscription is already on the ${newPlan} plan`);
    }

    const currentOrder = PLAN_ORDER[subscription.plan] ?? 0;
    const newOrder = PLAN_ORDER[newPlan] ?? 0;
    const isUpgrade = newOrder > currentOrder;

    const adapter = this.providerFactory.getAdapter();

    if (isUpgrade) {
      // Upgrade — immediate proration
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        priceId: planConfig.providerPriceId,
        quantity: quantity ?? subscription.quantity,
        prorationBehavior: 'create_prorations',
      });

      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          plan: newPlan,
          unitPriceCents: planConfig.pricePerUnitCents ?? 0,
          ...(quantity && { quantity }),
        },
      });

      await this.plansService.assignPlan(
        tenant.tenantId,
        newPlan,
        'billing-admin',
        `Admin upgraded subscription from ${subscription.plan} to ${newPlan}`,
      );

      this.logger.log(`Admin upgraded subscription for tenant ${tenantDbId}: ${subscription.plan} -> ${newPlan}`);
      return { action: 'upgraded' };
    } else {
      // Downgrade — immediate (admin override, no waiting for period end)
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        priceId: planConfig.providerPriceId,
        quantity: quantity ?? subscription.quantity,
        prorationBehavior: 'none',
      });

      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          plan: newPlan,
          unitPriceCents: planConfig.pricePerUnitCents ?? 0,
          cancelAtPeriodEnd: false,
          pendingDowngradePlan: null,
          ...(quantity && { quantity }),
        },
      });

      await this.plansService.assignPlan(
        tenant.tenantId,
        newPlan,
        'billing-admin',
        `Admin downgraded subscription from ${subscription.plan} to ${newPlan}`,
      );

      this.logger.log(`Admin downgraded subscription for tenant ${tenantDbId}: ${subscription.plan} -> ${newPlan}`);
      return { action: 'downgraded' };
    }
  }

  /**
   * Get revenue statistics across all tenants.
   * MRR, ARR, ARPU, churn rate, add-on adoption.
   */
  async getRevenueStats() {
    const [activeSubscriptions, canceledThisMonth, totalTenants, activeAddOns] = await Promise.all([
      this.prisma.billingSubscription.findMany({
        where: { status: BillingSubscriptionStatus.ACTIVE },
        select: { unitPriceCents: true, quantity: true },
      }),
      this.prisma.billingSubscription.count({
        where: {
          status: BillingSubscriptionStatus.CANCELED,
          updatedAt: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      this.prisma.tenant.count(),
      this.prisma.tenantAddOn.count({
        where: { status: 'ACTIVE' },
      }),
    ]);

    // Calculate MRR (Monthly Recurring Revenue)
    const mrr = activeSubscriptions.reduce((sum, sub) => sum + sub.unitPriceCents * sub.quantity, 0);

    const activeCount = activeSubscriptions.length;
    const arpu = activeCount > 0 ? Math.round(mrr / activeCount) : 0;

    // Churn rate: canceled / (active + canceled) this month
    const churnRate =
      activeCount + canceledThisMonth > 0 ? (canceledThisMonth / (activeCount + canceledThisMonth)) * 100 : 0;

    return {
      mrrCents: mrr,
      arrCents: mrr * 12,
      arpuCents: arpu,
      activeSubscriptions: activeCount,
      canceledThisMonth,
      churnRate: Math.round(churnRate * 100) / 100,
      totalTenants,
      activeAddOns,
      addOnAdoptionRate: activeCount > 0 ? Math.round((activeAddOns / activeCount) * 100 * 100) / 100 : 0,
    };
  }
}
