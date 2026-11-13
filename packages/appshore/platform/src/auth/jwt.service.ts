import { Injectable } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infrastructure/database/prisma.service';
import * as crypto from 'crypto';

export type AuthMethod = 'email_password' | 'phone_pin' | 'phone_otp';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * It is retired the first time its successor is presented ([retirePredecessor]), which proves the client got it.
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
    return this.issue(user, authMethod, null);
  }

  /**
   * Issue the successor of a presented refresh token, in the same family. The presented token stays valid until
   * this successor is first presented (see the class comment).
   */
  async rotateRefreshToken(user: SessionUser, presented: SessionLineage, authMethod?: AuthMethod): Promise<TokenPair> {
    return this.issue(user, authMethod, presented);
  }

  /**
   * Retire the token a presented successor replaced, and any sibling: another unretired token that replaced the
   * same one (two tabs that refreshed together). One conditional update, so it is atomic and idempotent. `rotatedAt`
   * marks the rows as retired by rotation, which is what makes presenting one again detectable as reuse.
   */
  async retirePredecessor(presented: { tokenId: string; familyId: string; previousTokenId: string }): Promise<void> {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: {
        familyId: presented.familyId,
        isRevoked: false,
        OR: [
          { tokenId: presented.previousTokenId },
          { previousTokenId: presented.previousTokenId, tokenId: { not: presented.tokenId } },
        ],
      },
      data: { isRevoked: true, revokedAt: now, rotatedAt: now },
    });
  }

  /** End a session: revoke every live token of the family. A revoked (not rotated) token gets a plain 401. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, isRevoked: false },
      data: { isRevoked: true, revokedAt: new Date() },
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

  async cleanupExpiredTokens(): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
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
  }

  private async issue(
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

    await this.prisma.refreshToken.create({
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
