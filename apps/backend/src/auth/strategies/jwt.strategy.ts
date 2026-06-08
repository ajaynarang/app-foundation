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
  driverId?: string;
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
        driver: true,
        customer: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Check tenant is active (skip for SUPER_ADMIN who has no tenant)
    if (user.tenant && !user.tenant.isActive) {
      throw new UnauthorizedException('Tenant is inactive');
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
      driverId: user.driver?.driverId, // String driver ID (for display)
      driverDbId: user.driver?.id, // Numeric database ID (for queries)
      driverName: user.driver?.name,
      customerId: user.customer?.customerId,
      customerDbId: user.customer?.id,
      customerName: user.customer?.companyName,
      isActive: user.isActive,
      authMethod: payload.authMethod, // How this session was established
    };
  }
}
