import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PlanGuard } from '../plan.guard';
import { PlansService } from '../../../domains/platform/plans/plans.service';
import { FeatureFlagsService } from '../../../domains/platform/feature-flags/feature-flags.service';

describe('PlanGuard', () => {
  let guard: PlanGuard;
  let reflector: Reflector;
  let plansService: Record<string, jest.Mock>;
  let featureFlagsService: Record<string, jest.Mock>;

  const createMockContext = (user?: Record<string, any>) => {
    const request = { user };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => {},
      getClass: () => class TestController {},
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    plansService = {
      getTenantPlan: jest.fn(),
      isFeatureEnabled: jest.fn(),
    };
    featureFlagsService = {
      isEnabled: jest.fn().mockResolvedValue(true),
    };

    const module = await Test.createTestingModule({
      providers: [
        PlanGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
        { provide: PlansService, useValue: plansService },
        { provide: FeatureFlagsService, useValue: featureFlagsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue({ enabled: true, implicitTenantId: 1 }) },
        },
      ],
    }).compile();

    guard = module.get(PlanGuard);
    reflector = module.get(Reflector);
  });

  it('should allow when no FEATURE_KEY metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ role: 'MEMBER' });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN regardless of plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    const ctx = createMockContext({ role: 'SUPER_ADMIN' });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(plansService.getTenantPlan).not.toHaveBeenCalled();
  });

  it('should allow ENTERPRISE plan for any feature', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    plansService.getTenantPlan.mockResolvedValue('ENTERPRISE');
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException for TRIAL_EXPIRED tenant plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    plansService.getTenantPlan.mockResolvedValue('TRIAL_EXPIRED');
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'TRIAL_EXPIRED' });
    }
  });

  it('should throw ForbiddenException for SUSPENDED tenant plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    plansService.getTenantPlan.mockResolvedValue('SUSPENDED');
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'ACCOUNT_SUSPENDED' });
    }
  });

  it('should check plan entitlement for core features and allow', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    plansService.getTenantPlan.mockResolvedValue('PROFESSIONAL');
    plansService.isFeatureEnabled.mockResolvedValue(true);
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(plansService.isFeatureEnabled).toHaveBeenCalledWith('PROFESSIONAL', 'api_keys');
  });

  it('should throw PLAN_UPGRADE_REQUIRED with correct plan suggestion', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    plansService.getTenantPlan.mockResolvedValue('STARTER');
    // First call: check current plan — false
    // Then getRequiredPlan calls: STARTER=false, PROFESSIONAL=true
    plansService.isFeatureEnabled
      .mockResolvedValueOnce(false) // main check
      .mockResolvedValueOnce(false) // STARTER in getRequiredPlan
      .mockResolvedValueOnce(true); // PROFESSIONAL in getRequiredPlan
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = e.getResponse();
      expect(response.error).toBe('PLAN_UPGRADE_REQUIRED');
      expect(response.requiredPlan).toBe('Professional');
    }
  });

  it('should throw FEATURE_DISABLED when global feature flag is off', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    featureFlagsService.isEnabled.mockResolvedValue(false);
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'FEATURE_DISABLED' });
    }
  });

  it('should throw NO_TENANT when tenantDbId is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantId: 'tnt-1',
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'NO_TENANT' });
    }
  });

  it('should throw NO_TENANT when tenantId is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('api_keys');
    const ctx = createMockContext({
      role: 'MEMBER',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ code: 'NO_TENANT' });
    }
  });

  it('should allow any feature when multi-tenancy is disabled (implicit top tier)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        PlanGuard,
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn().mockReturnValue('api_keys') } },
        { provide: PlansService, useValue: plansService },
        { provide: FeatureFlagsService, useValue: featureFlagsService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue({ enabled: false, implicitTenantId: 1 }) },
        },
      ],
    }).compile();
    const stGuard = module.get(PlanGuard);
    const ctx = createMockContext({ role: 'MEMBER', tenantId: 'tnt-1', tenantDbId: 1 });

    expect(await stGuard.canActivate(ctx)).toBe(true);
    expect(plansService.getTenantPlan).not.toHaveBeenCalled();
  });
});
