import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { JwtTokenService } from '../../auth/jwt.service';
import { UserRole } from '@appshore/db';

export interface WorkspaceSummary {
  tenantId: string;
  name: string;
  subdomain: string | null;
  role: UserRole;
  isDefault: boolean;
}

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
   * fresh token pair whose claims carry the target workspace + membership
   * role, and records the target as the login default.
   */
  async switch(userDbId: number, targetTenantId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: userDbId, tenant: { tenantId: targetTenantId } },
      include: { tenant: true, user: true },
    });
    if (!membership) throw new NotFoundException('Workspace not found');
    if (!membership.tenant.isActive || membership.tenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('Workspace is not active');
    }

    await this.prisma.$transaction([
      // login-default cache on the user row
      this.prisma.user.update({
        where: { id: userDbId },
        data: { tenantId: membership.tenantId, role: membership.role },
      }),
      this.prisma.workspaceMember.updateMany({
        where: { userId: userDbId },
        data: { isDefault: false },
      }),
      this.prisma.workspaceMember.update({
        where: { id: membership.id },
        data: { isDefault: true },
      }),
    ]);

    const tokens = await this.jwtTokenService.generateTokenPair({
      id: membership.user.id,
      userId: membership.user.userId,
      email: membership.user.email,
      role: membership.role,
      tenantId: membership.tenant.tenantId,
    });

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
