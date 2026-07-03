import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PlansService } from '../../domains/platform/plans/plans.service';
import { FeatureFlagsService } from '../../domains/platform/feature-flags/feature-flags.service';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { TenantPlan } from '@appshore/db';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly plansService: PlansService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly configService: ConfigService,
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

    // Single-tenant mode: the implicit tenant is treated as top tier, so all
    // entitlement checks pass.
    const multiTenancy = this.configService.get('multiTenancy', { infer: true });
    if (multiTenancy?.enabled === false) return true;

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

    // 3. ENTERPRISE gets everything
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

    // 4. Check plan entitlement
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

  private async getRequiredPlan(feature: string): Promise<string> {
    const plans = [TenantPlan.STARTER, TenantPlan.PROFESSIONAL, TenantPlan.ENTERPRISE];
    const displayNames: Record<string, string> = {
      STARTER: 'Starter',
      PROFESSIONAL: 'Professional',
      ENTERPRISE: 'Enterprise',
      TRIAL: 'Starter',
      TRIAL_EXPIRED: 'Starter',
      SUSPENDED: 'Starter',
    };
    for (const plan of plans) {
      const enabled = await this.plansService.isFeatureEnabled(plan, feature);
      if (enabled) return displayNames[plan] ?? 'Enterprise';
    }
    return 'Enterprise';
  }
}
