import { Controller, ForbiddenException, Get, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantPlan } from '@appshore/db';
import { PlanGuard } from '../plan.guard';
import { RequireFeature } from '../../decorators/require-feature.decorator';
import { NoFeatureGate } from '../../decorators/no-feature-gate.decorator';
import { TenantEntitlementsService } from '../../../domains/entitlements/tenant-entitlements.service';

@Controller('gated')
@RequireFeature('api_keys')
class GatedController {
  @Get()
  list() {
    return [];
  }

  @Get('front-door')
  @NoFeatureGate()
  frontDoor() {
    return {};
  }

  @Get('voice')
  @RequireFeature('voice_mode')
  voice() {
    return {};
  }
}

@Controller('open')
class OpenController {
  @Get()
  list() {
    return [];
  }

  @Get('ungated')
  @NoFeatureGate()
  ungated() {
    return {};
  }
}

/**
 * `PlanGuard` reads the route's feature (`@NoFeatureGate` on the handler first, then the handler's or the class's
 * `@RequireFeature`) and runs the one plan rule in `TenantEntitlementsService` against the real plan and flag
 * services' answers.
 */
describe('PlanGuard', () => {
  let plans: { getTenantPlanByDbId: jest.Mock; isFeatureEnabled: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let multiTenancy: { enabled: boolean };
  let guard: PlanGuard;

  const ctx = (cls: any, handler: string, user?: Record<string, unknown>): ExecutionContext => {
    const request = { user, method: 'GET', url: '/x?token=secret', route: { path: '/gated' } };
    return {
      getHandler: () => cls.prototype[handler],
      getClass: () => cls,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  };
  const member = { role: 'MEMBER', tenantId: 'tnt-1', tenantDbId: 1 };

  const responseOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      return (e as ForbiddenException).getResponse() as Record<string, unknown>;
    }
    throw new Error('expected a ForbiddenException');
  };

  beforeEach(() => {
    plans = { getTenantPlanByDbId: jest.fn(), isFeatureEnabled: jest.fn() };
    flags = { isEnabled: jest.fn().mockResolvedValue(true) };
    multiTenancy = { enabled: true };
    const config = { get: (key: string) => (key === 'multiTenancy' ? multiTenancy : undefined) };
    const entitlements = new TenantEntitlementsService({} as any, plans as any, flags as any, config as any);
    guard = new PlanGuard(new Reflector(), entitlements);
  });

  it('allows a route with no feature without reading anything', async () => {
    expect(await guard.canActivate(ctx(OpenController, 'list', member))).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
  });

  it('gates a route by its class feature, and a handler feature wins over the class', async () => {
    plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.PROFESSIONAL);
    plans.isFeatureEnabled.mockResolvedValue(true);
    await guard.canActivate(ctx(GatedController, 'list', member));
    await guard.canActivate(ctx(GatedController, 'voice', member));
    expect(plans.isFeatureEnabled.mock.calls).toEqual([
      [TenantPlan.PROFESSIONAL, 'api_keys'],
      [TenantPlan.PROFESSIONAL, 'voice_mode'],
    ]);
  });

  it('@NoFeatureGate on a handler opens that one route under a gated controller', async () => {
    expect(await guard.canActivate(ctx(GatedController, 'frontDoor', member))).toBe(true);
    expect(flags.isEnabled).not.toHaveBeenCalled();
    expect(await guard.canActivate(ctx(OpenController, 'ungated', member))).toBe(true);
  });

  it('allows a super-admin regardless of plan', async () => {
    expect(await guard.canActivate(ctx(GatedController, 'list', { role: 'SUPER_ADMIN' }))).toBe(true);
    expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
  });

  it('allows a plan that includes the feature', async () => {
    plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.ENTERPRISE);
    plans.isFeatureEnabled.mockResolvedValue(true);
    expect(await guard.canActivate(ctx(GatedController, 'list', member))).toBe(true);
    expect(plans.getTenantPlanByDbId).toHaveBeenCalledWith(1);
  });

  it.each([
    [TenantPlan.TRIAL_EXPIRED, 'TRIAL_EXPIRED'],
    [TenantPlan.SUSPENDED, 'ACCOUNT_SUSPENDED'],
  ])('refuses a %s tenant with %s', async (plan, code) => {
    plans.getTenantPlanByDbId.mockResolvedValue(plan);
    expect(await responseOf(guard.canActivate(ctx(GatedController, 'list', member)))).toMatchObject({ code });
  });

  it('refuses a plan without the feature with PLAN_UPGRADE_REQUIRED, code and detail only', async () => {
    plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.STARTER);
    plans.isFeatureEnabled.mockImplementation(async (plan: TenantPlan) => plan === TenantPlan.PROFESSIONAL);
    const body = await responseOf(guard.canActivate(ctx(GatedController, 'list', member)));
    expect(body).toEqual({ code: 'PLAN_UPGRADE_REQUIRED', detail: expect.stringMatching(/Professional plan/) });
  });

  it('refuses with FEATURE_DISABLED when the kill switch is off', async () => {
    flags.isEnabled.mockResolvedValue(false);
    expect(await responseOf(guard.canActivate(ctx(GatedController, 'list', member)))).toMatchObject({
      code: 'FEATURE_DISABLED',
    });
  });

  it('refuses with NO_TENANT when either tenant id is missing', async () => {
    for (const user of [{ role: 'MEMBER', tenantId: 'tnt-1' }, { role: 'MEMBER', tenantDbId: 1 }, undefined]) {
      expect(await responseOf(guard.canActivate(ctx(GatedController, 'list', user)))).toMatchObject({
        code: 'NO_TENANT',
      });
    }
  });

  it('allows any feature when multi-tenancy is disabled (implicit top tier)', async () => {
    multiTenancy.enabled = false;
    expect(await guard.canActivate(ctx(GatedController, 'list', member))).toBe(true);
    expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
  });
});
