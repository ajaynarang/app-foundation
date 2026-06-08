import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { PlanGuard } from '../plan.guard';
import { PlansService } from '../../../domains/platform/plans/plans.service';
import { AddOnsService } from '../../../domains/platform/add-ons/add-ons.service';
import { FeatureFlagsService } from '../../../domains/platform/feature-flags/feature-flags.service';

// Mock isAddOnFeature from shared-types. Other named exports needed by the
// add-ons service (TenantAddOnStatusEnum / AddOnRequestStatusEnum) are
// preserved via requireActual so module-level enum constants resolve.
jest.mock('@app/shared-types', () => ({
  ...jest.requireActual('@app/shared-types'),
  isAddOnFeature: jest.fn().mockReturnValue(false),
}));

import { isAddOnFeature } from '@app/shared-types';

describe('PlanGuard', () => {
  let guard: PlanGuard;
  let reflector: Reflector;
  let plansService: Record<string, jest.Mock>;
  let addOnsService: Record<string, jest.Mock>;
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
    addOnsService = {
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
        { provide: AddOnsService, useValue: addOnsService },
        { provide: FeatureFlagsService, useValue: featureFlagsService },
      ],
    }).compile();

    guard = module.get(PlanGuard);
    reflector = module.get(Reflector);
  });

  it('should allow when no FEATURE_KEY metadata is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ role: 'DISPATCHER' });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should allow SUPER_ADMIN regardless of plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    const ctx = createMockContext({ role: 'SUPER_ADMIN' });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(plansService.getTenantPlan).not.toHaveBeenCalled();
  });

  it('should allow ENTERPRISE plan for any feature', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    plansService.getTenantPlan.mockResolvedValue('ENTERPRISE');
    const ctx = createMockContext({
      role: 'DISPATCHER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException for TRIAL_EXPIRED tenant plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    plansService.getTenantPlan.mockResolvedValue('TRIAL_EXPIRED');
    const ctx = createMockContext({
      role: 'DISPATCHER',
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
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    plansService.getTenantPlan.mockResolvedValue('SUSPENDED');
    const ctx = createMockContext({
      role: 'DISPATCHER',
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

  it('should check add-on via AddOnsService when feature is add-on type', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('eld_integration');
    (isAddOnFeature as jest.Mock).mockReturnValue(true);
    plansService.getTenantPlan.mockResolvedValue('STARTER');
    addOnsService.isFeatureEnabled.mockResolvedValue({ enabled: true });
    const ctx = createMockContext({
      role: 'DISPATCHER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(addOnsService.isFeatureEnabled).toHaveBeenCalledWith(1, 'eld_integration');
  });

  it('should throw ADD_ON_REQUIRED when add-on is not enabled', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('eld_integration');
    (isAddOnFeature as jest.Mock).mockReturnValue(true);
    plansService.getTenantPlan.mockResolvedValue('STARTER');
    addOnsService.isFeatureEnabled.mockResolvedValue({ enabled: false });
    const ctx = createMockContext({
      role: 'DISPATCHER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    try {
      await guard.canActivate(ctx);
      fail('Expected ForbiddenException');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.getResponse()).toMatchObject({ error: 'ADD_ON_REQUIRED' });
    }
  });

  it('should check plan entitlement for core features and allow', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    (isAddOnFeature as jest.Mock).mockReturnValue(false);
    plansService.getTenantPlan.mockResolvedValue('PROFESSIONAL');
    plansService.isFeatureEnabled.mockResolvedValue(true);
    const ctx = createMockContext({
      role: 'DISPATCHER',
      tenantId: 'tnt-1',
      tenantDbId: 1,
    });

    expect(await guard.canActivate(ctx)).toBe(true);
    expect(plansService.isFeatureEnabled).toHaveBeenCalledWith('PROFESSIONAL', 'shield');
  });

  it('should throw PLAN_UPGRADE_REQUIRED with correct plan suggestion', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    (isAddOnFeature as jest.Mock).mockReturnValue(false);
    plansService.getTenantPlan.mockResolvedValue('STARTER');
    // First call: check current plan — false
    // Then getRequiredPlan calls: STARTER=false, PROFESSIONAL=true
    plansService.isFeatureEnabled
      .mockResolvedValueOnce(false) // main check
      .mockResolvedValueOnce(false) // STARTER in getRequiredPlan
      .mockResolvedValueOnce(true); // PROFESSIONAL in getRequiredPlan
    const ctx = createMockContext({
      role: 'DISPATCHER',
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
      expect(response.requiredPlan).toBe('Fleet');
    }
  });

  it('should throw FEATURE_DISABLED when global feature flag is off', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    featureFlagsService.isEnabled.mockResolvedValue(false);
    const ctx = createMockContext({
      role: 'DISPATCHER',
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
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    const ctx = createMockContext({
      role: 'DISPATCHER',
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
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('shield');
    const ctx = createMockContext({
      role: 'DISPATCHER',
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
});
