import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';

@Module({
  imports: [
    TerminusModule, // provides HealthCheckService and PrismaHealthIndicator
    // exports REDIS_CLIENT, used by RedisHealthIndicator
  ],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
