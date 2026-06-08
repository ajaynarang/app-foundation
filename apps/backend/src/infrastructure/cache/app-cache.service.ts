import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis-client.provider';
import { CacheNamespace } from '../../constants/cache.constants';

/** Sentinel value to distinguish "cached null" from "cache miss". Stored as a JSON string. */
const CACHE_NULL_SENTINEL = '__APP_NULL__';

export interface NamespaceMetrics {
  hits: number;
  misses: number;
}

/**
 * Single source of truth for all Sally cache operations.
 *
 * Backed by **one** ioredis client (REDIS_CLIENT). Every read, write, scan, lock,
 * rate-limit increment, and INFO call goes through this same connection. There
 * is no separate cache-manager layer — that abstraction caused a silent
 * in-memory fallback bug (see .docs/plans/10-platform/2026-05-27-cache-unify-on-ioredis.md).
 *
 * If you need a new Redis command, add it as a method here. Do NOT inject
 * REDIS_CLIENT into a domain service and bypass this facade — the ESLint
 * `no-restricted-imports` guard blocks `cache-manager` but cannot prevent
 * direct ioredis usage. Keep raw Redis behind this service so we have one
 * place to add metrics, circuit breakers, and graceful degradation later.
 */
@Injectable()
export class AppCacheService implements OnModuleInit {
  private readonly logger = new Logger(AppCacheService.name);
  // Metrics Map: namespaces are finite and static (~30 entries max).
  // Do NOT introduce dynamic namespace patterns without capping this Map.
  private readonly metrics = new Map<string, NamespaceMetrics>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  onModuleInit(): void {
    this.redis.on('error', (err) => {
      this.logger.error(`Redis client error: ${err.message}`);
    });
    this.logger.log(`Cache backend: Redis (${this.redactedUrl()})`);
  }

  // ---------------------------------------------------------------------------
  // Core operations — all go through the single ioredis client.
  // ---------------------------------------------------------------------------

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(key);
    const ns = this.extractNamespace(key);

    if (raw === null) {
      this.recordMiss(ns);
      return undefined;
    }

    this.recordHit(ns);

    if (raw === CACHE_NULL_SENTINEL) return null as T;

    try {
      return JSON.parse(raw) as T;
    } catch (err) {
      this.logger.warn(
        `Cache value for key="${key}" failed JSON.parse — returning undefined. ${(err as Error).message}`,
      );
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    const stored = value === null || value === undefined ? CACHE_NULL_SENTINEL : JSON.stringify(value);
    await this.redis.set(key, stored, 'PX', ttlMs);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  /**
   * Delete every key under a prefix via Redis SCAN. Use when a cache family is
   * keyed with variable trailing segments (e.g. lookahead hours, filter kinds,
   * time buckets) that an exact-key `del()` cannot target. The prefix is
   * matched as `${prefix}*` — pass the full discriminating prefix (typically
   * ending in a tenant id) so invalidation stays tenant-scoped.
   *
   * Best-effort: SCAN is not atomic, so keys written mid-scan may be missed —
   * those caches self-heal on their next read.
   */
  async delByPrefix(prefix: string): Promise<number> {
    return this.scanAndDelete(`${prefix}*`);
  }

  // ---------------------------------------------------------------------------
  // Stampede-safe get-or-set
  // ---------------------------------------------------------------------------

  async getOrSet<T>(key: string, factory: () => Promise<T>, ttlMs: number): Promise<T> {
    // 1. Try cache first (metrics recorded inside get())
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;

    // 2. Try to acquire lock (uses _lock: prefix to avoid collision with sally:* SCAN flush)
    const lockKey = `_lock:${key}`;
    const acquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');

    if (acquired === 'OK') {
      try {
        const result = await factory();
        await this.set(key, result, ttlMs);
        return result;
      } finally {
        await this.redis.del(lockKey).catch(() => {});
      }
    }

    // 3. Another process is computing — poll for the value
    for (let i = 0; i < 5; i++) {
      await this.sleep(100);
      const value = await this.get<T>(key);
      if (value !== undefined) return value;
    }

    // 4. Fallback: compute anyway to prevent deadlock
    this.logger.warn(`Lock wait exhausted for key=${key}, computing fallback`);
    const fallback = await factory();
    await this.set(key, fallback, ttlMs);
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Flush operations (best-effort: SCAN is not atomic, keys written during
  // scan may be missed. Caches self-heal on next read.)
  // ---------------------------------------------------------------------------

  async flushNamespace(namespace: CacheNamespace): Promise<number> {
    return this.scanAndDelete(`${namespace}:*`);
  }

  async flushAll(): Promise<number> {
    return this.scanAndDelete('sally:*');
  }

  // ---------------------------------------------------------------------------
  // Metrics & info
  // ---------------------------------------------------------------------------

  getMetrics(): Record<string, NamespaceMetrics> {
    const result: Record<string, NamespaceMetrics> = {};
    for (const [ns, m] of this.metrics.entries()) {
      result[ns] = { ...m };
    }
    return result;
  }

  /** Count keys matching a pattern using SCAN (non-blocking). */
  async countKeys(pattern: string): Promise<number> {
    let cursor = '0';
    let count = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      count += keys.length;
    } while (cursor !== '0');

    return count;
  }

  async getRedisInfo(): Promise<Record<string, string> | null> {
    try {
      const raw = await this.redis.info();
      const parsed: Record<string, string> = {};
      for (const line of raw.split('\r\n')) {
        if (line && !line.startsWith('#')) {
          const [k, v] = line.split(':');
          if (k && v) parsed[k] = v;
        }
      }
      return parsed;
    } catch (error) {
      this.logger.error('Failed to get Redis INFO', (error as Error).message);
      return null;
    }
  }

  /**
   * Atomically increment a counter key by `cost`, setting TTL only on the first
   * increment in the window. Returns the new value.
   */
  async increment(key: string, cost = 1, ttlSeconds = 60): Promise<number> {
    const value = await this.redis.incrby(key, cost);
    if (value === cost) {
      await this.redis.expire(key, ttlSeconds);
    }
    return value;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private extractNamespace(key: string): string {
    const parts = key.split(':');
    if (parts.length >= 2) return `${parts[0]}:${parts[1]}`;
    return key;
  }

  private recordHit(namespace: string): void {
    const m = this.metrics.get(namespace) ?? { hits: 0, misses: 0 };
    m.hits++;
    this.metrics.set(namespace, m);
  }

  private recordMiss(namespace: string): void {
    const m = this.metrics.get(namespace) ?? { hits: 0, misses: 0 };
    m.misses++;
    this.metrics.set(namespace, m);
  }

  private async scanAndDelete(pattern: string): Promise<number> {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    this.logger.log(`Flushed ${deleted} keys matching "${pattern}"`);
    return deleted;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** Best-effort redacted Redis URL for boot logging — host only, no credentials. */
  private redactedUrl(): string {
    const opts = this.redis.options;
    const host = opts.host ?? 'unknown';
    const port = opts.port ?? 6379;
    const tls = opts.tls ? 'rediss' : 'redis';
    return `${tls}://${host}:${port}`;
  }
}
