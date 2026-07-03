import { Injectable, Logger } from '@nestjs/common';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infrastructure/database/prisma.service';
import * as crypto from 'crypto';

export type AuthMethod = 'email_password' | 'phone_pin' | 'phone_otp';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenId: string;
}

@Injectable()
export class JwtTokenService {
  private readonly logger = new Logger(JwtTokenService.name);

  constructor(
    private jwtService: NestJwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async generateTokenPair(user: any, authMethod?: AuthMethod): Promise<TokenPair> {
    const tokenId = `rt_${crypto.randomBytes(16).toString('hex')}`;

    // Generate access token (short-lived)
    const accessToken = this.jwtService.sign(
      {
        sub: user.userId,
        // email is optional — phone-only users may not have one
        ...(user.email ? { email: user.email } : {}),
        role: user.role,
        tenantId: user.tenantId,
        // Session id: ties the access token to its refresh-token row so
        // logout / change-password can revoke the right session.
        sid: tokenId,
        // How this session was established — immutable for the token lifetime
        ...(authMethod ? { authMethod } : {}),
      },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiry') || '15m',
      } as any,
    );

    // Generate refresh token (long-lived)
    const refreshToken = this.jwtService.sign(
      {
        sub: user.userId,
        tenantId: user.tenantId,
        tokenId,
      },
      {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        expiresIn: this.configService.get<string>('jwt.refreshExpiry') || '7d',
      } as any,
    );

    // Store refresh token in database
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: {
        tokenId,
        userId: user.id,
        token: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId: tokenId,
    };
  }

  /**
   * Generate a new access token only — no DB write, no new refresh token.
   * Use this when the client presents a valid refresh token cookie and just
   * needs a new short-lived access token (the existing refresh token stays valid).
   */
  generateAccessTokenOnly(user: any): string {
    return this.jwtService.sign(
      {
        sub: user.userId,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId,
        // Carry the session id forward so the refreshed access token stays
        // tied to the same refresh-token row (used by logout revocation).
        ...(user.sid ? { sid: user.sid } : {}),
      },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>('jwt.accessExpiry') || '15m',
      } as any,
    );
  }

  async revokeRefreshToken(tokenId: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { tokenId },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
