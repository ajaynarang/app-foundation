import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@appshore/db';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { JwtTokenService, type AuthMethod } from './jwt.service';
import { LoginEventService } from './login-event.service';
import type { UserProfileDto } from './dto/login.dto';
import { toUserProfile } from './user-profile';
import { ERROR_SOURCE, reportError } from '@appshore/kernel/infrastructure/error-tracking/sentry';

/** The error-tracker issue for a reused refresh token. It names no token, user or address: ids ride as tags. */
class RefreshTokenReuseError extends Error {
  override readonly name = 'RefreshTokenReuseError';
  constructor() {
    super('A retired refresh token was presented again; the session was revoked');
  }
}

/** What the refresh guard puts on the request: the presented token's session. */
export interface RefreshSession {
  dbId: number;
  userId: string;
  email: string | null;
  /** The user's login-default role; the session's own role is resolved on refresh. */
  role: UserRole;
  tokenId: string;
  familyId: string;
  familyStartedAt: Date;
  /** The token the presented one replaced; null for the first token of a family. */
  previousTokenId: string | null;
  /** The session's workspace as stored on the row; null for a super-admin or a row written before rotation. */
  sessionTenantDbId: number | null;
  /** The session's workspace (falling back to the user's default for a row with none). */
  tenantId?: string;
  tenantDbId?: number;
  tenantName?: string;
  authMethod?: AuthMethod;
  isActive: boolean;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: UserProfileDto;
}

/**
 * The refresh path: checks a presented refresh token against its row, and turns a valid one into a successor.
 *
 * Rules (the template's own on top of the rotation it shares with its sibling products):
 * - The presented token must match the stored hash, not just name a row.
 * - A token retired by rotation and presented again is reuse: the whole family is revoked, a `REFRESH_REUSE` login
 *   failure is written, and one warning is logged. Within `jwt.refreshReuseGraceSeconds` of its retirement it is a
 *   request that was already in flight, and gets a plain 401.
 * - A row revoked without rotation (logout, password reset, an admin) gets a plain 401.
 * - A session never outlives `jwt.sessionMaxAge` from its family's start.
 * - The new access token names the session's own workspace and that membership's role, never the user's current
 *   login default, so a workspace switch in one session does not move another.
 */
@Injectable()
export class RefreshSessionService {
  private readonly logger = new Logger(RefreshSessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly loginEventService: LoginEventService,
    private readonly configService: ConfigService,
  ) {}

