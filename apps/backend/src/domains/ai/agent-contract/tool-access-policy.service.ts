import 'reflect-metadata';
import { ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import type { UserRole } from '@appshore/db';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { PlanGuard } from '@appshore/platform/auth/guards/plan.guard';
import { FEATURE_KEY } from '@appshore/platform/auth/decorators/require-feature.decorator';
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
  /** Tenant DB id to its wire-format id (immutable; `PlanGuard` looks plans up by it). */
  private readonly tenantKeys = new Map<number, string>();

  constructor(
    private readonly registry: ScopeRegistryService,
    private readonly prisma: PrismaService,
    private readonly planGuard: PlanGuard,
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
   * `@RestrictToRoles`: the tool runs only for the roles its REST twin allows. A Desk duty is exempt (its own scope
   * grant governs it). A person with no membership in this workspace is refused.
   */
  checkRole(principal: AgentPrincipal, toolName: string, role: UserRole | null): ToolResult | null {
    const roles = this.registry.roleRestrictionForTool(toolName);
    if (!roles) return null;
    if (principal.kind === 'desk_responsibility') return null;
    if (role && roles.includes(role)) return null;

    this.logger.warn(
      `role_not_permitted: ${principal.auditId} (role=${role ?? 'none'}) attempted ${toolName}; requires ${roles.join('/')}`,
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
   * Runs `PlanGuard` itself, not a copy of its rules, against a synthetic request for this workspace, so the REST API
   * and the agent surface can never disagree. `PlanGuard` reads only `{ tenantId, tenantDbId, role }` from the
   * request user. Tenant-entitlement plumbing outside HTTP replaces this body later; callers do not change.
   */
  private async evaluateFeature(
    principal: AgentPrincipal,
    toolName: string,
    feature: string,
    role: UserRole | null,
  ): Promise<ToolResult | null> {
    const tenantKey = await this.tenantKey(principal.tenantId);
    if (!tenantKey) {
      return refusal({ status: 'not_on_plan', tool: toolName, feature, message: 'This workspace could not be found.' });
    }

    try {
      await this.planGuard.canActivate(
        featureGateContext(feature, { tenantId: tenantKey, tenantDbId: principal.tenantId, role: role ?? undefined }),
      );
      return null;
    } catch (err) {
      if (!(err instanceof ForbiddenException)) throw err;
      const body = err.getResponse() as Record<string, unknown>;
      const reason = [body.code, body.error].find((v): v is string => typeof v === 'string') ?? 'FORBIDDEN';
      this.logger.warn(`not_on_plan: tenant ${principal.tenantId} lacks ${feature} for ${toolName} (${reason})`);
      return refusal({
        status: 'not_on_plan',
        reason,
        tool: toolName,
        feature,
        message: planMessage(reason, body),
      });
    }
  }

  private async tenantKey(tenantDbId: number): Promise<string | null> {
    const cached = this.tenantKeys.get(tenantDbId);
    if (cached) return cached;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantDbId }, select: { tenantId: true } });
    if (!tenant) return null;
    this.tenantKeys.set(tenantDbId, tenant.tenantId);
    return tenant.tenantId;
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

function planMessage(reason: string, body: Record<string, unknown>): string {
  if (reason === 'PLAN_UPGRADE_REQUIRED') {
    const plan = typeof body.requiredPlan === 'string' ? body.requiredPlan : 'a higher';
    return `That needs the ${plan} plan or higher. A workspace admin can upgrade from Plan & Billing in the app.`;
  }
  return typeof body.message === 'string' ? body.message : 'That is not available on this workspace.';
}

function describeRoles(roles: readonly string[]): string {
  const names = roles.map((r) => r.toLowerCase().replace(/_/g, ' '));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
  return /^[aeiou]/.test(list) ? `an ${list}` : `a ${list}`;
}

/** Per-feature handler carrying `@RequireFeature(feature)` metadata, built once. */
const featureHandlers = new Map<string, () => void>();
class ToolFeatureGate {}

function featureGateContext(
  feature: string,
  user: { tenantId: string; tenantDbId: number; role?: string },
): ExecutionContext {
  let handler = featureHandlers.get(feature);
  if (!handler) {
    handler = () => undefined;
    Reflect.defineMetadata(FEATURE_KEY, feature, handler);
    featureHandlers.set(feature, handler);
  }
  const request = { user };
  const gateHandler = handler;
  return {
    getHandler: () => gateHandler,
    getClass: () => ToolFeatureGate,
    getType: () => 'http',
    getArgs: () => [request],
    getArgByIndex: (i: number) => (i === 0 ? request : undefined),
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => undefined, getNext: () => undefined }),
    switchToRpc: () => {
      throw new Error('not an RPC context');
    },
    switchToWs: () => {
      throw new Error('not a WS context');
    },
  } as unknown as ExecutionContext;
}
