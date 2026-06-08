import { Controller, Get, Param, Post, BadRequestException } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { PlatformHealthService, ServiceHealth } from './platform-health.service';
import { PlatformBalanceService, ServiceBalance } from './platform-balance.service';
import { PlatformServicesConfig, PlatformServiceName, PLATFORM_SERVICE_NAMES } from './platform-services.config';

/** Combined health + balance data returned per service */
export interface PlatformServiceStatus extends ServiceHealth {
  balance: ServiceBalance;
  dashboardUrl?: string;
}

@Controller('admin/platform-services')
@Roles(UserRole.SUPER_ADMIN)
export class PlatformHealthController {
  constructor(
    private health: PlatformHealthService,
    private balance: PlatformBalanceService,
    private config: PlatformServicesConfig,
  ) {}

  @Get('health')
  async getHealth(): Promise<{
    services: Record<PlatformServiceName, PlatformServiceStatus>;
  }> {
    const configMap = this.config.getAll();
    const [healthMap, balanceMap] = await Promise.all([this.health.getAllHealth(), this.balance.getAllBalances()]);

    const services = {} as Record<PlatformServiceName, PlatformServiceStatus>;
    for (const [name, entry] of Object.entries(configMap)) {
      const key = name as PlatformServiceName;
      services[key] = {
        provider: entry.provider,
        configured: entry.configured,
        ...healthMap[key],
        status: !entry.configured ? 'not_configured' : healthMap[key].status,
        balance: balanceMap[key],
        dashboardUrl: entry.dashboardUrl,
      };
    }

    return { services };
  }

  /** Force-refresh balance probe for a single service */
  @Post('balance/:service/refresh')
  async refreshBalance(@Param('service') service: string): Promise<{ balance: ServiceBalance }> {
    if (!(PLATFORM_SERVICE_NAMES as readonly string[]).includes(service)) {
      throw new BadRequestException(`Unknown platform service: ${service}`);
    }

    const balance = await this.balance.refreshBalance(service as PlatformServiceName);
    return { balance };
  }
}