  /** Called by the refresh strategy once the JWT signature and `exp` are verified. */
  async validatePresentedToken(
    tokenId: string,
    presentedToken: string,
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<RefreshSession> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenId },
      include: { user: { include: { tenant: true } }, tenant: true },
    });
    if (!row || !this.jwtTokenService.matchesStoredHash(presentedToken, row.token)) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    if (row.isRevoked) {
      if (row.rotatedAt) await this.onRetiredTokenPresented(row, meta);
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    const now = Date.now();
    if (now > row.expiresAt.getTime()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (now > row.familyStartedAt.getTime() + this.jwtTokenService.sessionMaxAgeMs()) {
      throw new UnauthorizedException('Session expired');
    }

    const { user } = row;
    // Null-safe: SUPER_ADMIN and tenant-less single-tenant-mode users have user.tenant = null (as jwt.strategy.ts).
    if (!user.isActive || (user.tenant && !user.tenant.isActive)) {
      throw new UnauthorizedException('User or tenant is inactive');
    }

    const sessionTenant = row.tenant ?? user.tenant;
    return {
      dbId: user.id,
      userId: user.userId,
      email: user.email,
      role: user.role,
      tokenId: row.tokenId,
      familyId: row.familyId,
      familyStartedAt: row.familyStartedAt,
      previousTokenId: row.previousTokenId,
      sessionTenantDbId: row.tenantId,
      tenantId: sessionTenant?.tenantId,
      tenantDbId: sessionTenant?.id,
      tenantName: sessionTenant?.companyName,
      authMethod: this.authMethodOf(presentedToken),
      isActive: user.isActive,
    };
  }

  /**
   * Turn a validated session into a successor token pair. Retires the predecessor first (this token being presented
   * proves the client received it), then issues the successor in the same family.
   */
  async refresh(session: RefreshSession): Promise<RefreshResult> {
    const user = await this.prisma.user.findUnique({ where: { id: session.dbId }, include: { tenant: true } });
    if (!user || !user.isActive) throw new UnauthorizedException('User not found or inactive');

    const workspace = await this.resolveSessionWorkspace(user, session.sessionTenantDbId);

    if (session.previousTokenId) {
      await this.jwtTokenService.retirePredecessor({
        tokenId: session.tokenId,
        familyId: session.familyId,
        previousTokenId: session.previousTokenId,
      });
    }
    await this.prisma.refreshToken.update({ where: { tokenId: session.tokenId }, data: { lastUsedAt: new Date() } });

    const pair = await this.jwtTokenService.rotateRefreshToken(
      {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: workspace.role,
        tenantId: workspace.tenant?.tenantId,
        tenantDbId: workspace.tenant?.id ?? null,
      },
      { tokenId: session.tokenId, familyId: session.familyId, familyStartedAt: session.familyStartedAt },
      session.authMethod,
    );

    return {
      accessToken: pair.accessToken,
      refreshToken: pair.refreshToken,
      user: toUserProfile({ ...user, role: workspace.role, tenant: workspace.tenant }),
    };
  }

  /**
   * The session's workspace and role, by the rules jwt.strategy.ts applies to access tokens: the user's own tenant
   * and role when the session is in the login-default workspace, the membership otherwise. A super-admin and
   * single-tenant mode need no membership. A row with no workspace falls back to the user's tenant, and the
   * successor stores it.
   */
  private async resolveSessionWorkspace(
    user: { id: number; role: UserRole; tenantId: number | null; tenant: { id: number; isActive: boolean } | null },
    sessionTenantDbId: number | null,
  ): Promise<{ tenant: any; role: UserRole }> {
    const singleTenant = this.configService.get<{ enabled: boolean }>('multiTenancy')?.enabled === false;
    if (
      user.role === UserRole.SUPER_ADMIN ||
      singleTenant ||
      sessionTenantDbId === null ||
      sessionTenantDbId === user.tenantId
    ) {
      return { tenant: user.tenant, role: user.role };
    }

    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId: user.id, tenantId: sessionTenantDbId },
      include: { tenant: true },
    });
    // Membership removed mid-session: end the session rather than drop it into another workspace.
    if (!membership) throw new UnauthorizedException('Workspace access revoked');
    if (!membership.tenant.isActive) throw new UnauthorizedException('Tenant is inactive');
    return { tenant: membership.tenant, role: membership.role };
  }

  private async onRetiredTokenPresented(
    row: { tokenId: string; familyId: string; userId: number; tenantId: number | null; revokedAt: Date | null },
    meta: { ip: string | null; userAgent: string | null },
  ): Promise<void> {
    const retiredAt = row.revokedAt?.getTime() ?? 0;
    if (Date.now() - retiredAt <= this.jwtTokenService.reuseGraceMs()) return;

    await this.jwtTokenService.revokeFamily(row.familyId);
    await this.loginEventService.recordFailure({
      userId: row.userId,
      tenantId: row.tenantId,
      ip: meta.ip,
      userAgent: meta.userAgent,
      failReason: 'refresh_reuse',
    });
    // Ids only: no token, no address.
    this.logger.warn({
      msg: 'Refresh token reuse: the session was revoked',
      event: 'auth.refresh_reuse',
      familyId: row.familyId,
      tokenId: row.tokenId,
      userDbId: row.userId,
    });
    // A possible stolen token: one warning-level issue in the tracker (the log line alone reaches no one).
    reportError(
      new RefreshTokenReuseError(),
      { tenantDbId: row.tenantId ?? undefined, source: ERROR_SOURCE.HTTP },
      { level: 'warning' },
    );
  }

  /** The `authMethod` claim of an already-verified refresh token, carried onto its successor. */
  private authMethodOf(presentedToken: string): AuthMethod | undefined {
    try {
      const payload = JSON.parse(Buffer.from(presentedToken.split('.')[1], 'base64url').toString('utf8'));
      return typeof payload.authMethod === 'string' ? (payload.authMethod as AuthMethod) : undefined;
    } catch {
      return undefined;
    }
  }
}
