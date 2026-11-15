import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { AppCacheService } from './app-cache.service';

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

export interface RedisThrottlerStorageOptions {
  /** How long one hit may wait for Redis before the local count answers instead. */
  timeoutMs?: number;
  /** After a failed or slow hit, how long Redis is left alone before it is tried again. */
  retryAfterMs?: number;
}

const DEFAULT_TIMEOUT_MS = 250;
const DEFAULT_RETRY_AFTER_MS = 5_000;
const LOCAL_WINDOWS_MAX = 10_000;

interface LocalWindow {
  hits: number;
  windowEndsAt: number;
  blockedUntil: number;
}

/**
 * `@nestjs/throttler` storage on the shared Redis, so every API replica counts against one window. The default
 * in-memory storage gives each replica its own count (N replicas = N times the limit) and forgets it on deploy.
 *
 * When Redis is unreachable or slow the limit is still enforced, per replica, from a local count: a hit waits at
 * most `timeoutMs` for Redis, and after a failure Redis is left alone for `retryAfterMs`. That is the behaviour
 * the in-memory storage had, for the length of the outage. The alternatives are worse: failing open lifts the
 * login and token brute-force limits exactly when someone may be causing the outage, and failing closed (or
 * waiting on the Redis client, which queues commands while disconnected) turns a cache blip into an API outage.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly timeoutMs: number;
  private readonly retryAfterMs: number;
  private readonly localWindows = new Map<string, LocalWindow>();
  private redisSuspendedUntil = 0;

  constructor(
    private readonly cache: AppCacheService,
    options: RedisThrottlerStorageOptions = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retryAfterMs = options.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const storageKey = `app:throttle:${throttlerName}:${key}`;
    if (Date.now() >= this.redisSuspendedUntil) {
      try {
        const hit = await this.withTimeout(this.cache.throttleHit(storageKey, ttl, limit, blockDuration));
        return {
          totalHits: hit.totalHits,
          timeToExpire: Math.ceil(hit.windowMs / 1000),
          isBlocked: hit.isBlocked,
          timeToBlockExpire: Math.ceil(hit.blockLeftMs / 1000),
        };
      } catch (error) {
        this.redisSuspendedUntil = Date.now() + this.retryAfterMs;
        this.logger.warn(
          `Throttle storage unavailable (${(error as Error).message}); counting on this instance for ${this.retryAfterMs}ms`,
        );
      }
    }
    return this.localHit(storageKey, ttl, limit, blockDuration);
  }

  private withTimeout<T>(operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer within ${this.timeoutMs}ms`)), this.timeoutMs);
    });
    // The Redis command may still settle after the timeout won; its outcome no longer matters.
    operation.catch(() => undefined);
    return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
  }

  /** The same fixed window and block as the Redis script, counted on this instance only. */
  private localHit(key: string, ttl: number, limit: number, blockDuration: number): ThrottlerStorageRecord {
    const now = Date.now();
    if (this.localWindows.size >= LOCAL_WINDOWS_MAX) this.dropExpiredLocalWindows(now);

    let window = this.localWindows.get(key);
    if (!window || (window.windowEndsAt <= now && window.blockedUntil <= now)) {
      window = { hits: 0, windowEndsAt: now + ttl, blockedUntil: 0 };
      this.localWindows.set(key, window);
    }
    if (window.blockedUntil <= now) {
      window.hits += 1;
      if (window.hits > limit) {
        window.blockedUntil = now + blockDuration;
        window.windowEndsAt = window.blockedUntil;
      }
    }
    const isBlocked = window.blockedUntil > now;
    return {
      totalHits: window.hits,
      timeToExpire: Math.ceil((window.windowEndsAt - now) / 1000),
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil((window.blockedUntil - now) / 1000) : 0,
    };
  }

  private dropExpiredLocalWindows(now: number): void {
    for (const [key, window] of this.localWindows) {
      if (window.windowEndsAt <= now && window.blockedUntil <= now) this.localWindows.delete(key);
    }
    // Still full of live windows (a flood of distinct callers): start over rather than grow without bound.
    if (this.localWindows.size >= LOCAL_WINDOWS_MAX) this.localWindows.clear();
  }
}
