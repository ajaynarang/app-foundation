import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.health-indicator';
import { CacheModule } from '../infrastructure/cache/cache.module';

@Module({
  imports: [
    TerminusModule, // provides HealthCheckService and PrismaHealthIndicator
    CacheModule, // exports REDIS_CLIENT, used by RedisHealthIndicator
  ],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
