import { Inject, Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis-client.provider';

/**
 * Per-vendor circuit breaker backed by Redis.
 *
 * Trips OPEN after {@link FAILURE_THRESHOLD} failures inside a
 * {@link FAILURE_WINDOW_SECONDS} window, then stays open for
 * {@link OPEN_COOLDOWN_SECONDS} before automatically resetting (key TTL).
 *
 * Key prefix is `circuit:` — intentionally NOT `_lock:`. The `_lock:` prefix is
 * reserved for cache-lock keys that `SallyCacheService.flushAll()` wipes, and
 * we never want a cache flush to silently re-arm a circuit that is mid-cooldown.
 */
@Injectable()
export class VendorCircuitBreakerService {
  private readonly logger = new Logger(VendorCircuitBreakerService.name);

  private static readonly KEY_PREFIX = 'circuit';
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly FAILURE_WINDOW_SECONDS = 60;
  private static readonly OPEN_COOLDOWN_SECONDS = 300;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async isOpen(vendor: string): Promise<boolean> {
    const value = await this.redis.get(this.openKey(vendor));
    return value === '1';
  }

  async recordFailure(vendor: string): Promise<void> {
    const failuresKey = this.failuresKey(vendor);
    const count = await this.redis.incr(failuresKey);

    if (count === 1) {
      await this.redis.expire(failuresKey, VendorCircuitBreakerService.FAILURE_WINDOW_SECONDS);
    }

    if (count >= VendorCircuitBreakerService.FAILURE_THRESHOLD) {
      // NX guards against repeatedly extending an already-open circuit.
      await this.redis.set(this.openKey(vendor), '1', 'EX', VendorCircuitBreakerService.OPEN_COOLDOWN_SECONDS, 'NX');
      this.logger.warn(
        `Circuit opened for vendor=${vendor} after ${count} failures in ${VendorCircuitBreakerService.FAILURE_WINDOW_SECONDS}s — cooldown ${VendorCircuitBreakerService.OPEN_COOLDOWN_SECONDS}s`,
      );
    }
  }

  async recordSuccess(vendor: string): Promise<void> {
    await this.redis.del(this.failuresKey(vendor));
  }

  private failuresKey(vendor: string): string {
    return `${VendorCircuitBreakerService.KEY_PREFIX}:${vendor}:failures`;
  }

  private openKey(vendor: string): string {
    return `${VendorCircuitBreakerService.KEY_PREFIX}:${vendor}:open`;
  }
}
