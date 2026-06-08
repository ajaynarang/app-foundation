import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';

const BYPASS_ROLES: readonly UserRole[] = [UserRole.OWNER, UserRole.ADMIN, UserRole.SUPER_ADMIN];

type SupervisorLookup =
  | { kind: 'not-found' }
  | { kind: 'resolved'; supervisorUserId: number | null }
  | { kind: 'unknown-route' };

/**
 * Server-side enforcement of the Desk agent-edit permission matrix.
 *
 * OWNER / ADMIN / SUPER_ADMIN — always allow (still tenant-scoped).
 * MEMBER — allow only if this user is the agent's supervisor.
 * Everyone else — deny.
 *
 * The guard resolves the target agent from the URL shape:
 *   PATCH  /desk/agents/:key             → :key is agent
 *   PATCH  /desk/responsibilities/:key   → :key is responsibility → join agent
 *   POST   /desk/responsibilities/:key/run
 *   PATCH  /desk/memories/:id            → join agent via DeskMemory.agentId
 *   DELETE /desk/memories/:id            → same
 *
 * Supervisor-reassignment (`body.supervisorUserId` on PATCH /desk/agents/:key)
 * is further narrowed to OWNER/ADMIN/SUPER_ADMIN inside the controller — we
 * don't double-check it here to keep the guard URL-shape-agnostic.
 */
@Injectable()
export class DeskAgentEditGuard implements CanActivate {
  private readonly logger = new Logger(DeskAgentEditGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as { dbId: number; role: UserRole; tenantId?: string } | undefined;
    if (!user) return false;

    if (BYPASS_ROLES.includes(user.role)) return true;
    if (user.role !== UserRole.MEMBER) return false;
    if (!user.tenantId) return false;

    // Resolve the user's tenant once — all guard lookups must be scoped to it
    // so a matching agent-key in another tenant can't leak a decision here.
    const tenant = await this.prisma.tenant.findUnique({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    if (!tenant) return false;

    const lookup = await this.resolveAgentSupervisor(req, tenant.id);
    if (lookup.kind === 'not-found') {
      // Target entity unresolvable — let the service throw the clean
      // NotFoundException instead of masking it with a 403.
      return true;
    }
    if (lookup.kind === 'unknown-route') return false;

    const allow = lookup.supervisorUserId === user.dbId;
    if (!allow) {
      this.logger.warn(
        `desk-agent-edit: denied user=${user.dbId} role=${user.role} route=${req.method} ${req.route?.path ?? req.url}`,
      );
    }
    return allow;
  }

  private async resolveAgentSupervisor(
    req: {
      method: string;
      baseUrl?: string;
      url: string;
      route?: { path?: string };
      params?: Record<string, string>;
    },
    tenantId: number,
  ): Promise<SupervisorLookup> {
    const path = req.route?.path ?? req.url ?? '';
    const params = req.params ?? {};

    if (path.includes('/desk/agents/')) {
      return this.supervisorForAgentKey(params.key, tenantId);
    }
    if (path.includes('/desk/responsibilities/')) {
      return this.supervisorForResponsibilityKey(params.key, tenantId);
    }
    if (path.includes('/desk/memories/')) {
      return this.supervisorForMemoryId(params.id ?? params.memoryId, tenantId);
    }
    return { kind: 'unknown-route' };
  }

  private async supervisorForAgentKey(key: string | undefined, tenantId: number): Promise<SupervisorLookup> {
    if (!key) return { kind: 'not-found' };
    const agent = await this.prisma.deskAgent.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { supervisorUserId: true },
    });
    if (!agent) return { kind: 'not-found' };
    return { kind: 'resolved', supervisorUserId: agent.supervisorUserId };
  }

  private async supervisorForResponsibilityKey(key: string | undefined, tenantId: number): Promise<SupervisorLookup> {
    if (!key) return { kind: 'not-found' };
    const resp = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key } },
      select: { agent: { select: { supervisorUserId: true } } },
    });
    if (!resp) return { kind: 'not-found' };
    return { kind: 'resolved', supervisorUserId: resp.agent.supervisorUserId };
  }

  private async supervisorForMemoryId(id: string | undefined, tenantId: number): Promise<SupervisorLookup> {
    if (!id) return { kind: 'not-found' };
    // DeskMemory.id is a UUID so globally unique, but we still constrain the
    // lookup to the caller's tenant — so the guard's decision can never be
    // based on another tenant's supervisor row.
    const memory = await this.prisma.deskMemory.findFirst({
      where: { id, agent: { tenantId } },
      select: { agent: { select: { supervisorUserId: true } } },
    });
    if (!memory) return { kind: 'not-found' };
    return { kind: 'resolved', supervisorUserId: memory.agent.supervisorUserId };
  }
}
