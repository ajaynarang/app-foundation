import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, Tenant, UserRole } from '@appshore/db';
import { PrismaService } from '../infrastructure/database/prisma.service';

export type AccountUser = Prisma.UserGetPayload<{ include: { tenant: true } }>;

/**
 * One account a sign-in can land on, with the workspace the new session would run in: the hinted tenant when the
 * caller sent one, else the account's login default (`User.tenantId` and `User.role`, as every login did before).
 * `tenant` is null for a super-admin and for a tenant-less user in single-tenant mode.
 */
export interface LoginAccount {
  user: AccountUser;
  tenant: Tenant | null;
  role: UserRole;
}

/**
 * Finds the accounts behind an email or a phone number before sign-in.
 *
 * `User` is unique on `(tenantId, email)`, so one email can have several live rows: a product scaffolded before
 * one-account-per-email may still hold duplicates. Every email flow therefore looks at all of them, never at the
 * oldest only. A phone number is unique platform-wide, so the phone flows find at most one.
 *
 * The hint is the tenant's public id (`Tenant.tenantId`), which the web login form sends from a tenant subdomain.
 * With a hint, only accounts that belong to that tenant remain: their own tenant, or a `WorkspaceMember` row there.
 * An unknown hint leaves none, so it answers exactly like a wrong password. Single-tenant mode ignores the hint:
 * every account already lives in the implicit tenant.
 */
@Injectable()
export class IdentityResolverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /** Every live account on this email (oldest first), narrowed by the hint. `activeOnly` also drops disabled ones. */
  async findEmailAccounts(
    email: string,
    hintTenantId?: string | null,
    options: { activeOnly?: boolean } = {},
  ): Promise<LoginAccount[]> {
    const users = await this.prisma.user.findMany({
      where: { email, deletedAt: null, ...(options.activeOnly ? { isActive: true } : {}) },
      include: { tenant: true },
      orderBy: { id: 'asc' },
    });
    return this.applyHint(users, hintTenantId);
  }

  /** The active account on this phone number, if it passes the hint. */
  async findPhoneAccount(phone: string, hintTenantId?: string | null): Promise<LoginAccount | null> {
    const user = await this.prisma.user.findFirst({
      where: { phone, isActive: true },
      include: { tenant: true },
    });
    if (!user) return null;
    const [account] = await this.applyHint([user], hintTenantId);
    return account ?? null;
  }

  private async applyHint(users: AccountUser[], hintTenantId?: string | null): Promise<LoginAccount[]> {
    if (users.length === 0) return [];
    if (!hintTenantId || this.isSingleTenant()) {
      return users.map((user) => ({ user, tenant: user.tenant, role: user.role }));
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { tenantId: hintTenantId } });
    if (!tenant) return [];

    const others = users.filter((user) => user.tenantId !== tenant.id).map((user) => user.id);
    const memberships =
      others.length > 0
        ? await this.prisma.workspaceMember.findMany({
            where: { tenantId: tenant.id, userId: { in: others } },
            select: { userId: true, role: true },
          })
        : [];
    const memberRole = new Map(memberships.map((membership) => [membership.userId, membership.role]));

    const accounts: LoginAccount[] = [];
    for (const user of users) {
      if (user.tenantId === tenant.id) accounts.push({ user, tenant, role: user.role });
      else if (memberRole.has(user.id)) accounts.push({ user, tenant, role: memberRole.get(user.id)! });
    }
    return accounts;
  }

  private isSingleTenant(): boolean {
    return this.configService.get<{ enabled: boolean }>('multiTenancy')?.enabled === false;
  }
}
