import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { PrismaService } from '../infrastructure/database/prisma.service';
import { ApiOperation } from '@nestjs/swagger';

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
  @ApiOperation({ summary: 'Liveness probe — the process is up (public, never throttled)' })
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([() => Promise.resolve({ liveness: { status: 'up' as const } })]);
  }

  @Public()
  @SkipThrottle()
  @Get('ready')
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness probe — database and Redis reachable; 503 when either is down (public)' })
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
