import { ForbiddenException, Logger } from '@nestjs/common';
import { InvitationStatus, TenantPlan } from '@appshore/db';
import { TenantEntitlementsService } from '../tenant-entitlements.service';

/**
 * The one plan rule, for routes (through `PlanGuard`), jobs, handlers and AI tools. Order: kill switch, super-admin
 * bypass, single-tenant bypass, plan status, plan entitlement. Then the seat check, and `PLAN_ENFORCEMENT=log`.
 */
describe('TenantEntitlementsService', () => {
  let prisma: any;
  let plans: { isFeatureEnabled: jest.Mock; getTenantPlanByDbId: jest.Mock };
  let flags: { isEnabled: jest.Mock };
  let config: { multiTenancy: { enabled: boolean }; planEnforcement: string };
  let service: TenantEntitlementsService;
  let warn: jest.SpyInstance;

  const givenPlan = (plan: TenantPlan | null) => plans.getTenantPlanByDbId.mockResolvedValue(plan);
  const build = () =>
    new TenantEntitlementsService(
      prisma,
      plans as any,
      flags as any,
      {
        get: (key: string) => (config as any)[key],
      } as any,
    );

  beforeEach(() => {
    prisma = {
      planConfig: { findUnique: jest.fn() },
      workspaceMember: { count: jest.fn().mockResolvedValue(0) },
      userInvitation: { count: jest.fn().mockResolvedValue(0) },
    };
    plans = { isFeatureEnabled: jest.fn(), getTenantPlanByDbId: jest.fn() };
    flags = { isEnabled: jest.fn().mockResolvedValue(true) };
    config = { multiTenancy: { enabled: true }, planEnforcement: 'enforce' };
    service = build();
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  describe('hasFeature', () => {
    it('is false when the kill switch is off, without reading the tenant', async () => {
      flags.isEnabled.mockResolvedValue(false);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(false);
      expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
    });

    it("reads the WhatsApp channel's own launch flag as the kill switch for whatsapp_notifications", async () => {
      givenPlan(TenantPlan.ENTERPRISE);
      plans.isFeatureEnabled.mockResolvedValue(true);
      await service.hasFeature(7, 'whatsapp_notifications');
      expect(flags.isEnabled).toHaveBeenCalledWith('whatsapp_channel');
    });

    it('is false for an unknown tenant and for no tenant', async () => {
      givenPlan(null);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(false);
      expect(await service.hasFeature(null, 'voice_mode')).toBe(false);
    });

    it.each([TenantPlan.TRIAL_EXPIRED, TenantPlan.SUSPENDED])('is false for a %s tenant', async (plan) => {
      givenPlan(plan);
      plans.isFeatureEnabled.mockResolvedValue(true);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(false);
    });

    it('resolves a feature against the plan catalog', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(false);
      expect(plans.isFeatureEnabled).toHaveBeenCalledWith(TenantPlan.STARTER, 'voice_mode');
      plans.isFeatureEnabled.mockResolvedValue(true);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(true);
    });

    it('treats desk and audit_log as plan features (no add-on branch)', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(true);
      expect(await service.hasFeature(7, 'desk')).toBe(true);
      expect(plans.isFeatureEnabled).toHaveBeenCalledWith(TenantPlan.STARTER, 'desk');
    });

    it('bypasses the plan in single-tenant mode, but not the kill switch', async () => {
      config.multiTenancy.enabled = false;
      service = build();
      expect(await service.hasFeature(7, 'voice_mode')).toBe(true);
      expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
      flags.isEnabled.mockResolvedValue(false);
      expect(await service.hasFeature(7, 'voice_mode')).toBe(false);
    });
  });

  describe('a super-admin actor', () => {
    it('bypasses the plan, like the route guard', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      await expect(service.assertFeature(7, 'api_keys', { actor: { role: 'SUPER_ADMIN' } })).resolves.toBeUndefined();
      expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
    });

    it('still honours the kill switch', async () => {
      flags.isEnabled.mockResolvedValue(false);
      await expect(service.assertFeature(7, 'api_keys', { actor: { role: 'SUPER_ADMIN' } })).rejects.toMatchObject({
        response: { code: 'FEATURE_DISABLED' },
      });
    });

    it('does not bypass for any other role', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      await expect(service.assertFeature(7, 'api_keys', { actor: { role: 'OWNER' } })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });

  describe('assertFeature: the 403 bodies carry code and detail only', () => {
    const bodyOf = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        return (e as ForbiddenException).getResponse() as Record<string, unknown>;
      }
      throw new Error('expected a ForbiddenException');
    };

    it.each([
      [TenantPlan.TRIAL_EXPIRED, 'TRIAL_EXPIRED'],
      [TenantPlan.SUSPENDED, 'ACCOUNT_SUSPENDED'],
    ])('a %s tenant is refused with %s', async (plan, code) => {
      givenPlan(plan);
      const body = await bodyOf(service.assertFeature(7, 'api_keys'));
      expect(Object.keys(body).sort()).toEqual(['code', 'detail']);
      expect(body.code).toBe(code);
    });

    it('a missing tenant is NO_TENANT', async () => {
      givenPlan(null);
      expect((await bodyOf(service.assertFeature(7, 'api_keys'))).code).toBe('NO_TENANT');
      expect((await bodyOf(service.assertFeature(null, 'api_keys'))).code).toBe('NO_TENANT');
    });

    it('a plan without the feature is PLAN_UPGRADE_REQUIRED, naming the cheapest plan that has it', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockImplementation(async (plan: TenantPlan) => plan === TenantPlan.ENTERPRISE);
      const body = await bodyOf(service.assertFeature(7, 'api_keys'));
      expect(Object.keys(body).sort()).toEqual(['code', 'detail']);
      expect(body.code).toBe('PLAN_UPGRADE_REQUIRED');
      expect(body.detail).toMatch(/Enterprise plan/);
    });
  });

  describe('PLAN_ENFORCEMENT=log', () => {
    beforeEach(() => {
      config.planEnforcement = 'log';
      service = build();
    });

    it('lets a plan denial through and writes one plan.would_deny warning with feature, plan and route', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      await expect(service.assertFeature(7, 'api_keys', { route: 'POST /api-keys' })).resolves.toBeUndefined();
      expect(await service.hasFeature(7, 'api_keys')).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'plan.would_deny',
          feature: 'api_keys',
          plan: TenantPlan.STARTER,
          route: 'POST /api-keys',
          code: 'PLAN_UPGRADE_REQUIRED',
        }),
      );
    });

    it('still refuses when the kill switch is off', async () => {
      flags.isEnabled.mockResolvedValue(false);
      await expect(service.assertFeature(7, 'api_keys')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stays strict for a caller that asks (a check that was enforced before this switch existed)', async () => {
      givenPlan(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      expect(await service.hasFeature(7, 'whatsapp_notifications', { strict: true })).toBe(false);
    });
  });

  describe('assertUserSeatAvailable', () => {
    const givenLimit = (userLimit: number | null) => prisma.planConfig.findUnique.mockResolvedValue({ userLimit });

    it('passes when the plan has no user limit', async () => {
      givenPlan(TenantPlan.ENTERPRISE);
      givenLimit(null);
      await expect(service.assertUserSeatAvailable(7)).resolves.toBeUndefined();
      expect(prisma.workspaceMember.count).not.toHaveBeenCalled();
    });

    it('counts active members of the workspace plus pending, unexpired invitations', async () => {
      givenPlan(TenantPlan.STARTER);
      givenLimit(5);
      prisma.workspaceMember.count.mockResolvedValue(3);
      prisma.userInvitation.count.mockResolvedValue(1);
      await expect(service.assertUserSeatAvailable(7)).resolves.toBeUndefined();

      expect(prisma.workspaceMember.count).toHaveBeenCalledWith({
        where: { tenantId: 7, user: { isActive: true, deletedAt: null } },
      });
      expect(prisma.userInvitation.count).toHaveBeenCalledWith({
        where: { tenantId: 7, status: InvitationStatus.PENDING, expiresAt: { gt: expect.any(Date) } },
      });
    });

    it('refuses with USER_LIMIT_REACHED once members plus invitations reach the limit', async () => {
      givenPlan(TenantPlan.STARTER);
      givenLimit(5);
      prisma.workspaceMember.count.mockResolvedValue(4);
      prisma.userInvitation.count.mockResolvedValue(1);
      await expect(service.assertUserSeatAvailable(7)).rejects.toMatchObject({
        response: { code: 'USER_LIMIT_REACHED', detail: expect.stringMatching(/5 users/) },
      });
    });

    it('a tenant already over its limit is refused, not cut back', async () => {
      givenPlan(TenantPlan.STARTER);
      givenLimit(5);
      prisma.workspaceMember.count.mockResolvedValue(9);
      await expect(service.assertUserSeatAvailable(7)).rejects.toMatchObject({
        response: { code: 'USER_LIMIT_REACHED' },
      });
    });

    it('does not count in single-tenant mode', async () => {
      config.multiTenancy.enabled = false;
      service = build();
      await expect(service.assertUserSeatAvailable(7)).resolves.toBeUndefined();
      expect(prisma.planConfig.findUnique).not.toHaveBeenCalled();
    });

    it('in log mode lets the seat through and logs plan.would_deny', async () => {
      config.planEnforcement = 'log';
      service = build();
      givenPlan(TenantPlan.STARTER);
      givenLimit(5);
      prisma.workspaceMember.count.mockResolvedValue(5);
      await expect(service.assertUserSeatAvailable(7, { route: 'POST /invitations' })).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'plan.would_deny', code: 'USER_LIMIT_REACHED', route: 'POST /invitations' }),
      );
    });
  });
});
