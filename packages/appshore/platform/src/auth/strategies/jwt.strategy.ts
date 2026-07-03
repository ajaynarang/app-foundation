import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface JwtPayload {
  sub: string; // userId
  email?: string; // Optional — phone-only users may not have one
  role: string;
  tenantId?: string; // Optional - SUPER_ADMIN has no tenant
  sid?: string; // Session id — the refresh-token row this session is tied to
  authMethod?: 'email_password' | 'phone_pin' | 'phone_otp';
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primary: Authorization header (Bearer token)
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Fallback: query param ?token= (for SSE/EventSource which can't send headers)
        (request: Request) => {
          return request?.query?.token as string | null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    // Validate that user still exists and is active
    const user = await this.prisma.user.findUnique({
      where: { userId: payload.sub },
      include: {
        tenant: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Check tenant is active (skip for SUPER_ADMIN who has no tenant)
    if (user.tenant && !user.tenant.isActive) {
      throw new UnauthorizedException('Tenant is inactive');
    }

    // Single-tenant mode: stamp the implicit tenant onto every non-SUPER_ADMIN
    // user so downstream `where: { tenantId }` scoping resolves to the one
    // seeded tenant — even for users created without a tenant relation.
    const multiTenancy = this.configService.get<{ enabled: boolean; implicitTenantId: number }>('multiTenancy');
    if (multiTenancy?.enabled === false && user.role !== 'SUPER_ADMIN' && !user.tenant) {
      const implicitTenant = await this.getImplicitTenant(multiTenancy.implicitTenantId);
      return {
        dbId: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
        // Use the seeded tenant's REAL public string id so string-keyed
        // lookups (tenant.findUnique({ where: { tenantId } })) resolve.
        tenantId: implicitTenant?.tenantId ?? String(multiTenancy.implicitTenantId),
        tenantDbId: multiTenancy.implicitTenantId,
        tenantName: implicitTenant?.companyName ?? 'Default Workspace',
        isActive: user.isActive,
        authMethod: payload.authMethod,
        tokenId: payload.sid, // Session id — lets logout revoke this session's refresh token
      };
    }

    // Workspace-based tenancy: the token names the session's ACTIVE workspace.
    // Resolve the membership so each session carries its own workspace + role
    // (two tabs can live in two different workspaces). Falls back to the
    // user's default tenant only for tokens that predate the workspace model.
    if (payload.tenantId && user.role !== 'SUPER_ADMIN' && payload.tenantId !== user.tenant?.tenantId) {
      const membership = await this.prisma.workspaceMember.findFirst({
        where: { userId: user.id, tenant: { tenantId: payload.tenantId } },
        include: { tenant: true },
      });
      if (!membership) {
        // Membership revoked mid-session — kill the session rather than
        // silently dropping the user into a different workspace.
        throw new UnauthorizedException('Workspace access revoked');
      }
      if (!membership.tenant.isActive) {
        throw new UnauthorizedException('Tenant is inactive');
      }
      return {
        dbId: user.id,
        userId: user.userId,
        email: user.email,
        role: membership.role,
        tenantId: membership.tenant.tenantId,
        tenantDbId: membership.tenant.id,
        tenantName: membership.tenant.companyName,
        isActive: user.isActive,
        authMethod: payload.authMethod,
        tokenId: payload.sid,
      };
    }

    // Return user object that will be attached to request
    return {
      dbId: user.id, // Numeric DB id (for login event recording)
      userId: user.userId,
      email: user.email, // May be null for phone-only users
      role: user.role,
      tenantId: user.tenant?.tenantId, // String tenant ID (for display)
      tenantDbId: user.tenant?.id, // Numeric database ID (for queries)
      tenantName: user.tenant?.companyName,
      isActive: user.isActive,
      authMethod: payload.authMethod, // How this session was established
      tokenId: payload.sid, // Session id — lets logout revoke this session's refresh token
    };
  }

  /**
   * Resolve (and memoize) the seeded implicit tenant for single-tenant mode.
   * Cached for the process lifetime — the implicit tenant is seeded once and
   * never changes identity.
   */
  private implicitTenant: { tenantId: string; companyName: string } | null | undefined;

  private async getImplicitTenant(implicitTenantId: number) {
    if (this.implicitTenant != null) return this.implicitTenant;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: implicitTenantId },
      select: { tenantId: true, companyName: true },
    });
    // Only memoize a HIT. Booting before the seed ran must not poison the
    // cache for the process lifetime — retry on the next request.
    if (tenant) this.implicitTenant = tenant;
    return tenant ?? null;
  }
}
