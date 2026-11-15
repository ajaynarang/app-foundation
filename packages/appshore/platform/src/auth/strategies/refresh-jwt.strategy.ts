import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import type { AuthMethod } from '../jwt.service';
import { RefreshSessionService, type RefreshSession } from '../refresh-session.service';

export interface RefreshJwtPayload {
  sub: string; // userId
  tenantId?: string; // Optional — SUPER_ADMIN / tenant-less users have no tenant
  tokenId: string;
  authMethod?: AuthMethod;
  /** tokenId this token replaced on rotation. */
  prev?: string;
  iat: number;
  exp: number;
}

/**
 * Verifies the refresh cookie's signature and expiry (passport-jwt), then hands the row checks to
 * RefreshSessionService: the stored hash, revocation, reuse detection and the session's lifetime.
 */
@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    configService: ConfigService,
    private readonly refreshSessions: RefreshSessionService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request) => {
          return request?.cookies?.refreshToken;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.refreshSecret'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: RefreshJwtPayload): Promise<RefreshSession> {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    return this.refreshSessions.validatePresentedToken(payload.tokenId, refreshToken, {
      ip: req.ip ?? null,
      userAgent: req.headers?.['user-agent'] ?? null,
    });
  }
}
