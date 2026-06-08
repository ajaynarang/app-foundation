import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlansService } from '../../domains/platform/plans/plans.service';
import { AddOnsService } from '../../domains/platform/add-ons/add-ons.service';
import { FeatureFlagsService } from '../../domains/platform/feature-flags/feature-flags.service';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { TenantPlan } from '@prisma/client';
import { isAddOnFeature } from '@sally/shared-types';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plansService: PlansService,
    private readonly addOnsService: AddOnsService,
    private readonly featureFlagsService: FeatureFlagsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredFeature) return true;

    // 1. Check global feature flag (kill-switch)
    const flagEnabled = await this.featureFlagsService.isEnabled(requiredFeature);
    if (!flagEnabled) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        feature: requiredFeature,
        message: 'This feature is currently unavailable.',
      });
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // 2. SUPER_ADMIN bypasses plan checks
    if (user?.role === 'SUPER_ADMIN') return true;

    if (!user?.tenantDbId) {
      throw new ForbiddenException({
        code: 'NO_TENANT',
        message: 'Tenant context required for feature access',
      });
    }

    if (!user?.tenantId) {
      throw new ForbiddenException({
        code: 'NO_TENANT',
        message: 'No tenant context found',
      });
    }

    const plan = await this.plansService.getTenantPlan(user.tenantId);

    // 3. ENTERPRISE gets everything (all entitlements + all add-ons)
    if (plan === TenantPlan.ENTERPRISE) return true;

    if (plan === TenantPlan.TRIAL_EXPIRED) {
      throw new ForbiddenException({
        code: 'TRIAL_EXPIRED',
        message: 'Your trial has ended. Please contact sales to continue.',
      });
    }

    if (plan === TenantPlan.SUSPENDED) {
      throw new ForbiddenException({
        code: 'ACCOUNT_SUSPENDED',
        message: 'Your account has been suspended. Please contact support.',
      });
    }

    // 4. Route check based on feature type
    if (isAddOnFeature(requiredFeature)) {
      // Check add-on system
      const resolution = await this.addOnsService.isFeatureEnabled(user.tenantDbId, requiredFeature);

      if (resolution.enabled) return true;

      // Not enabled — throw with add-on info
      throw new ForbiddenException({
        statusCode: 403,
        error: 'ADD_ON_REQUIRED',
        featureKey: requiredFeature,
        message: 'This feature requires the add-on to be purchased',
      });
    } else {
      // Check plan entitlement (core features)
      const allowed = await this.plansService.isFeatureEnabled(plan, requiredFeature);

      if (allowed) return true;

      // Not allowed — determine which plan is required
      const requiredPlan = await this.getRequiredPlan(requiredFeature);
      throw new ForbiddenException({
        statusCode: 403,
        error: 'PLAN_UPGRADE_REQUIRED',
        featureKey: requiredFeature,
        requiredPlan,
        message: `This feature requires the ${requiredPlan} plan or higher`,
      });
    }
  }

  private async getRequiredPlan(feature: string): Promise<string> {
    const plans = [TenantPlan.STARTER, TenantPlan.PROFESSIONAL, TenantPlan.ENTERPRISE];
    const displayNames: Record<string, string> = {
      STARTER: 'Haul',
      PROFESSIONAL: 'Fleet',
      ENTERPRISE: 'Freight Force',
      TRIAL: 'Haul',
      TRIAL_EXPIRED: 'Haul',
      SUSPENDED: 'Haul',
    };
    for (const plan of plans) {
      const enabled = await this.plansService.isFeatureEnabled(plan, feature);
      if (enabled) return displayNames[plan] ?? 'Freight Force';
    }
    return 'Freight Force';
  }
}
