import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { PrismaService } from '../infrastructure/database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('live')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => Promise.resolve({ liveness: { status: 'up' as const } })]);
  }

  @Public()
  @SkipThrottle()
  @Get('ready')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([
      () =>
        this.prismaIndicator.pingCheck('database', this.prisma, {
          timeout: 3000,
        }),
      () => this.redisIndicator.pingCheck('redis'),
    ]);
  }
}
