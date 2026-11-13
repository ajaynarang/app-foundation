import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TenantPlan, UserRole } from '@appshore/db';
import { TenantEntitlementsService } from '@appshore/platform/domains/entitlements/tenant-entitlements.service';
import { PlansService } from '@appshore/platform/domains/plans/plans.service';
import { FeatureFlagsService } from '@appshore/platform/domains/feature-flags/feature-flags.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { fromApiKey, fromDeskResponsibility, fromOAuthUser, fromUser } from '@appshore/platform/auth/agent-principal';
import { ToolAccessPolicyService } from '../tool-access-policy.service';
import { ScopeRegistryService } from '../scope-registry.service';

/**
 * Role and plan for tool calls, by principal kind. The role is the acting person's membership role in the
 * principal's workspace; the plan rule is the real `TenantEntitlementsService.assertFeature`, the one `PlanGuard`
 * runs for every gated route.
 */
describe('ToolAccessPolicyService', () => {
  const registry = { roleRestrictionForTool: jest.fn(), planFeatureForTool: jest.fn() };
  const prisma = {
    workspaceMember: { findUnique: jest.fn() },
    tenant: { findUnique: jest.fn() },
  };
  const plans = { getTenantPlanByDbId: jest.fn(), isFeatureEnabled: jest.fn() };
  const flags = { isEnabled: jest.fn() };
  let planEnforcement = 'enforce';
  const config = {
    get: jest.fn((key: string) =>
      key === 'multiTenancy' ? { enabled: true } : key === 'planEnforcement' ? planEnforcement : undefined,
    ),
  };
  let svc: ToolAccessPolicyService;

  beforeEach(async () => {
    jest.resetAllMocks();
    flags.isEnabled.mockResolvedValue(true);
    planEnforcement = 'enforce';
    config.get.mockImplementation((key: string) =>
      key === 'multiTenancy' ? { enabled: true } : key === 'planEnforcement' ? planEnforcement : undefined,
    );
    const mod = await Test.createTestingModule({
      providers: [
        ToolAccessPolicyService,
        TenantEntitlementsService,
        { provide: ScopeRegistryService, useValue: registry },
        { provide: PrismaService, useValue: prisma },
        { provide: PlansService, useValue: plans },
        { provide: FeatureFlagsService, useValue: flags },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    svc = mod.get(ToolAccessPolicyService);
  });

  describe('actingRole', () => {
    it("reads the membership role for (acting user, the principal's workspace), not the home tenant", async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: UserRole.MEMBER });
      // The chat principal says ADMIN (its persona); the membership row in workspace 9 says MEMBER.
      const role = await svc.actingRole(fromUser({ userId: 4, tenantId: 9, role: 'ADMIN' }));
      expect(role).toBe(UserRole.MEMBER);
      expect(prisma.workspaceMember.findUnique).toHaveBeenCalledWith({
        where: { userId_tenantId: { userId: 4, tenantId: 9 } },
        select: { role: true },
      });
    });

    it('reads the person an OAuth client acts for, and the owner of an API key', async () => {
      prisma.workspaceMember.findUnique.mockResolvedValue({ role: UserRole.OWNER });
      await svc.actingRole(
        fromOAuthUser({ onBehalfOfUserDbId: 11, tenantDbId: 3, role: 'X', scopes: [], clientId: 'c' }),
      );
      await svc.actingRole(fromApiKey({ apiKeyId: 2, tenantId: 3, userId: 12, scopes: [] }));
      const ids = prisma.workspaceMember.findUnique.mock.calls.map((c) => c[0].where.userId_tenantId);
      expect(ids).toEqual([
        { userId: 11, tenantId: 3 },
        { userId: 12, tenantId: 3 },
      ]);
    });

    it('is null for a Desk duty, with no lookup, and null when there is no membership row', async () => {
      const desk = fromDeskResponsibility({ responsibilityId: 1, tenantId: 3, scopes: [], enabledByUserId: 5 });
      expect(await svc.actingRole(desk)).toBeNull();
      expect(prisma.workspaceMember.findUnique).not.toHaveBeenCalled();
      prisma.workspaceMember.findUnique.mockResolvedValue(null);
      expect(await svc.actingRole(fromUser({ userId: 4, tenantId: 9, role: 'OWNER' }))).toBeNull();
    });
  });

  describe('checkRole', () => {
    const user = fromUser({ userId: 4, tenantId: 9, role: 'OWNER' });

    it('allows a tool with no restriction for any member of the workspace', () => {
      registry.roleRestrictionForTool.mockReturnValue(undefined);
      expect(svc.checkRole(user, 't', UserRole.MEMBER)).toBeNull();
    });

    it('refuses every tool, restricted or not, for a person with no membership row in this workspace', () => {
      registry.roleRestrictionForTool.mockReturnValue(undefined);
      const key = fromApiKey({ apiKeyId: 2, tenantId: 3, userId: 12, scopes: ['platform:read'] });
      const grant = fromOAuthUser({ onBehalfOfUserDbId: 11, tenantDbId: 3, role: 'X', scopes: [], clientId: 'c' });
      for (const p of [user, key, grant]) {
        const res = svc.checkRole(p, 'list-support-tickets', null);
        expect(res?.isError).toBeFalsy();
        expect(JSON.parse(res.content[0].text)).toMatchObject({
          status: 'role_not_permitted',
          tool: 'list-support-tickets',
        });
      }
    });

    it('allows a role on the list', () => {
      registry.roleRestrictionForTool.mockReturnValue([UserRole.ADMIN, UserRole.OWNER]);
      expect(svc.checkRole(user, 't', UserRole.ADMIN)).toBeNull();
    });

    it("refuses a role off the list as a plain result, judged by this workspace's role", () => {
      registry.roleRestrictionForTool.mockReturnValue([UserRole.ADMIN, UserRole.OWNER]);
      // Owner of their home tenant, MEMBER in the active workspace: the active workspace decides.
      const res = svc.checkRole(user, 't', UserRole.MEMBER);
      expect(res?.isError).toBeFalsy();
      const body = JSON.parse(res.content[0].text);
      expect(body).toMatchObject({ status: 'role_not_permitted', tool: 't', requiredRoles: ['ADMIN', 'OWNER'] });
      expect(body.message).toMatch(/an admin or owner/);
    });

    it('refuses an API key whose owner lost membership in the workspace', () => {
      registry.roleRestrictionForTool.mockReturnValue([UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER]);
      const key = fromApiKey({ apiKeyId: 2, tenantId: 3, userId: 12, scopes: ['platform:write'] });
      const res = svc.checkRole(key, 't', null);
      expect(JSON.parse(res.content[0].text).status).toBe('role_not_permitted');
    });

    it('exempts a Desk duty from membership and role (its scope grant governs it)', () => {
      const desk = fromDeskResponsibility({ responsibilityId: 1, tenantId: 3, scopes: [], enabledByUserId: 5 });
      registry.roleRestrictionForTool.mockReturnValue([UserRole.OWNER]);
      expect(svc.checkRole(desk, 't', null)).toBeNull();
      registry.roleRestrictionForTool.mockReturnValue(undefined);
      expect(svc.checkRole(desk, 't', null)).toBeNull();
    });
  });

  describe('checkPlan (the real TenantEntitlementsService)', () => {
    const user = fromUser({ userId: 4, tenantId: 9, role: 'MEMBER' });

    it('allows a tool with no declared feature without reading the plan', async () => {
      registry.planFeatureForTool.mockReturnValue(undefined);
      expect(await svc.checkPlan(user, 't', UserRole.MEMBER)).toBeNull();
      expect(plans.getTenantPlanByDbId).not.toHaveBeenCalled();
    });

    it("allows when the workspace's plan has the feature, looked up by the principal's workspace", async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.PROFESSIONAL);
      plans.isFeatureEnabled.mockResolvedValue(true);
      expect(await svc.checkPlan(user, 't', UserRole.MEMBER)).toBeNull();
      expect(plans.getTenantPlanByDbId).toHaveBeenCalledWith(9);
      expect(plans.isFeatureEnabled).toHaveBeenCalledWith(TenantPlan.PROFESSIONAL, 'webhooks');
    });

    it('refuses as not_on_plan with the plan to upgrade to, as a plain result', async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockImplementation((plan: string) => Promise.resolve(plan === TenantPlan.PROFESSIONAL));
      const res = await svc.checkPlan(user, 't', UserRole.MEMBER);
      expect(res?.isError).toBeFalsy();
      expect(JSON.parse(res.content[0].text)).toMatchObject({
        status: 'not_on_plan',
        reason: 'PLAN_UPGRADE_REQUIRED',
        feature: 'webhooks',
      });
      // The message is the gate's own `detail`, the same copy the REST API answers with.
      expect(JSON.parse(res.content[0].text).message).toMatch(/Professional plan/);
    });

    it('applies to Desk too: the plan is the workspace’s', async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.SUSPENDED);
      const desk = fromDeskResponsibility({ responsibilityId: 1, tenantId: 9, scopes: [], enabledByUserId: 5 });
      const res = await svc.checkPlan(desk, 't', null);
      expect(JSON.parse(res.content[0].text)).toMatchObject({ status: 'not_on_plan', reason: 'ACCOUNT_SUSPENDED' });
    });

    it('a feature switched off by its flag is refused', async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      flags.isEnabled.mockResolvedValue(false);
      const res = await svc.checkPlan(user, 't', UserRole.MEMBER);
      expect(JSON.parse(res.content[0].text)).toMatchObject({ status: 'not_on_plan', reason: 'FEATURE_DISABLED' });
    });

    it('keeps no per-tenant memory of its own: every call asks the service again', async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.PROFESSIONAL);
      plans.isFeatureEnabled.mockResolvedValue(true);
      await svc.checkPlan(user, 't', UserRole.MEMBER);
      await svc.checkPlan(user, 't', UserRole.MEMBER);
      expect(plans.getTenantPlanByDbId).toHaveBeenCalledTimes(2);
    });

    it('PLAN_ENFORCEMENT=log applies to tools: a would-be denial runs, with a plan.would_deny line naming the tool', async () => {
      planEnforcement = 'log';
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(TenantPlan.STARTER);
      plans.isFeatureEnabled.mockResolvedValue(false);
      expect(await svc.checkPlan(user, 'create-hook', UserRole.MEMBER)).toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'plan.would_deny', feature: 'webhooks', route: 'tool:create-hook' }),
      );
      warn.mockRestore();
    });

    it('refuses when the workspace does not exist', async () => {
      registry.planFeatureForTool.mockReturnValue('webhooks');
      plans.getTenantPlanByDbId.mockResolvedValue(null);
      const res = await svc.checkPlan(fromUser({ userId: 4, tenantId: 404, role: 'MEMBER' }), 't', null);
      expect(JSON.parse(res.content[0].text)).toMatchObject({ status: 'not_on_plan', reason: 'NO_TENANT' });
    });
  });
});
