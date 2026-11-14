import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@appshore/db';
import { PrismaService } from '../infrastructure/database/prisma.service';
import * as crypto from 'crypto';

export type AuthMethod = 'email_password' | 'phone_pin' | 'phone_otp';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First key of the transaction-scoped advisory lock that serialises every change to one user's refresh-token rows
 * (`pg_advisory_xact_lock(SESSION_LOCK_NAMESPACE, userId)`). Any fixed int4 works; this one spells "RFSH".
 */
export const SESSION_LOCK_NAMESPACE = 0x52465348;

/** Used when the configured value is missing or unparseable. */
const DEFAULT_REFRESH_TTL_MS = 7 * DAY_MS;
const DEFAULT_SESSION_MAX_AGE_MS = 30 * DAY_MS;
const DEFAULT_REUSE_GRACE_SECONDS = 10;

const DURATION_UNITS_MS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: DAY_MS };

/** Parse the `15m` / `7d` / `30d` strings the JWT config uses. Null if unparseable. */
export function parseDurationMs(value: string | undefined | null): number | null {
  const match = /^(\d+)\s*([smhd])$/.exec((value ?? '').trim());
  if (!match) return null;
  return Number(match[1]) * DURATION_UNITS_MS[match[2]];
}

/** Who a token pair is for, and the session's workspace. */
export interface SessionUser {
  /** Numeric user id (the row the refresh token belongs to). */
  id: number;
  userId: string;
  email?: string | null;
  /** The role in the session's workspace. */
  role: string;
  /** The session workspace's public id. Absent for a super-admin or a user with no tenant. */
  tenantId?: string;
  /** The session workspace's numeric id, stored on the refresh-token row. */
  tenantDbId?: number | null;
}

/** The token a successor replaces, and the family (session) both belong to. */
export interface SessionLineage {
  tokenId: string;
  familyId: string;
  familyStartedAt: Date;
}

/** The token being presented to refresh: its lineage, and the token it replaced (null for a family's first). */
export interface PresentedToken extends SessionLineage {
  previousTokenId: string | null;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
  /** The session id: the access token's `sid`, constant across rotations. */
  familyId: string;
}

/**
 * Access and refresh tokens, and the refresh-token families behind sessions.
 *
 * A family is one session. Its first token's id is the family id, which the access token carries as `sid`. Every
 * refresh issues a successor in the same family ([rotateRefreshToken]). The presented token is NOT cut short then:
 * the response carrying the successor can be lost, and the client must still be able to refresh with what it holds.
 * It is retired the first time its successor is presented ([retireStaleRows]), which proves the client got it.
 * Every write to a user's rows that can race a refresh (rotate, switch, revoke a family) takes the user's session
 * lock, so a refresh validated a moment ago cannot add a live token to a family that was revoked meanwhile.
 * Presenting a retired token again is reuse, and revokes the family (RefreshSessionService).
 */
