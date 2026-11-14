import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtTokenService, type AuthMethod } from '../../auth/jwt.service';
import { UserRole } from '@appshore/db';

export interface WorkspaceSummary {
  tenantId: string;
  name: string;
  subdomain: string | null;
  role: UserRole;
  isDefault: boolean;
}

/** The most workspaces the switcher lists for one user: the default first, then by name. */
export const MAX_WORKSPACES_LISTED = 200;

/**
 * Workspace-based tenancy: a user can belong to many workspaces (tenants),
 * with a distinct role in each. `WorkspaceMember` is the source of truth;
 * the JWT carries the ACTIVE workspace (minted here on switch, or from the
 * user's default membership at login). `User.tenantId`/`User.role` cache the
 * login default and are kept in sync here.
 */
@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  async listForUser(userDbId: number): Promise<WorkspaceSummary[]> {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: userDbId, tenant: { isActive: true } },
      include: { tenant: true },
      orderBy: [{ isDefault: 'desc' }, { tenant: { companyName: 'asc' } }],
      take: MAX_WORKSPACES_LISTED,
    });
    return memberships.map((m) => ({
      tenantId: m.tenant.tenantId,
      name: m.tenant.companyName,
      subdomain: m.tenant.subdomain,
      role: m.role,
      isDefault: m.isDefault,
    }));
  }

  /**
   * Switch the session to another workspace the user belongs to. Issues a
   * token pair whose claims carry the target workspace + membership role, and
   * records the target as the login default (which no other session reads:
   * each refreshes into the workspace stored on its own refresh-token row).
   *
   * `session.familyId` is the access token's `sid`. The new refresh token is a
   * successor in that family, replacing its newest live token: the refresh
   * cookie is not sent to this route, so the newest row stands for what the
   * client holds. Its predecessor is retired when the new token is first
   * presented, as on any refresh. With no live token in the family (a token
   * from before rotation), the switch starts a new session.
   */
  async switch(
    userDbId: number,
    targetTenantId: string,
    session: { familyId?: string | null; authMethod?: AuthMethod },
  ) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: userDbId, tenant: { tenantId: targetTenantId } },
      include: { tenant: true, user: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (!membership.tenant.isActive || membership.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Workspace is not active');
    }

    await this.prisma.$transaction(async (tx) => {
      // login-default cache on the user row
      await tx.user.update({
        where: { id: userDbId },
        data: { tenantId: membership.tenantId, role: membership.role },
      });
      await tx.workspaceMember.updateMany({
        where: { userId: userDbId },
        data: { isDefault: false },
      });
      await tx.workspaceMember.update({
        where: { id: membership.id },
        data: { isDefault: true },
      });
    });

    const sessionUser = {
      id: membership.user.id,
      userId: membership.user.userId,
      email: membership.user.email,
      role: membership.role,
      tenantId: membership.tenant.tenantId,
      tenantDbId: membership.tenantId,
    };
    // Same family, new workspace. The predecessor is the family's newest live row (the switch request carries no
    // refresh cookie); the token the client actually held is retired when this successor is first presented.
    const tokens = await this.jwtTokenService.issueSwitchSuccessor(sessionUser, session.familyId, session.authMethod);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      workspace: {
        tenantId: membership.tenant.tenantId,
        name: membership.tenant.companyName,
        subdomain: membership.tenant.subdomain,
        role: membership.role,
      },
    };
  }

  /** Add (or restore) a user's membership in a workspace. Used by invitations + registration. */
  async addMember(
    tx: Pick<PrismaService, 'workspaceMember'>,
    userDbId: number,
    tenantDbId: number,
    role: UserRole,
    isDefault = false,
  ) {
    return tx.workspaceMember.upsert({
      where: { userId_tenantId: { userId: userDbId, tenantId: tenantDbId } },
      update: { role },
      create: { userId: userDbId, tenantId: tenantDbId, role, isDefault },
    });
  }
}
