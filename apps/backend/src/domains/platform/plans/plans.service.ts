import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { TenantPlan } from '@prisma/client';
import { SallyCacheService } from '../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M, CACHE_TTL_COLD_10M } from '../../../constants/cache.constants';
import { generateUuidV7 } from '../../../shared/utils/uuidv7';

@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async getAllPlanConfigs() {
    const configs = await this.prisma.planConfig.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: 'asc' },
    });

    const entitlements = await this.prisma.planEntitlement.findMany({
      where: { plan: { in: configs.map((c) => c.plan) } },
      select: { plan: true, feature: true, displayName: true, enabled: true },
    });

    const byPlan = new Map<string, { feature: string; displayName: string; enabled: boolean }[]>();
    for (const e of entitlements) {
      const list = byPlan.get(e.plan) ?? [];
      list.push({
        feature: e.feature,
        displayName: e.displayName,
        enabled: e.enabled,
      });
      byPlan.set(e.plan, list);
    }

    return configs.map((c) => ({
      ...c,
      entitlements: (byPlan.get(c.plan) ?? []).sort((a, b) => Number(b.enabled) - Number(a.enabled)),
    }));
  }

  async getTenantPlan(tenantId: string): Promise<TenantPlan> {
    return this.cache.getOrSet<TenantPlan>(
      buildKey('sally:plans', 'tenant-plan', tenantId),
      async () => {
        const tenant = await this.prisma.tenant.findUnique({
          where: { tenantId },
          select: { plan: true },
        });
        return tenant?.plan ?? TenantPlan.TRIAL;
      },
      CACHE_TTL_WARM_5M,
    );
  }

  async isFeatureEnabled(plan: TenantPlan, feature: string): Promise<boolean> {
    if (plan === TenantPlan.ENTERPRISE) return true;
    if (plan === TenantPlan.TRIAL_EXPIRED || plan === TenantPlan.SUSPENDED) return false;

    return this.cache.getOrSet<boolean>(
      buildKey('sally:plans', 'entitlement', plan, feature),
      async () => {
        const entitlement = await this.prisma.planEntitlement.findUnique({
          where: { plan_feature: { plan, feature } },
        });
        return entitlement?.enabled ?? false;
      },
      CACHE_TTL_COLD_10M,
    );
  }

  /**
   * Whether ANY plan has an entitlement row for `feature` (enabled or not).
   * Used to distinguish "this feature is gated but the tenant's plan excludes
   * it" from "this feature has no entitlement config yet — grandfathered pass".
   */
  async isFeatureConfigured(feature: string): Promise<boolean> {
    return this.cache.getOrSet<boolean>(
      buildKey('sally:plans', 'entitlement-exists', feature),
      async () => {
        const row = await this.prisma.planEntitlement.findFirst({
          where: { feature },
          select: { plan: true },
        });
        return row !== null;
      },
      CACHE_TTL_COLD_10M,
    );
  }

  async assignPlan(tenantId: string, newPlan: TenantPlan, assignedBy: string, reason?: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { tenantId },
      select: { id: true, plan: true },
    });

    const result = await this.prisma.$transaction([
      this.prisma.tenant.update({
        where: { tenantId },
        data: {
          plan: newPlan,
          planAssignedAt: new Date(),
          planAssignedBy: assignedBy,
        },
      }),
      this.prisma.tenantPlanEvent.create({
        data: {
          id: generateUuidV7(),
          tenantId: tenant.id,
          fromPlan: tenant.plan,
          toPlan: newPlan,
          changedBy: assignedBy,
          reason: reason ?? null,
        },
      }),
    ]);

    await this.cache.del(buildKey('sally:plans', 'tenant-plan', tenantId));

    return result[0];
  }

  async updateProviderPriceId(plan: TenantPlan, providerPriceId: string | null) {
    return this.prisma.planConfig.update({
      where: { plan },
      data: { providerPriceId: providerPriceId || null },
    });
  }

  async updatePlanConfig(
    planKey: TenantPlan,
    data: {
      displayName?: string;
      tagline?: string;
      pricePerUnit?: number | null;
      fleetLimit?: number | null;
      userLimit?: number | null;
      isPopular?: boolean;
      ctaLabel?: string;
      providerPriceId?: string | null;
    },
  ) {
    const updated = await this.prisma.planConfig.update({
      where: { plan: planKey },
      data,
    });

    await this.cache.del(buildKey('sally:plans', 'all'));

    this.logger.log(`Plan config '${planKey}' updated: ${JSON.stringify(data)}`);
    return updated;
  }

  async toggleEntitlement(planKey: TenantPlan, feature: string, enabled: boolean) {
    const updated = await this.prisma.planEntitlement.update({
      where: { plan_feature: { plan: planKey, feature } },
      data: { enabled },
    });

    await this.cache.del(buildKey('sally:plans', 'entitlement', planKey, feature));

    this.logger.log(`Entitlement '${feature}' for plan '${planKey}' set to ${enabled}`);
    return updated;
  }

  async getTenantPlanDetails(tenantId: string) {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { tenantId },
      select: {
        plan: true,
        trialStartedAt: true,
        trialEndsAt: true,
        planAssignedAt: true,
        planAssignedBy: true,
        fleetLimitWarning: true,
        id: true,
      },
    });

    const [planConfig, vehicleCount, planEvents, entitlements] = await Promise.all([
      this.prisma.planConfig.findUnique({ where: { plan: tenant.plan } }),
      this.prisma.vehicle.count({
        where: { tenantId: tenant.id, lifecycleStatus: 'ACTIVE' },
      }),
      this.prisma.tenantPlanEvent.findMany({
        where: { tenantId: tenant.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      this.prisma.planEntitlement.findMany({
        where: { plan: tenant.plan },
        select: { feature: true, displayName: true, enabled: true },
      }),
    ]);

    const daysLeftInTrial = tenant.trialEndsAt
      ? Math.max(0, Math.ceil((tenant.trialEndsAt.getTime() - Date.now()) / 86400000))
      : null;

    return {
      plan: tenant.plan,
      trialStartedAt: tenant.trialStartedAt,
      trialEndsAt: tenant.trialEndsAt,
      planAssignedAt: tenant.planAssignedAt,
      planAssignedBy: tenant.planAssignedBy,
      fleetLimitWarning: tenant.fleetLimitWarning,
      planConfig: planConfig
        ? {
            ...planConfig,
            entitlements: [...entitlements].sort((a, b) => Number(b.enabled) - Number(a.enabled)),
          }
        : null,
      vehicleCount,
      fleetLimit: planConfig?.fleetLimit ?? null,
      daysLeftInTrial,
      planEvents,
    };
  }
}
