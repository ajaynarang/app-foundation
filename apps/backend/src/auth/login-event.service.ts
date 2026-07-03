import { Injectable, Logger } from '@nestjs/common';
import { LoginFailReason } from '@appshore/db';
import { createHash } from 'crypto';
import { PrismaService } from '../infrastructure/database/prisma.service';

const USER_AGENT_MAX_LENGTH = 5000;

const FAIL_REASON_MAP: Record<
  'account_disabled' | 'tenant_inactive' | 'invalid_token' | 'user_not_found',
  LoginFailReason
> = {
  account_disabled: LoginFailReason.ACCOUNT_DISABLED,
  tenant_inactive: LoginFailReason.TENANT_INACTIVE,
  invalid_token: LoginFailReason.INVALID_TOKEN,
  user_not_found: LoginFailReason.USER_NOT_FOUND,
};

@Injectable()
export class LoginEventService {
  private readonly logger = new Logger(LoginEventService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordSuccess(params: {
    userId: number;
    tenantId: number | null;
    ip: string | null;
    userAgent: string | null;
    sessionId: string;
  }): Promise<void> {
    await this.prisma.loginEvent.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: 'SUCCESS',
        ip: params.ip,
        userAgent: this.truncateUserAgent(params.userAgent),
        deviceId: this.computeDeviceId(params.ip, params.userAgent),
        sessionId: params.sessionId,
      },
    });
  }

  async recordFailure(params: {
    userId: number;
    tenantId: number | null;
    ip: string | null;
    userAgent: string | null;
    failReason: 'account_disabled' | 'tenant_inactive' | 'invalid_token' | 'user_not_found';
  }): Promise<void> {
    await this.prisma.loginEvent.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: 'FAILED',
        ip: params.ip,
        userAgent: this.truncateUserAgent(params.userAgent),
        deviceId: this.computeDeviceId(params.ip, params.userAgent),
        failReason: FAIL_REASON_MAP[params.failReason] ?? LoginFailReason.OTHER,
      },
    });
  }

  async recordLogout(params: { userId: number; tenantId: number | null; sessionId: string }): Promise<void> {
    await this.prisma.loginEvent.create({
      data: {
        userId: params.userId,
        tenantId: params.tenantId,
        status: 'LOGOUT',
        sessionId: params.sessionId,
      },
    });
  }

  private truncateUserAgent(userAgent: string | null): string | null {
    if (!userAgent) return null;
    return userAgent.length > USER_AGENT_MAX_LENGTH ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : userAgent;
  }

  private computeDeviceId(ip: string | null, userAgent: string | null): string | null {
    if (!ip && !userAgent) return null;
    return createHash('sha256')
      .update(`${ip ?? ''}|${userAgent ?? ''}`)
      .digest('hex');
  }
}
