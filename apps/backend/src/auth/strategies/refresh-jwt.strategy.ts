import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { PrismaService } from '../../infrastructure/database/prisma.service';

export interface RefreshJwtPayload {
  sub: string; // userId
  tenantId: string;
  tokenId: string;
  iat: number;
  exp: number;
}

@Injectable()
export class RefreshJwtStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
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

  async validate(req: Request, payload: RefreshJwtPayload) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Validate that refresh token exists in database and is not revoked
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { tokenId: payload.tokenId },
      include: {
        user: {
          include: {
            tenant: true,
          },
        },
      },
    });

    if (!tokenRecord || tokenRecord.isRevoked) {
      throw new UnauthorizedException('Invalid or revoked refresh token');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (!tokenRecord.user.isActive || !tokenRecord.user.tenant.isActive) {
      throw new UnauthorizedException('User or tenant is inactive');
    }

    return {
      userId: tokenRecord.user.userId,
      email: tokenRecord.user.email,
      role: tokenRecord.user.role,
      tenantId: tokenRecord.user.tenant.tenantId,
      tenantName: tokenRecord.user.tenant.companyName,
      tokenId: payload.tokenId,
      isActive: tokenRecord.user.isActive,
    };
  }
}