@Injectable()
export class JwtTokenService {
  constructor(
    private jwtService: NestJwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  /** How long one refresh token lives (`jwt.refreshExpiry`). Feeds the JWT `exp` and the row's `expiresAt`. */
  refreshTtlMs(): number {
    return parseDurationMs(this.configService.get<string>('jwt.refreshExpiry')) ?? DEFAULT_REFRESH_TTL_MS;
  }

  /** The absolute lifetime of a session (`jwt.sessionMaxAge`), from its family's start, whatever the rotations. */
  sessionMaxAgeMs(): number {
    return parseDurationMs(this.configService.get<string>('jwt.sessionMaxAge')) ?? DEFAULT_SESSION_MAX_AGE_MS;
  }

  /**
   * How long after its retirement a token may still arrive without counting as reuse
   * (`jwt.refreshReuseGraceSeconds`): a request already in flight when another tab finished its refresh.
   */
  reuseGraceMs(): number {
    const seconds = this.configService.get<number>('jwt.refreshReuseGraceSeconds');
    return (typeof seconds === 'number' && seconds >= 0 ? seconds : DEFAULT_REUSE_GRACE_SECONDS) * 1000;
  }

  /** Start a new session: a token pair whose refresh token is the first of a new family. */
  async generateTokenPair(user: SessionUser, authMethod?: AuthMethod): Promise<TokenPair> {
    return this.issue(this.prisma, user, authMethod, null);
  }

  /**
   * The refresh step, atomic with the row's state. Under the user's session lock, in one transaction:
   * - the presented token must still be live (it passed validation, but a reuse, a logout or a sibling's
   *   presentation may have revoked it since); when it is not, nothing is written and the result is `null`;
   * - the rows it makes stale are retired ([retireStaleRows]);
   * - it is stamped used, and its successor is issued in the same family.
   * The presented token itself stays valid until the successor is first presented (see the class comment).
   */
  async rotateRefreshToken(
    user: SessionUser,
    presented: PresentedToken,
    authMethod?: AuthMethod,
  ): Promise<TokenPair | null> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessions(tx, user.id);
      const now = new Date();
      const { count } = await tx.refreshToken.updateMany({
        where: { tokenId: presented.tokenId, familyId: presented.familyId, userId: user.id, isRevoked: false },
        data: { lastUsedAt: now },
      });
      if (count !== 1) return null;
      await this.retireStaleRows(tx, presented, now);
      return this.issue(tx, user, authMethod, presented);
    });
  }

  /**
   * A workspace switch: a successor in the session's family with the new workspace, issued under the session lock.
   * The switch request carries no refresh cookie, so the predecessor is the family's newest live row, which is not
   * necessarily the token the client holds. Nothing is retired here (the response can be lost); when the switch's
   * successor is first presented, [retireStaleRows] retires every older live row of the family, so the token the
   * client held stays valid in the old workspace no longer than that. A family with no live row (or none named)
   * starts a new session.
   */
  async issueSwitchSuccessor(
    user: SessionUser,
    familyId: string | null | undefined,
    authMethod?: AuthMethod,
  ): Promise<TokenPair> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessions(tx, user.id);
      const newest = familyId
        ? await tx.refreshToken.findFirst({
            where: { familyId, userId: user.id, isRevoked: false },
            orderBy: [{ id: 'desc' }],
          })
        : null;
      return this.issue(
        tx,
        user,
        authMethod,
        newest ? { tokenId: newest.tokenId, familyId: newest.familyId, familyStartedAt: newest.familyStartedAt } : null,
      );
    });
  }

  /**
   * Presenting a token proves the client holds it, so every other live row of its family that is older than it is
   * stale: its predecessor, a token a workspace switch skipped over, a sibling issued before it. A sibling issued
   * after it (another unretired token that replaced the same one: two tabs that refreshed together) is stale too.
   * Its own successors are not: a lost response must not log the client out. `rotatedAt` marks the rows as retired
   * by rotation, which is what makes presenting one again detectable as reuse. Runs under the session lock.
   */
  private async retireStaleRows(tx: Prisma.TransactionClient, presented: PresentedToken, now: Date): Promise<void> {
    const self = await tx.refreshToken.findUniqueOrThrow({
      where: { tokenId: presented.tokenId },
      select: { id: true },
    });
    await tx.refreshToken.updateMany({
      where: {
        familyId: presented.familyId,
        isRevoked: false,
        tokenId: { not: presented.tokenId },
        OR: [
          { id: { lt: self.id } },
          ...(presented.previousTokenId ? [{ previousTokenId: presented.previousTokenId }] : []),
        ],
      },
      data: { isRevoked: true, revokedAt: now, rotatedAt: now },
    });
  }

  /**
   * End a session: revoke every live token of the family, under the session lock, so a refresh in flight cannot add
   * a live successor after it. A revoked (not rotated) token gets a plain 401. Returns how many rows it revoked.
   */
  async revokeFamily(familyId: string, userId: number): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await this.lockSessions(tx, userId);
      const { count } = await tx.refreshToken.updateMany({
        where: { familyId, userId, isRevoked: false },
        data: { isRevoked: true, revokedAt: new Date() },
      });
      return count;
    });
  }

  async revokeAllUserTokens(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        isRevoked: false,
      },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });
  }

  /** True when a presented refresh token is the one whose hash the row stores. Constant-time. */
  matchesStoredHash(presentedToken: string, storedHash: string): boolean {
    const presented = Buffer.from(this.hashToken(presentedToken), 'utf8');
    const stored = Buffer.from(storedHash, 'utf8');
    return presented.length === stored.length && crypto.timingSafeEqual(presented, stored);
  }

  /**
   * Delete refresh-token rows no session can use: expired ones, and ones revoked more than 30 days ago (past the
   * session's absolute lifetime, so reuse detection no longer needs them). Run daily by the `tokens-cleanup` cron.
   * Returns how many rows went.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            isRevoked: true,
            revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // 30 days old
          },
        ],
      },
    });
    return result.count;
  }

  /** Serialise every change to this user's refresh-token rows until the transaction ends. */
  private async lockSessions(tx: Prisma.TransactionClient, userId: number): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SESSION_LOCK_NAMESPACE}::int, ${userId}::int)`;
  }

  private async issue(
    db: Prisma.TransactionClient | PrismaService,
    user: SessionUser,
    authMethod: AuthMethod | undefined,
    predecessor: SessionLineage | null,
  ): Promise<TokenPair> {
    const tokenId = `rt_${crypto.randomBytes(16).toString('hex')}`;
    const familyId = predecessor?.familyId ?? tokenId;
    const now = Date.now();
    const familyStartedAt = predecessor?.familyStartedAt ?? new Date(now);
    // A token never outlives its session's absolute lifetime.
    const expiresAt = new Date(Math.min(now + this.refreshTtlMs(), familyStartedAt.getTime() + this.sessionMaxAgeMs()));

    const accessToken = this.jwtService.sign(
      {
        sub: user.userId,
        // email is optional — phone-only users may not have one
        ...(user.email ? { email: user.email } : {}),
        role: user.role,
        tenantId: user.tenantId,
        // Session id: the family, so logout and "sign out other sessions" revoke the right one.
        sid: familyId,
        // How this session was established — immutable for the session's lifetime
        ...(authMethod ? { authMethod } : {}),
      },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiry') || '15m',
      } as any,
    );

    const refreshToken = this.jwtService.sign(
      {
        sub: user.userId,
        tenantId: user.tenantId,
        tokenId,
        // Carried so a rotated session keeps saying how it was established.
        ...(authMethod ? { authMethod } : {}),
        // The token this one replaced, retired when this one is first presented.
        ...(predecessor ? { prev: predecessor.tokenId } : {}),
      },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - now) / 1000)),
      } as any,
    );

    await db.refreshToken.create({
      data: {
        tokenId,
        userId: user.id,
        token: this.hashToken(refreshToken),
        familyId,
        familyStartedAt,
        tenantId: user.tenantDbId ?? null,
        previousTokenId: predecessor?.tokenId ?? null,
        expiresAt,
      },
    });

    return { accessToken, refreshToken, refreshTokenId: tokenId, familyId };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
