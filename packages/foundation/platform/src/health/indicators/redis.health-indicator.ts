import { Inject, Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../infrastructure/cache/redis-client.provider';

/**
 * Pings the shared `REDIS_CLIENT` connection. Uses the singleton, not a
 * per-probe socket, so health checks don't pay the TLS handshake cost on
 * every poll and the indicator reflects the same connection the app uses
 * for cache, locks, and rate limits.
 */
@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const response = await this.redis.ping();
      if (response !== 'PONG') {
        throw new Error(`Unexpected ping response: ${String(response)}`);
      }
      return this.getStatus(key, true);
    } catch (error) {
      throw new HealthCheckError(
        `${key} ping failed`,
        this.getStatus(key, false, { message: (error as Error).message }),
      );
    }
  }
}
