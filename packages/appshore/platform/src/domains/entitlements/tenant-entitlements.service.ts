import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvitationStatus, TenantPlan } from '@appshore/db';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PlansService } from '../plans/plans.service';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import {
  PLAN_DENIAL_CODES,
  UPGRADE_PATH,
  accountSuspendedError,
  featureDisabledError,
  noTenantError,
  planDisplayName,
  planUpgradeRequiredError,
  trialExpiredError,
  userLimitReachedError,
  type PlanDenialCode,
} from '../../auth/guards/plan-access.errors';
import {
  PLAN_WOULD_DENY_EVENT,
  bypassesPlanChecks,
  killSwitchKey,
  planEnforcementMode,
} from '../../auth/guards/plan-access.rules';

export interface EntitlementActor {
  role?: string | null;
}

export interface EntitlementCheckOptions {
  /** The requesting user on a request path: a super-admin acting on a tenant bypasses the plan. Jobs omit it. */
  actor?: EntitlementActor;
  /** Where the check ran (`POST /api-keys`, `tool:<name>`, a job name), for the `plan.would_deny` line. */
  route?: string;
  /**
   * Enforce even under `PLAN_ENFORCEMENT=log`. For a check that was enforced before the switch existed (the WhatsApp
   * channel), so turning on log mode never loosens it.
   */
  strict?: boolean;
}

type Denial = { code: PlanDenialCode; plan: TenantPlan | null };

/**
 * The one plan rule. `PlanGuard` runs it for every `@RequireFeature` route; jobs, crons, handlers whose feature
 * depends on the body, and the AI tool pipeline call it directly. In order: kill switch, super-admin bypass,
 * single-tenant bypass (the implicit tenant is top tier), plan status, plan entitlement. `desk` and `audit_log` are
 * plan features like any other: the template sells no add-on for them (design item 17, decision 5).
 *
 * `PLAN_ENFORCEMENT=log` turns every plan denial (not the kill switch) into one `plan.would_deny` warning and lets
 * the call through. The seat limit follows the same switch.
 */
@Injectable()
export class TenantEntitlementsService {
  private readonly logger = new Logger(TenantEntitlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly plansService: PlansService,
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly config: ConfigService,
  ) {}

  /** True when the tenant may use `feature`. Never throws for a denial. */
  async hasFeature(
    tenantDbId: number | null,
    feature: string,
    options: EntitlementCheckOptions = {},
  ): Promise<boolean> {
    if (!(await this.killSwitchOn(feature))) return false;
    const denial = await this.evaluate(tenantDbId, feature, options.actor);
    return !denial || this.letThrough(denial, feature, options);
  }

  /** Throws the plan gate's 403 (`code` and `detail`) when the tenant may not use `feature`. */
  async assertFeature(
    tenantDbId: number | null,
    feature: string,
    options: EntitlementCheckOptions = {},
  ): Promise<void> {
    if (!(await this.killSwitchOn(feature))) throw featureDisabledError();
    const denial = await this.evaluate(tenantDbId, feature, options.actor);
    if (!denial || this.letThrough(denial, feature, options)) return;
    throw await this.errorFor(denial.code, feature);
  }

  /**
   * Refuse a new seat once the workspace's seats reach its plan's `userLimit` (null is unlimited). A seat is an
   * active member of the workspace plus each pending, unexpired invitation; super-admins are not members and take
   * none. Called where a seat is added: user create, user reactivate, invitation create. Not on a role change: every
   * member takes a seat, so a role change adds none. A tenant already over its limit loses nothing; adding is
   * refused until the count is under it.
   *
   * Count-then-write is not atomic: two requests racing for the last seat can both pass. Acceptable for a billing
   * limit; the next one is refused.
   */
  async assertUserSeatAvailable(
    tenantDbId: number,
    options: Omit<EntitlementCheckOptions, 'actor'> = {},
  ): Promise<void> {
    if (this.isSingleTenant()) return;
    const plan = await this.plansService.getTenantPlanByDbId(tenantDbId);
    if (!plan) return;
    const config = await this.prisma.planConfig.findUnique({ where: { plan }, select: { userLimit: true } });
    const userLimit = config?.userLimit ?? null;
    if (userLimit === null) return;

    const [members, pendingInvites] = await Promise.all([
      this.prisma.workspaceMember.count({
        where: { tenantId: tenantDbId, user: { isActive: true, deletedAt: null } },
      }),
      this.prisma.userInvitation.count({
        where: { tenantId: tenantDbId, status: InvitationStatus.PENDING, expiresAt: { gt: new Date() } },
      }),
    ]);
    if (members + pendingInvites < userLimit) return;

    const denial: Denial = { code: PLAN_DENIAL_CODES.USER_LIMIT_REACHED, plan };
    if (this.letThrough(denial, 'seats', options)) return;
    throw userLimitReachedError(plan, userLimit);
  }

  private async killSwitchOn(feature: string): Promise<boolean> {
    return this.featureFlagsService.isEnabled(killSwitchKey(feature));
  }

  private async evaluate(tenantDbId: number | null, feature: string, actor?: EntitlementActor): Promise<Denial | null> {
    if (bypassesPlanChecks(actor?.role)) return null;
    if (this.isSingleTenant()) return null;
    if (tenantDbId === null || tenantDbId === undefined) return { code: PLAN_DENIAL_CODES.NO_TENANT, plan: null };

    const plan = await this.plansService.getTenantPlanByDbId(tenantDbId);
    if (!plan) return { code: PLAN_DENIAL_CODES.NO_TENANT, plan: null };
    if (plan === TenantPlan.TRIAL_EXPIRED) return { code: PLAN_DENIAL_CODES.TRIAL_EXPIRED, plan };
    if (plan === TenantPlan.SUSPENDED) return { code: PLAN_DENIAL_CODES.ACCOUNT_SUSPENDED, plan };
    if (await this.plansService.isFeatureEnabled(plan, feature)) return null;
    return { code: PLAN_DENIAL_CODES.PLAN_UPGRADE_REQUIRED, plan };
  }

  /** Log mode: write the would-be denial and let it through. */
  private letThrough(denial: Denial, feature: string, options: EntitlementCheckOptions): boolean {
    if (options.strict || planEnforcementMode(this.config.get('planEnforcement')) !== 'log') return false;
    this.logger.warn({
      msg: `Plan would deny ${feature} (${denial.code})`,
      event: PLAN_WOULD_DENY_EVENT,
      feature,
      plan: denial.plan,
      route: options.route ?? null,
      code: denial.code,
    });
    return true;
  }

  private isSingleTenant(): boolean {
    return this.config.get<{ enabled?: boolean }>('multiTenancy')?.enabled === false;
  }

  private async errorFor(code: PlanDenialCode, feature: string): Promise<ForbiddenException> {
    switch (code) {
      case PLAN_DENIAL_CODES.TRIAL_EXPIRED:
        return trialExpiredError();
      case PLAN_DENIAL_CODES.ACCOUNT_SUSPENDED:
        return accountSuspendedError();
      case PLAN_DENIAL_CODES.PLAN_UPGRADE_REQUIRED:
        return planUpgradeRequiredError(await this.requiredPlanName(feature));
      default:
        return noTenantError();
    }
  }

  private async requiredPlanName(feature: string): Promise<string> {
    for (const plan of UPGRADE_PATH) {
      if (await this.plansService.isFeatureEnabled(plan, feature)) return planDisplayName(plan);
    }
    return planDisplayName(TenantPlan.ENTERPRISE);
  }
}
