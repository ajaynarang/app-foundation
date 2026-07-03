/**
 * Subscription Service
 *
 * Core service for managing plan subscriptions. Handles the full lifecycle:
 * checkout -> activation -> upgrades/downgrades -> cancellation -> reactivation.
 *
 * Works with PlanConfigs to resolve Stripe price IDs and unit pricing.
 * All provider interactions go through PaymentProviderFactory.
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { BillingProviderType, BillingSubscriptionStatus, TenantPlan } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlansService } from '@appshore/platform/domains/plans/plans.service';
import { PaymentProviderFactory } from '../adapters/payment-provider.factory';
import { NormalizedBillingEvent } from '../adapters/payment-provider.interface';
import { PLAN_ORDER } from '../constants';
import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly providerFactory: PaymentProviderFactory,
  ) {}

  /**
   * Create a checkout session for a new subscription.
   * Creates the BillingCustomer record if one does not exist for the tenant.
   * Returns the checkout session URL.
   */
  async createSubscription(
    tenantId: string,
    tenantDbId: number,
    plan: TenantPlan,
    quantity: number,
    successUrl: string,
    cancelUrl: string,
  ): Promise<{ checkoutUrl: string }> {
    const adapter = this.providerFactory.getAdapter();

    // Resolve plan config and Stripe price ID from database
    const planConfig = await this.prisma.planConfig.findUnique({
      where: { plan },
    });
    if (!planConfig) {
      throw new BadRequestException(`Plan '${plan}' not found in config`);
    }

    const stripePriceId = planConfig.providerPriceId;
    if (!stripePriceId) {
      throw new BadRequestException(`Plan '${plan}' does not have a Stripe price configured`);
    }

    // Ensure BillingCustomer exists
    let billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { tenantId: tenantDbId },
    });

    if (!billingCustomer) {
      const tenant = await this.prisma.tenant.findUniqueOrThrow({
        where: { id: tenantDbId },
        select: { companyName: true, contactEmail: true },
      });

      const providerCustomerId = await adapter.createCustomer({
        email: tenant.contactEmail ?? '',
        name: tenant.companyName,
        metadata: { tenantId },
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

    // Check for existing active subscription
    const existing = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });
    if (existing) {
      throw new BadRequestException('Tenant already has an active subscription. Use upgrade instead.');
    }

    try {
      const checkoutUrl = await adapter.createCheckoutSession({
        providerCustomerId: billingCustomer.providerCustomerId,
        priceId: stripePriceId,
        quantity,
        successUrl,
        cancelUrl,
        metadata: { tenantId, plan },
      });

      this.logger.log(`Checkout session created for tenant ${tenantId}, plan ${plan}`);
      return { checkoutUrl };
    } catch (error) {
      this.logger.error(`Failed to create checkout session: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to create checkout session');
    }
  }

  /**
   * Handle successful checkout completion (called from webhook).
   * Creates the BillingSubscription record and assigns the plan to the tenant.
   */
  async handleCheckoutComplete(
    providerCustomerId: string,
    providerSubscriptionId: string,
    plan: TenantPlan,
    quantity: number,
    unitPriceCents: number,
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
  ): Promise<void> {
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
    });
    if (!billingCustomer) {
      this.logger.error(`BillingCustomer not found for provider customer ${providerCustomerId}`);
      return;
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: billingCustomer.tenantId },
      select: { tenantId: true },
    });
    if (!tenant) return;

    // Create subscription record
    await this.prisma.billingSubscription.upsert({
      where: { providerSubscriptionId },
      update: {
        plan,
        status: BillingSubscriptionStatus.ACTIVE,
        quantity,
        unitPriceCents,
        currentPeriodStart,
        currentPeriodEnd,
      },
      create: {
        tenantId: billingCustomer.tenantId,
        billingCustomerId: billingCustomer.id,
        providerSubscriptionId,
        plan,
        status: BillingSubscriptionStatus.ACTIVE,
        quantity,
        unitPriceCents,
        currentPeriodStart,
        currentPeriodEnd,
      },
    });

    // Assign the plan to the tenant
    await this.plansService.assignPlan(tenant.tenantId, plan, 'billing-system', 'Subscription activated via checkout');

    this.logger.log(`Subscription activated for tenant ${tenant.tenantId}: ${plan}`);
  }

  /**
   * Handle checkout.session.completed webhook.
   * Fetches subscription details directly from the provider and delegates to handleCheckoutComplete.
   */
  async handleCheckoutSessionCompleted(providerCustomerId: string, providerSubscriptionId: string): Promise<void> {
    const adapter = this.providerFactory.getAdapter();

    // Fetch the actual subscription from Stripe (not invoice — invoice periods are unreliable)
    const sub = await adapter.getSubscription(providerSubscriptionId);

    // Resolve plan from price ID via PlanConfig
    let resolvedPlan: TenantPlan = TenantPlan.STARTER;

    if (sub.priceId) {
      const matchedPlanConfig = await this.prisma.planConfig.findFirst({
        where: { providerPriceId: sub.priceId },
      });
      if (matchedPlanConfig) {
        resolvedPlan = matchedPlanConfig.plan;
      } else {
        this.logger.warn(`No PlanConfig found for price ID ${sub.priceId}, defaulting to STARTER`);
      }
    }

    // Also check metadata for plan hint (set during checkout creation)
    if (sub.metadata?.plan && Object.values(TenantPlan).includes(sub.metadata.plan as TenantPlan)) {
      resolvedPlan = sub.metadata.plan as TenantPlan;
    }

    await this.handleCheckoutComplete(
      providerCustomerId,
      providerSubscriptionId,
      resolvedPlan,
      sub.quantity,
      sub.unitPriceCents,
      sub.currentPeriodStart,
      sub.currentPeriodEnd,
    );
  }

  /**
   * Upgrade a tenant's plan. Prorates the billing period.
   * Only allows upgrades to higher-tier plans.
   */
  async upgradePlan(tenantId: string, tenantDbId: number, newPlan: TenantPlan, newQuantity?: number): Promise<void> {
    const subscription = await this.findActiveSubscription(tenantDbId);
    if (!subscription) {
      throw new BadRequestException('No active subscription found. Please create a new subscription first.');
    }

    // Validate that the new plan is actually a higher tier
    const currentOrder = PLAN_ORDER[subscription.plan] ?? 0;
    const newOrder = PLAN_ORDER[newPlan] ?? 0;
    if (newOrder <= currentOrder) {
      throw new BadRequestException('Can only upgrade to a higher-tier plan. Use downgrade for lower tiers.');
    }

    const adapter = this.providerFactory.getAdapter();

    const newPlanConfig = await this.prisma.planConfig.findUnique({
      where: { plan: newPlan },
    });

    const newStripePriceId = newPlanConfig?.providerPriceId;
    if (!newStripePriceId) {
      throw new BadRequestException(`Plan '${newPlan}' does not have a Stripe price configured`);
    }

    try {
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        priceId: newStripePriceId,
        quantity: newQuantity ?? subscription.quantity,
        prorationBehavior: 'create_prorations',
      });

      // Update local record
      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          plan: newPlan,
          unitPriceCents: newPlanConfig?.pricePerUnitCents ?? 0,
          ...(newQuantity && { quantity: newQuantity }),
        },
      });

      // Assign plan
      await this.plansService.assignPlan(
        tenantId,
        newPlan,
        'billing-system',
        `Upgraded from ${subscription.plan} to ${newPlan}`,
      );

      this.logger.log(`Plan upgraded for tenant ${tenantId}: ${subscription.plan} -> ${newPlan}`);
    } catch (error) {
      this.logger.error(`Failed to upgrade plan: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to upgrade plan');
    }
  }

  /**
   * Downgrade a tenant's plan. Takes effect at end of current billing period.
   * The subscription continues at the current plan until period end.
   */
  async downgradePlan(tenantId: string, tenantDbId: number, newPlan: TenantPlan): Promise<void> {
    const subscription = await this.getActiveSubscription(tenantDbId);

    // Validate that the new plan is actually a lower tier
    const currentOrder = PLAN_ORDER[subscription.plan] ?? 0;
    const newOrder = PLAN_ORDER[newPlan] ?? 0;
    if (newOrder >= currentOrder) {
      throw new BadRequestException('Can only downgrade to a lower-tier plan. Use upgrade for higher tiers.');
    }

    const newPlanConfig = await this.prisma.planConfig.findUnique({
      where: { plan: newPlan },
    });
    if (!newPlanConfig?.providerPriceId) {
      throw new BadRequestException(`Plan '${newPlan}' does not have a Stripe price configured`);
    }

    // Store the pending downgrade — actual change happens at period end
    await this.prisma.billingSubscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: true,
        pendingDowngradePlan: newPlan,
      },
    });

    const adapter = this.providerFactory.getAdapter();
    try {
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        cancelAtPeriodEnd: true,
      });

      this.logger.log(
        `Plan downgrade scheduled for tenant ${tenantId}: ${subscription.plan} -> ${newPlan} at period end`,
      );
    } catch (error) {
      this.logger.error(`Failed to schedule downgrade: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to schedule plan downgrade');
    }
  }

  /**
   * Update the seat/unit quantity on the subscription.
   * Stripe handles proration automatically.
   */
  async updateQuantity(tenantId: string, tenantDbId: number, newQuantity: number): Promise<void> {
    const subscription = await this.getActiveSubscription(tenantDbId);
    const adapter = this.providerFactory.getAdapter();

    try {
      await adapter.updateSubscription(subscription.providerSubscriptionId, {
        quantity: newQuantity,
        prorationBehavior: 'create_prorations',
      });

      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: { quantity: newQuantity },
      });

      this.logger.log(`Quantity updated for tenant ${tenantId}: ${subscription.quantity} -> ${newQuantity}`);
    } catch (error) {
      this.logger.error(`Failed to update quantity: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to update subscription quantity');
    }
  }

  /**
   * Cancel a subscription at the end of the current billing period.
   * The tenant retains access until the period ends.
   */
  async cancelSubscription(tenantId: string, tenantDbId: number, reason?: string): Promise<void> {
    const subscription = await this.getActiveSubscription(tenantDbId);
    const adapter = this.providerFactory.getAdapter();

    try {
      await adapter.cancelSubscription(subscription.providerSubscriptionId, {
        atPeriodEnd: true,
      });

      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: {
          cancelAtPeriodEnd: true,
        },
      });

      // Audit
      await this.prisma.tenantPlanEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenantDbId,
          fromPlan: subscription.plan,
          toPlan: subscription.plan,
          changedBy: 'billing-system',
          reason: reason ? `Cancellation requested: ${reason}` : 'Subscription cancellation requested',
        },
      });

      this.logger.log(`Subscription cancel scheduled for tenant ${tenantId} at period end`);
    } catch (error) {
      this.logger.error(`Failed to cancel subscription: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a subscription that was scheduled for cancellation.
   * Only works if the subscription has not yet been fully canceled.
   */
  async reactivateSubscription(tenantId: string, tenantDbId: number): Promise<void> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        cancelAtPeriodEnd: true,
        status: { in: ['ACTIVE', 'PAST_DUE'] },
      },
    });

    if (!subscription) {
      throw new NotFoundException('No cancelable subscription found for this tenant');
    }

    const adapter = this.providerFactory.getAdapter();

    try {
      await adapter.reactivateSubscription(subscription.providerSubscriptionId);

      await this.prisma.billingSubscription.update({
        where: { id: subscription.id },
        data: { cancelAtPeriodEnd: false },
      });

      this.logger.log(`Subscription reactivated for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(`Failed to reactivate subscription: ${error}`, (error as Error).stack);
      throw new InternalServerErrorException('Failed to reactivate subscription');
    }
  }

  /**
   * Get the current subscription for a tenant.
   * Returns null if no subscription exists.
   */
  async getSubscription(tenantDbId: number) {
    return this.prisma.billingSubscription.findFirst({
      where: { tenantId: tenantDbId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get the full billing overview for a tenant:
   * subscription + wallet + payment methods + upcoming invoice.
   */
  async getBillingOverview(tenantDbId: number) {
    const [subscription, wallet, paymentMethods, billingCustomer] = await Promise.all([
      this.prisma.billingSubscription.findFirst({
        where: { tenantId: tenantDbId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.wallet.findUnique({
        where: { tenantId: tenantDbId },
      }),
      this.prisma.paymentMethod.findMany({
        where: { tenantId: tenantDbId },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.billingCustomer.findUnique({
        where: { tenantId: tenantDbId },
      }),
    ]);

    let upcomingInvoice = null;
    if (billingCustomer && subscription?.status === 'ACTIVE') {
      try {
        const adapter = this.providerFactory.getAdapter();
        upcomingInvoice = await adapter.getUpcomingInvoice(billingCustomer.providerCustomerId);
      } catch {
        // Upcoming invoice may not exist for new subscriptions
        this.logger.debug(`No upcoming invoice for tenant ${tenantDbId}`);
      }
    }

    return {
      subscription,
      wallet,
      paymentMethods,
      upcomingInvoice,
    };
  }

  /**
   * Handle subscription.updated webhook event.
   * Syncs the subscription state from the provider.
   */
  async handleSubscriptionUpdated(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;
    const providerSubscriptionId = data.id as string;

    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { providerSubscriptionId },
    });
    if (!subscription) {
      this.logger.warn(`Subscription not found for provider ID ${providerSubscriptionId}`);
      return;
    }

    const statusMap: Record<string, BillingSubscriptionStatus> = {
      active: BillingSubscriptionStatus.ACTIVE,
      past_due: BillingSubscriptionStatus.PAST_DUE,
      canceled: BillingSubscriptionStatus.CANCELED,
      trialing: BillingSubscriptionStatus.TRIALING,
    };

    await this.prisma.billingSubscription.update({
      where: { providerSubscriptionId },
      data: {
        status: statusMap[data.status] ?? subscription.status,
        quantity: data.items?.data?.[0]?.quantity ?? subscription.quantity,
        currentPeriodStart: data.current_period_start
          ? new Date(data.current_period_start * 1000)
          : subscription.currentPeriodStart,
        currentPeriodEnd: data.current_period_end
          ? new Date(data.current_period_end * 1000)
          : subscription.currentPeriodEnd,
        cancelAtPeriodEnd: data.cancel_at_period_end ?? false,
      },
    });

    this.logger.log(`Subscription updated from webhook: ${providerSubscriptionId}`);
  }

  /**
   * Handle subscription.canceled webhook event.
   * Marks the subscription as canceled and transitions the tenant plan.
   * If the plan was admin-assigned, creates an audit event notifying the admin.
   */
  async handleSubscriptionCanceled(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;
    const providerSubscriptionId = data.id as string;

    const subscription = await this.prisma.billingSubscription.findUnique({
      where: { providerSubscriptionId },
      include: {
        tenant: {
          select: { tenantId: true, plan: true, planAssignedBy: true },
        },
      },
    });
    if (!subscription) return;

    // Check if this is a downgrade (not a true cancellation)
    if (subscription.pendingDowngradePlan) {
      const newPlan = subscription.pendingDowngradePlan;

      // Mark old subscription as canceled
      await this.prisma.billingSubscription.update({
        where: { providerSubscriptionId },
        data: {
          status: BillingSubscriptionStatus.CANCELED,
          pendingDowngradePlan: null,
        },
      });

      // Assign the downgraded plan immediately
      await this.plansService.assignPlan(
        subscription.tenant.tenantId,
        newPlan,
        'billing-system',
        `Downgraded from ${subscription.plan} to ${newPlan}`,
      );

      this.logger.log(
        `Subscription downgraded for tenant ${subscription.tenant.tenantId}: ${subscription.plan} -> ${newPlan}`,
      );
      return;
    }

    // True cancellation — always downgrade to TRIAL_EXPIRED
    const previousPlan = subscription.tenant.plan;
    const wasAdminAssigned =
      subscription.tenant.planAssignedBy &&
      subscription.tenant.planAssignedBy !== 'billing-system' &&
      subscription.tenant.planAssignedBy !== 'system-cron';

    await this.prisma.billingSubscription.update({
      where: { providerSubscriptionId },
      data: { status: BillingSubscriptionStatus.CANCELED },
    });

    await this.plansService.assignPlan(
      subscription.tenant.tenantId,
      TenantPlan.TRIAL_EXPIRED,
      'billing-system',
      wasAdminAssigned
        ? `Subscription canceled. Previous plan ${previousPlan} was set by ${subscription.tenant.planAssignedBy}. Admin action may be required.`
        : 'Subscription canceled',
    );

    if (wasAdminAssigned) {
      this.logger.warn(
        `Subscription canceled for tenant ${subscription.tenant.tenantId}. ` +
          `Previous plan ${previousPlan} was admin-assigned by ${subscription.tenant.planAssignedBy}. ` +
          `Plan reverted to TRIAL_EXPIRED. Admin should review.`,
      );
    }

    this.logger.log(`Subscription canceled for tenant ${subscription.tenant.tenantId}`);
  }

  /**
   * Handle subscription.created webhook event.
   * Syncs the new subscription from the provider.
   */
  async handleSubscriptionCreated(event: NormalizedBillingEvent): Promise<void> {
    const data = event.data;
    const providerSubscriptionId = data.id as string;
    const providerCustomerId = data.customer as string;

    // Check if we already have this subscription (created via checkout)
    const existing = await this.prisma.billingSubscription.findUnique({
      where: { providerSubscriptionId },
    });
    if (existing) return;

    // Find billing customer
    const billingCustomer = await this.prisma.billingCustomer.findUnique({
      where: { providerCustomerId },
    });
    if (!billingCustomer) {
      this.logger.warn(`BillingCustomer not found for webhook subscription creation: ${providerCustomerId}`);
      return;
    }

    const plan = (data.metadata?.plan as TenantPlan) ?? TenantPlan.STARTER;
    const quantity = data.items?.data?.[0]?.quantity ?? 1;
    const unitPriceCents = data.items?.data?.[0]?.price?.unit_amount ?? 0;

    await this.handleCheckoutComplete(
      providerCustomerId,
      providerSubscriptionId,
      plan,
      quantity,
      unitPriceCents,
      new Date((data.current_period_start ?? 0) * 1000),
      new Date((data.current_period_end ?? 0) * 1000),
    );
  }

  // ─── Add-on subscription items ──────────────────────────────────────────

  /**
   * Add an add-on to the tenant's Stripe subscription as a subscription item.
   * Returns the provider subscription item ID, or null if no active subscription.
   */
  async addAddOnToSubscription(tenantDbId: number, addOnPriceId: string): Promise<string | null> {
    const subscription = await this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });

    if (!subscription) {
      this.logger.warn(`No active subscription for tenant DB ID ${tenantDbId}, cannot add add-on`);
      return null;
    }

    const adapter = this.providerFactory.getAdapter();
    const itemId = await adapter.addSubscriptionItem(subscription.providerSubscriptionId, addOnPriceId);

    this.logger.log(`Added add-on subscription item ${itemId} to subscription ${subscription.providerSubscriptionId}`);
    return itemId;
  }

  /**
   * Remove an add-on from the tenant's Stripe subscription.
   * The add-on stays active in the app until period end (no refund on cancel).
   */
  async removeAddOnFromSubscription(providerSubscriptionItemId: string): Promise<void> {
    const adapter = this.providerFactory.getAdapter();
    await adapter.removeSubscriptionItem(providerSubscriptionItemId, true);
    this.logger.log(`Removed add-on subscription item ${providerSubscriptionItemId}`);
  }

  // ─── Private helpers ─────────────────────────────────────────────────────

  /** Find the active subscription for a tenant, or return null. */
  private async findActiveSubscription(tenantDbId: number) {
    return this.prisma.billingSubscription.findFirst({
      where: {
        tenantId: tenantDbId,
        status: { in: ['ACTIVE', 'TRIALING', 'PAST_DUE'] },
      },
    });
  }

  /** Get the active subscription for a tenant or throw NotFoundException. */
  private async getActiveSubscription(tenantDbId: number) {
    const subscription = await this.findActiveSubscription(tenantDbId);
    if (!subscription) {
      throw new NotFoundException('No active subscription found for this tenant');
    }
    return subscription;
  }
}
