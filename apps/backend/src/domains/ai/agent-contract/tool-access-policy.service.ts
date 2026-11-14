import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { TenantEntitlementsService } from '@appshore/platform/domains/entitlements/tenant-entitlements.service';
import type { AgentPrincipal } from '@appshore/platform/auth/agent-principal';
import { ScopeRegistryService } from './scope-registry.service';
import type { ToolResult } from './tool-executor.service';

/**
 * Server-side role and plan checks for every tool call, applied by `InvocationPipelineService` before any
 * confirmation is asked for. Each check returns `null` to allow, or a `ToolResult` the model relays in plain words.
 * A refusal is deliberately NOT `isError`: it is an answer ("only an owner can do that"), not a failure to retry.
 */
@Injectable()
export class ToolAccessPolicyService {
  private readonly logger = new Logger(ToolAccessPolicyService.name);

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly prisma: PrismaService,
    private readonly entitlements: TenantEntitlementsService,
  ) {}

  /**
   * The acting person's CURRENT role in the principal's workspace, from `WorkspaceMember`. One user holds a role per
   * workspace, so the role is read for (acting user, `principal.tenantId`), never from the user's home tenant, the
   * chat persona or the JWT. `null` for a Desk duty (it acts under its supervisor's enablement) and for a person
   * with no membership row in that workspace.
   */
  async actingRole(principal: AgentPrincipal): Promise<UserRole | null> {
    if (principal.kind === 'desk_responsibility') return null;
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_tenantId: { userId: actingUserId(principal), tenantId: principal.tenantId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  /**
   * Membership, then `@RestrictToRoles`. A Desk duty is exempt from both (it acts under its supervisor's enablement
   * and its own scope grant). Any other principal whose acting person has no membership row in this workspace is
   * refused on EVERY tool, restricted or not: neither the API-key guard nor the OAuth token guard checks membership,
   * so this is the one place a key or grant whose owner left the workspace is stopped. Then a restricted tool runs
   * only for the roles its REST twin allows.
   */
  checkRole(principal: AgentPrincipal, toolName: string, role: UserRole | null): ToolResult | null {
    if (principal.kind === 'desk_responsibility') return null;
    if (!role) {
      this.logger.warn(`role_not_permitted: ${principal.auditId} has no membership in tenant ${principal.tenantId}`);
      return refusal({
        status: 'role_not_permitted',
        tool: toolName,
        message: 'You are not a member of this workspace, so this cannot run here. Ask a workspace admin to add you.',
      });
    }
    const roles = this.registry.roleRestrictionForTool(toolName);
    if (!roles) return null;
    if (roles.includes(role)) return null;

    this.logger.warn(
      `role_not_permitted: ${principal.auditId} (role=${role}) attempted ${toolName}; requires ${roles.join('/')}`,
    );
    return refusal({
      status: 'role_not_permitted',
      tool: toolName,
      requiredRoles: roles,
      message: `Only ${describeRoles(roles)} in this workspace can do this, the same rule as in the app. Ask one of them to make this change.`,
    });
  }

  /**
   * `@RequiresPlanFeature(key)`: the workspace's plan, judged by the same rule as the REST guard. Applies to every
   * principal kind, Desk included: the plan is the workspace's.
   */
  async checkPlan(principal: AgentPrincipal, toolName: string, role: UserRole | null): Promise<ToolResult | null> {
    const feature = this.registry.planFeatureForTool(toolName);
    if (!feature) return null;
    return this.evaluateFeature(principal, toolName, feature, role);
  }

  /**
   * The one plan rule (`TenantEntitlementsService.assertFeature`), the same one `PlanGuard` runs for every
   * `@RequireFeature` route, so the REST API and the agent surface can never disagree. `PLAN_ENFORCEMENT=log`
   * applies here through the service.
   */
  private async evaluateFeature(
    principal: AgentPrincipal,
    toolName: string,
    feature: string,
    role: UserRole | null,
  ): Promise<ToolResult | null> {
    try {
      await this.entitlements.assertFeature(principal.tenantId, feature, {
        actor: { role },
        route: `tool:${toolName}`,
      });
      return null;
    } catch (err) {
      if (!(err instanceof ForbiddenException)) throw err;
      const body = err.getResponse() as Record<string, unknown>;
      const reason = typeof body.code === 'string' ? body.code : 'FORBIDDEN';
      this.logger.warn(`not_on_plan: tenant ${principal.tenantId} lacks ${feature} for ${toolName} (${reason})`);
      return refusal({
        status: 'not_on_plan',
        reason,
        tool: toolName,
        feature,
        message: typeof body.detail === 'string' ? body.detail : 'That is not available on this workspace.',
      });
    }
  }
}

function actingUserId(p: Exclude<AgentPrincipal, { kind: 'desk_responsibility' }>): number {
  switch (p.kind) {
    case 'user':
      return p.userId;
    case 'oauth_client':
      return p.onBehalfOfUserId;
    case 'api_key':
      return p.userId;
  }
}

function refusal(payload: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

function describeRoles(roles: readonly string[]): string {
  const names = roles.map((r) => r.toLowerCase().replace(/_/g, ' '));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
  return /^[aeiou]/.test(list) ? `an ${list}` : `a ${list}`;
}
