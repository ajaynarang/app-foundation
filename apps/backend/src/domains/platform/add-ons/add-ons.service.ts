import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { TenantPlan } from '@prisma/client';
import { TenantAddOnStatusEnum, AddOnRequestStatusEnum } from '@sally/shared-types';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M } from '../../../constants/cache.constants';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { SubscriptionService } from '../../billing/services/subscription.service';
import { WalletService } from '../../billing/services/wallet.service';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';

const TENANT_ADDON_STATUS = TenantAddOnStatusEnum.enum;
const ADDON_REQUEST_STATUS = AddOnRequestStatusEnum.enum;

export interface FeatureResolution {
  enabled: boolean;
  source: 'feature_flag_disabled' | 'addon_active' | 'not_enabled';
  usageRemaining?: number | null;
}

@Injectable()
export class AddOnsService {
  private readonly logger = new Logger(AddOnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sallyCache: SallyCacheService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly subscriptionService: SubscriptionService,
    private readonly walletService: WalletService,
  ) {}

  /**
   * List all active add-ons from the catalog
   */
  async listAddOns() {
    return this.prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * List all add-ons (including inactive) for admin catalog view
   */
  async listAllAddOns() {
    return this.prisma.addOn.findMany({
      orderBy: { displayOrder: 'asc' },
    });
  }

  /**
   * Get a single add-on by slug
   */
  async getAddOnBySlug(slug: string) {
    const addOn = await this.prisma.addOn.findUnique({
      where: { slug },
    });
    if (!addOn) throw new NotFoundException(`Add-on '${slug}' not found`);
    return addOn;
  }

  /**
   * Update providerPriceId for an add-on by slug (SUPER_ADMIN only)
   */
  async updateProviderPriceId(slug: string, providerPriceId: string | null) {
    const addOn = await this.getAddOnBySlug(slug);
    return this.prisma.addOn.update({
      where: { id: addOn.id },
      data: { providerPriceId: providerPriceId || null },
    });
  }

  /**
   * Update add-on catalog entry fields (SUPER_ADMIN only)
   */
  async updateAddOn(
    slug: string,
    data: {
      name?: string;
      description?: string | null;
      priceCents?: number | null;
      isActive?: boolean;
      providerPriceId?: string | null;
    },
  ) {
    const addOn = await this.getAddOnBySlug(slug);
    const updated = await this.prisma.addOn.update({
      where: { id: addOn.id },
      data,
    });

    // Invalidate feature key cache since isActive may have changed
    await this.sallyCache.del(buildKey('sally:addons', 'catalog', addOn.featureKey));

    this.logger.log(`Add-on '${slug}' updated: ${JSON.stringify(data)}`);
    return updated;
  }

  /**
   * Get add-on by slug or feature key (tries slug first, falls back to featureKey)
   */
  async getAddOnBySlugOrFeatureKey(identifier: string) {
    let addOn = await this.prisma.addOn.findUnique({
      where: { slug: identifier },
    });
    if (!addOn) {
      addOn = await this.prisma.addOn.findFirst({
        where: { featureKey: identifier },
      });
    }
    if (!addOn) throw new NotFoundException(`Add-on '${identifier}' not found`);
    return addOn;
  }

  /**
   * Get add-on by feature key (cached)
   */
  async getAddOnByFeatureKey(featureKey: string) {
    return this.sallyCache.getOrSet(
      buildKey('sally:addons', 'catalog', featureKey),
      async () => {
        const addOn = await this.prisma.addOn.findFirst({
          where: { featureKey, isActive: true },
        });
        return addOn ?? null;
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /**
   * 2-step feature resolution for add-on features:
   * 1. Check global feature flag (kill-switch)
   * 2. Check for active TenantAddOn (purchased or gifted)
   */
  async isFeatureEnabled(tenantId: number, featureKey: string): Promise<FeatureResolution> {
    return this.sallyCache.getOrSet<FeatureResolution>(
      buildKey('sally:addons', 'resolution', String(tenantId), featureKey),
      async () => {
        // Step 1: Global feature flag check
        const flagEnabled = await this.featureFlagsService.isEnabled(featureKey);
        if (flagEnabled === false) {
          return { enabled: false, source: 'feature_flag_disabled' };
        }

        // Find the add-on definition
        const addOn = await this.getAddOnByFeatureKey(featureKey);
        if (!addOn) {
          // No add-on record for this feature — not managed by add-on system
          return { enabled: false, source: 'not_enabled' };
        }

        // Step 2: Check for active TenantAddOn (purchased or gifted)
        const tenantAddOn = await this.prisma.tenantAddOn.findFirst({
          where: {
            tenantId,
            addOnId: addOn.id,
            status: TENANT_ADDON_STATUS.ACTIVE,
          },
        });

        if (tenantAddOn) {
          const usageRemaining =
            tenantAddOn.usageLimit != null ? tenantAddOn.usageLimit - tenantAddOn.currentUsage : null;

          return {
            enabled: true,
            source: 'addon_active',
            usageRemaining,
          };
        }

        // Not enabled
        return { enabled: false, source: 'not_enabled' };
      },
      CACHE_TTL_WARM_5M,
    );
  }

  /**
   * List a tenant's active add-ons
   */
  async listTenantAddOns(tenantId: number) {
    return this.prisma.tenantAddOn.findMany({
      where: { tenantId },
      include: { addOn: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Activate an add-on for a tenant.
   * Resolves tier-aware usage limit from addOn.usageLimits JSON based on tenant plan.
   */
  async activateAddOn(tenantId: number, slug: string, source: string, activatedBy: string, priceCents?: number) {
    const addOn = await this.getAddOnBySlug(slug);

    // Check if tenant is on trial — trial activations are gifted at $0, skip Stripe
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { plan: true },
    });
    const isTrialTenant = tenant.plan === TenantPlan.TRIAL;

    // Trial tenants get add-ons as gifts — no billing
    const resolvedSource = isTrialTenant ? 'gifted' : source;
    const resolvedPrice = isTrialTenant ? 0 : (priceCents ?? addOn.priceCents ?? 0);

    // Resolve tier-aware usage limit
    const usageLimit = await this.resolveUsageLimit(tenantId, addOn);

    const tenantAddOn = await this.prisma.tenantAddOn.upsert({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
      update: {
        status: TENANT_ADDON_STATUS.ACTIVE,
        source: resolvedSource,
        priceCents: resolvedPrice,
        usageLimit,
        usageLimitUnit: addOn.usageLimitUnit,
        currentUsage: 0,
        overageUsage: 0,
        allowOverage: false,
        activatedAt: new Date(),
        activatedBy: String(activatedBy),
        cancelledAt: null,
        cancelledBy: null,
      },
      create: {
        tenantId,
        addOnId: addOn.id,
        status: TENANT_ADDON_STATUS.ACTIVE,
        source: resolvedSource,
        priceCents: resolvedPrice,
        usageLimit,
        usageLimitUnit: addOn.usageLimitUnit,
        activatedAt: new Date(),
        activatedBy: String(activatedBy),
      },
    });

    // Record event
    await this.prisma.tenantAddOnEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        addOnId: addOn.id,
        eventType: 'activated',
        changedBy: String(activatedBy),
      },
    });

    // Invalidate cache
    await this.sallyCache.del(buildKey('sally:addons', 'resolution', String(tenantId), addOn.featureKey));

    // Wire to Stripe if payment_system is enabled (skip for trial — gifted, no billing)
    if (!isTrialTenant) {
      try {
        await this.syncActivationToStripe(tenantId, slug, tenantAddOn.id);
      } catch (error) {
        // Roll back — don't leave an unbilled active add-on
        await this.prisma.tenantAddOn.update({
          where: { id: tenantAddOn.id },
          data: {
            status: TENANT_ADDON_STATUS.CANCELLED,
            cancelledAt: new Date(),
            cancelledBy: 'system-rollback',
          },
        });
        await this.sallyCache.del(buildKey('sally:addons', 'resolution', String(tenantId), addOn.featureKey));
        throw error;
      }
    }

    this.logger.log(`Add-on '${slug}' activated for tenant ${tenantId} by ${activatedBy}`);
    return tenantAddOn;
  }

  /**
   * Cancel an add-on for a tenant (immediate stop, no grace period)
   */
  async cancelAddOn(tenantId: number, slug: string, cancelledBy: string, reason?: string) {
    const addOn = await this.getAddOnBySlug(slug);

    const existing = await this.prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
    });
    if (!existing) throw new NotFoundException(`Tenant does not have add-on '${slug}'`);
    if (existing.status === TENANT_ADDON_STATUS.CANCELLED)
      throw new BadRequestException(`Add-on '${slug}' is already cancelled`);

    const tenantAddOn = await this.prisma.tenantAddOn.update({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
      data: {
        status: TENANT_ADDON_STATUS.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy: String(cancelledBy),
      },
    });

    // Record event
    await this.prisma.tenantAddOnEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        addOnId: addOn.id,
        eventType: 'cancelled',
        changedBy: String(cancelledBy),
        reason,
      },
    });

    // Invalidate cache
    await this.sallyCache.del(buildKey('sally:addons', 'resolution', String(tenantId), addOn.featureKey));

    // Remove from Stripe if payment_system is enabled
    await this.syncCancellationToStripe(existing.stripeSubscriptionItemId);

    this.logger.log(`Add-on '${slug}' cancelled for tenant ${tenantId} by ${cancelledBy}`);
    return tenantAddOn;
  }

  /**
   * Toggle overage for a tenant's add-on
   */
  async toggleOverage(tenantId: number, slug: string, enabled: boolean, changedBy: string) {
    const addOn = await this.getAddOnBySlug(slug);

    const existing = await this.prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
    });
    if (!existing) throw new NotFoundException(`Tenant does not have add-on '${slug}'`);
    if (existing.status !== TENANT_ADDON_STATUS.ACTIVE) throw new BadRequestException(`Add-on '${slug}' is not active`);

    const updated = await this.prisma.tenantAddOn.update({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
      data: { allowOverage: enabled },
    });

    await this.prisma.tenantAddOnEvent.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        addOnId: addOn.id,
        eventType: enabled ? 'overage_enabled' : 'overage_disabled',
        changedBy,
      },
    });

    this.logger.log(`Overage ${enabled ? 'enabled' : 'disabled'} for add-on '${slug}', tenant ${tenantId}`);
    return updated;
  }

  /**
   * Increment usage counter for a metered add-on.
   * If over limit AND allowOverage=true, increments overageUsage.
   */
  async incrementUsage(
    tenantId: number,
    featureKey: string,
  ): Promise<{
    allowed: boolean;
    reason?: 'wallet_empty';
    currentUsage: number;
    usageLimit: number | null;
    overageUsage: number;
  }> {
    const addOn = await this.getAddOnByFeatureKey(featureKey);
    if (!addOn)
      return {
        allowed: true,
        currentUsage: 0,
        usageLimit: null,
        overageUsage: 0,
      };

    // Atomic: increment only if under limit (or unlimited)
    const rowsAffected = await this.prisma.$executeRaw`
      UPDATE tenant_add_ons
      SET current_usage = current_usage + 1, updated_at = NOW()
      WHERE tenant_id = ${tenantId}
        AND add_on_id = ${addOn.id}
        AND status = ${TENANT_ADDON_STATUS.ACTIVE}
        AND (usage_limit IS NULL OR current_usage < usage_limit)
    `;

    if (rowsAffected === 0) {
      // Either not found, not active, or limit reached — check for overage
      const existing = await this.prisma.tenantAddOn.findFirst({
        where: { tenantId, addOnId: addOn.id, status: TENANT_ADDON_STATUS.ACTIVE },
        select: {
          currentUsage: true,
          usageLimit: true,
          allowOverage: true,
          overageUsage: true,
        },
      });

      if (!existing)
        return {
          allowed: false,
          currentUsage: 0,
          usageLimit: null,
          overageUsage: 0,
        };

      // If at limit and overage is allowed, deduct from wallet then increment overage
      if (existing.allowOverage && existing.usageLimit != null && existing.currentUsage >= existing.usageLimit) {
        // Deduct overage cost from wallet — hard stop if insufficient balance
        const overageRateCents = addOn.overageRateCents ?? 0;
        if (overageRateCents > 0) {
          const walletResult = await this.walletService.deductOverage(
            tenantId,
            addOn.id,
            overageRateCents,
            `Overage: ${addOn.name} (${featureKey})`,
          );

          if (!walletResult.allowed) {
            this.logger.warn(
              `Overage blocked for tenant ${tenantId}, feature ${featureKey}: insufficient wallet balance ($${(walletResult.currentBalance / 100).toFixed(2)})`,
            );
            return {
              allowed: false,
              reason: 'wallet_empty' as const,
              currentUsage: existing.currentUsage,
              usageLimit: existing.usageLimit,
              overageUsage: existing.overageUsage,
            };
          }
        }

        const overageRowsAffected = await this.prisma.$executeRaw`
          UPDATE tenant_add_ons
          SET overage_usage = overage_usage + 1, updated_at = NOW()
          WHERE tenant_id = ${tenantId}
            AND add_on_id = ${addOn.id}
            AND status = ${TENANT_ADDON_STATUS.ACTIVE}
            AND allow_overage = true
        `;

        // If the update failed (e.g. add-on was cancelled between check and update),
        // refund the wallet deduction and deny the request
        if (overageRowsAffected === 0) {
          if (overageRateCents > 0) {
            await this.walletService.refundOverage(
              tenantId,
              addOn.id,
              overageRateCents,
              `Refund: ${addOn.name} overage (add-on no longer active)`,
            );
          }
          return {
            allowed: false,
            currentUsage: existing.currentUsage,
            usageLimit: existing.usageLimit,
            overageUsage: existing.overageUsage,
          };
        }

        await this.sallyCache.del(buildKey('sally:addons', 'resolution', String(tenantId), featureKey));

        return {
          allowed: true,
          currentUsage: existing.currentUsage,
          usageLimit: existing.usageLimit,
          overageUsage: existing.overageUsage + 1,
        };
      }

      return {
        allowed: false,
        currentUsage: existing.currentUsage,
        usageLimit: existing.usageLimit,
        overageUsage: existing.overageUsage,
      };
    }

    // Invalidate cache since usage changed
    await this.sallyCache.del(buildKey('sally:addons', 'resolution', String(tenantId), featureKey));

    // Get updated usage
    const updated = await this.prisma.tenantAddOn.findFirst({
      where: { tenantId, addOnId: addOn.id, status: TENANT_ADDON_STATUS.ACTIVE },
      select: { currentUsage: true, usageLimit: true, overageUsage: true },
    });

    return {
      allowed: true,
      currentUsage: updated?.currentUsage ?? 0,
      usageLimit: updated?.usageLimit ?? null,
      overageUsage: updated?.overageUsage ?? 0,
    };
  }

  /**
   * Get add-ons catalog with pricing info (for public pricing page)
   */
  async getAddOnsForPricingPage() {
    const addOns = await this.prisma.addOn.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        icon: true,
        category: true,
        priceCents: true,
        billingInterval: true,
        featureKey: true,
        usageLimits: true,
        usageLimitUnit: true,
        overageRateCents: true,
        providerPriceId: true,
        isActive: true,
        displayOrder: true,
      },
    });

    return addOns;
  }

  /**
   * Get status of a specific add-on for a tenant
   */
  async getAddOnStatus(tenantId: number, identifier: string) {
    const addOn = await this.getAddOnBySlugOrFeatureKey(identifier);
    const resolution = await this.isFeatureEnabled(tenantId, addOn.featureKey);

    const tenantAddOn = await this.prisma.tenantAddOn.findUnique({
      where: { tenantId_addOnId: { tenantId, addOnId: addOn.id } },
    });

    return {
      addOn,
      ...resolution,
      tenantAddOn,
    };
  }

  // ─── Request workflow ──────────────────────────────────────────────────────

  /**
   * Create a request for an add-on (any authenticated user)
   */
  async createRequest(tenantId: number, addOnSlug: string, userId: number, note?: string) {
    const addOn = await this.getAddOnBySlug(addOnSlug);

    // Check for existing pending request
    const existingRequest = await this.prisma.addOnRequest.findFirst({
      where: { tenantId, addOnId: addOn.id, status: ADDON_REQUEST_STATUS.PENDING },
    });
    if (existingRequest) {
      throw new BadRequestException('A pending request for this add-on already exists');
    }

    // Check if already active
    const existingAddOn = await this.prisma.tenantAddOn.findFirst({
      where: { tenantId, addOnId: addOn.id, status: TENANT_ADDON_STATUS.ACTIVE },
    });
    if (existingAddOn) {
      throw new BadRequestException('This add-on is already active');
    }

    return this.prisma.addOnRequest.create({
      data: {
        tenantId,
        addOnId: addOn.id,
        requestedByUserId: userId,
        requestNote: note,
      },
      include: { addOn: true },
    });
  }

  /**
   * List requests for the current tenant
   */
  async listMyRequests(tenantId: number) {
    return this.prisma.addOnRequest.findMany({
      where: { tenantId },
      include: { addOn: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * List requests with optional status filter (super admin)
   */
  async listRequests(status?: 'PENDING' | 'APPROVED' | 'DECLINED') {
    const requests = await this.prisma.addOnRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        addOn: true,
        tenant: { select: { id: true, tenantId: true, companyName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // For approved requests, check if the add-on is still active
    const enriched = await Promise.all(
      requests.map(async (req) => {
        if (req.status !== ADDON_REQUEST_STATUS.APPROVED) return { ...req, addOnActive: false };
        const sub = await this.prisma.tenantAddOn.findUnique({
          where: {
            tenantId_addOnId: { tenantId: req.tenantId, addOnId: req.addOnId },
          },
          select: { status: true },
        });
        return { ...req, addOnActive: sub?.status === TENANT_ADDON_STATUS.ACTIVE };
      }),
    );

    return enriched;
  }

  /**
   * Approve a request (super admin).
   * Updates request status, then activates the add-on. If activation fails
   * (e.g. Stripe error), the request status is reverted to 'pending'.
   */
  async approveRequest(requestId: string, reviewerId: number, giftedPriceCents?: number) {
    const request = await this.prisma.addOnRequest.findUnique({
      where: { id: requestId },
      include: { addOn: true },
    });
    if (!request) throw new NotFoundException('Add-on request not found');
    if (request.status !== ADDON_REQUEST_STATUS.PENDING) throw new BadRequestException('Request is not pending');

    const source = giftedPriceCents != null ? 'gifted' : 'purchased';
    const price = giftedPriceCents ?? request.addOn.priceCents ?? 0;

    // Update request status inside a transaction so it rolls back if activation fails
    return this.prisma.$transaction(async (tx) => {
      await tx.addOnRequest.update({
        where: { id: requestId },
        data: {
          status: ADDON_REQUEST_STATUS.APPROVED,
          reviewedByUserId: reviewerId,
          reviewedAt: new Date(),
          giftedPriceCents: giftedPriceCents ?? null,
        },
      });

      // Activate the add-on — if this fails (e.g. Stripe), the transaction
      // rolls back, reverting request status to 'pending' automatically
      return await this.activateAddOn(request.tenantId, request.addOn.slug, source, String(reviewerId), price);
    });
  }

  /**
   * Decline a request (super admin)
   */
  async declineRequest(requestId: string, reviewerId: number, reason: string) {
    const request = await this.prisma.addOnRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Add-on request not found');
    if (request.status !== ADDON_REQUEST_STATUS.PENDING) throw new BadRequestException('Request is not pending');

    return this.prisma.addOnRequest.update({
      where: { id: requestId },
      data: {
        status: ADDON_REQUEST_STATUS.DECLINED,
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
        declineReason: reason,
      },
    });
  }

  // ─── Monthly usage reset ──────────────────────────────────────────────────

  /**
   * Reset a single tenant's metered add-on usage for the given period boundary.
   *
   * Scoped to `tenantId` and guarded on `usageResetAt` so a retry/double-fire on
   * the tenant's local 1st-of-month does not double-reset: a tenant is "already
   * reset this period" once its active metered add-ons carry
   * `usageResetAt >= periodBoundary`. The cron loop (AddOnUsageResetService)
   * supplies `periodBoundary` as the first day of the tenant-local current month.
   */
  async resetMonthlyUsageForTenant(tenantId: number, periodBoundary: Date): Promise<{ reset: number }> {
    const { meteredAddOns, resetCount } = await this.prisma.$transaction(async (tx) => {
      // 1. Snapshot only this tenant's metered add-ons not yet reset for this period
      const snapshotAddOns = await tx.tenantAddOn.findMany({
        where: {
          tenantId,
          status: TENANT_ADDON_STATUS.ACTIVE,
          usageLimit: { not: null },
          // Idempotency guard: skip rows already stamped at/after the boundary.
          OR: [{ usageResetAt: null }, { usageResetAt: { lt: periodBoundary } }],
        },
        include: { addOn: { select: { featureKey: true } } },
      });

      if (snapshotAddOns.length === 0) return { meteredAddOns: [], resetCount: 0 };

      // 2. Bulk create usage_reset events (for invoicing)
      await tx.tenantAddOnEvent.createMany({
        data: snapshotAddOns.map((ta) => ({
          id: generateUuidV7(),
          tenantId: ta.tenantId,
          addOnId: ta.addOnId,
          eventType: 'usage_reset',
          changedBy: 'system',
          metadata: {
            finalUsage: ta.currentUsage,
            finalOverage: ta.overageUsage,
            usageLimit: ta.usageLimit,
            period: periodBoundary.toISOString().slice(0, 7), // YYYY-MM
          },
        })),
      });

      // 3. Bulk reset counters + stamp the boundary (the idempotency marker)
      const updateResult = await tx.tenantAddOn.updateMany({
        where: { tenantId, status: TENANT_ADDON_STATUS.ACTIVE, usageLimit: { not: null } },
        data: { currentUsage: 0, overageUsage: 0, usageResetAt: periodBoundary },
      });

      return { meteredAddOns: snapshotAddOns, resetCount: updateResult.count };
    });

    if (resetCount === 0) return { reset: 0 };

    // 4. Invalidate resolution caches for this tenant (outside transaction — idempotent)
    await Promise.all(
      meteredAddOns.map((ta) =>
        this.sallyCache.del(buildKey('sally:addons', 'resolution', String(ta.tenantId), ta.addOn.featureKey)),
      ),
    );

    return { reset: resetCount };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * After activating an add-on in the DB, add it as a Stripe subscription item
   * if the payment_system flag is enabled and the tenant has an active subscription.
   * Errors are logged but do not block the DB activation.
   */
  private async syncActivationToStripe(tenantId: number, slug: string, tenantAddOnId: string): Promise<void> {
    try {
      const paymentEnabled = await this.featureFlagsService.isEnabled('payment_system');
      if (!paymentEnabled) return;

      const addOn = await this.getAddOnBySlug(slug);
      const priceId = addOn.providerPriceId;
      if (!priceId) {
        throw new BadRequestException(
          `Add-on '${slug}' does not have a Stripe price configured. Configure providerPriceId before activating in payment mode.`,
        );
      }

      const itemId = await this.subscriptionService.addAddOnToSubscription(tenantId, priceId);

      if (!itemId) {
        throw new BadRequestException(
          'Cannot activate paid add-on — tenant has no active subscription. Subscribe to a plan first.',
        );
      }

      await this.prisma.tenantAddOn.update({
        where: { id: tenantAddOnId },
        data: { stripeSubscriptionItemId: itemId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to sync add-on '${slug}' to Stripe for tenant ${tenantId}: ${error}`,
        (error as Error).stack,
      );
      // Surface Stripe errors as 400s instead of letting them bubble as 500s
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(`Billing provider error: ${(error as Error).message}`);
    }
  }

  /**
   * After cancelling an add-on in the DB, remove the Stripe subscription item
   * if the payment_system flag is enabled and the item exists.
   * Errors are logged but do not block the DB cancellation.
   */
  private async syncCancellationToStripe(stripeSubscriptionItemId: string | null | undefined): Promise<void> {
    try {
      if (!stripeSubscriptionItemId) return;

      const paymentEnabled = await this.featureFlagsService.isEnabled('payment_system');
      if (!paymentEnabled) return;

      await this.subscriptionService.removeAddOnFromSubscription(stripeSubscriptionItemId);
    } catch (error) {
      // Log but don't block — the add-on is already cancelled in DB
      this.logger.error(
        `Failed to remove Stripe subscription item '${stripeSubscriptionItemId}': ${error}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * Resolve tier-aware usage limit from addOn.usageLimits JSON
   */
  private async resolveUsageLimit(tenantId: number, addOn: any): Promise<number | null> {
    if (!addOn.usageLimits) return null;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    if (!tenant) return null;

    const limits = addOn.usageLimits as Record<string, number>;
    return limits[tenant.plan] ?? null;
  }
}
