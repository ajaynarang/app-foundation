import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { AuthService } from '../auth/auth.service';
import { LoginEventService } from '../auth/login-event.service';

export interface DevUserDto {
  userId: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  driverId?: string | null;
  phone?: string | null;
}

const ROLE_ORDER: Record<string, number> = {
  OWNER: 0,
  ADMIN: 1,
  DISPATCHER: 2,
  DRIVER: 3,
  CUSTOMER: 4,
  SUPER_ADMIN: 5,
};

@Injectable()
export class DevService {
  private readonly logger = new Logger(DevService.name);

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private loginEventService: LoginEventService,
  ) {}

  async getUsers(tenantId?: string) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        tenant: { select: { tenantId: true, companyName: true } },
        driver: { select: { driverId: true, name: true } },
      },
      orderBy: [{ role: 'asc' }, { firstName: 'asc' }],
    });

    const superAdmins = users
      .filter((u) => u.role === 'SUPER_ADMIN')
      .map((u) => ({
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
      }));

    const tenantMap = new Map<string, { tenantId: string; tenantName: string; users: DevUserDto[] }>();

    for (const u of users) {
      if (u.role === 'SUPER_ADMIN' || !u.tenant) continue;
      if (tenantId && u.tenant.tenantId !== tenantId) continue;

      const key = u.tenant.tenantId;
      if (!tenantMap.has(key)) {
        tenantMap.set(key, {
          tenantId: key,
          tenantName: u.tenant.companyName,
          users: [],
        });
      }
      tenantMap.get(key).users.push({
        userId: u.userId,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        driverId: u.driver?.driverId ?? null,
        phone: u.phone ?? null,
      });
    }

    for (const tenant of tenantMap.values()) {
      tenant.users.sort((a, b) => (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99));
    }

    return { tenants: Array.from(tenantMap.values()), superAdmins };
  }

  async switchToUser(
    userId: string,
    meta: { ip: string | null; userAgent: string | null } = { ip: null, userAgent: null },
  ) {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      include: { tenant: true, driver: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const tokens = await this.authService.generateTokensForUser(user);
    this.recordDevLogin(user, tokens, meta).catch((err) =>
      this.logger.warn(`dev login event record failed: ${(err as Error).message}`),
    );
    return tokens;
  }

  private async recordDevLogin(user: any, tokens: any, meta: { ip: string | null; userAgent: string | null }) {
    const sessionId = String(tokens?.accessToken ?? 'dev').slice(-12);
    // Prefix preserves the dev-utility audit signal while still letting
    // ua-parser-js extract a real device label from the underlying UA.
    const userAgent = meta.userAgent ? `[dev] ${meta.userAgent}` : 'dev-utility';
    await this.loginEventService.recordSuccess({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      ip: meta.ip,
      userAgent,
      sessionId,
    });
  }
}
