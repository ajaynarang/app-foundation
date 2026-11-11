/**
 * Integration test for AppCacheService against a real Redis instance.
 *
 * Guards the regression that motivated this entire refactor: writes through
 * the cache facade must produce literal `app:*` keys in Redis (no Keyv
 * prefix, no in-memory shadow, no double-encoding). The test reads back
 * with a **separate raw ioredis client** so it asserts what is actually in
 * Redis, not what the service thinks is in Redis.
 *
 * Runs against the Redis that REDIS_URL names, and only that one: the spec
 * writes and deletes keys, so it never guesses a port (6379 on a developer
 * machine is often another project's Redis). Skipped when REDIS_URL is unset
 * or unreachable so unit-test runs don't block on infra. Local compose Redis:
 *   REDIS_URL=redis://localhost:6399 pnpm --filter @appshore/platform test
 */
import Redis from 'ioredis';
import { AppCacheService } from '../app-cache.service';

const REDIS_URL = process.env.REDIS_URL;
const TEST_PREFIX = 'app:itest';

async function isRedisReachable(url: string): Promise<boolean> {
  const probe = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0, connectTimeout: 1000 });
  try {
    await probe.connect();
    await probe.ping();
    return true;
  } catch {
    return false;
  } finally {
    probe.disconnect();
  }
}

describe('AppCacheService (integration, real Redis)', () => {
  let redis: Redis; // service-side client
  let probe: Redis; // separate verification client — proves writes actually hit Redis
  let service: AppCacheService;
  let available: boolean;

  beforeAll(async () => {
    if (!REDIS_URL) {
      available = false;
      console.warn('Skipping AppCacheService integration: REDIS_URL is not set');
      return;
    }
    available = await isRedisReachable(REDIS_URL);
    if (!available) {
      console.warn(`Skipping AppCacheService integration: Redis at ${REDIS_URL} unreachable`);
    }
  });

  beforeEach(async () => {
    if (!available) return;
    redis = new Redis(REDIS_URL as string);
    probe = new Redis(REDIS_URL as string);
    // Inject the service-side client (matches what the Nest DI container produces).
    service = new AppCacheService(redis);
    service.onModuleInit();

    // Clean slate for our test prefix only — never touch foreign keys.
    const stale = await probe.keys(`${TEST_PREFIX}:*`);
    if (stale.length > 0) await probe.del(...stale);
  });

  afterEach(async () => {
    if (!available) return;
    // Clean up after ourselves so reruns don't accumulate keys.
    const stale = await probe.keys(`${TEST_PREFIX}:*`);
    if (stale.length > 0) await probe.del(...stale);
    redis.disconnect();
    probe.disconnect();
  });

  it('writes a literal app:* key with the exact name (no Keyv prefix, no transformation)', async () => {
    if (!available) return;

    await service.set(`${TEST_PREFIX}:exact-key`, { ok: true }, 60_000);

    // Read back via the SEPARATE probe client — proves the byte is in Redis,
    // not just in some in-memory shadow inside the service.
    const raw = await probe.get(`${TEST_PREFIX}:exact-key`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw)).toEqual({ ok: true });
  });

  it('round-trips an object through get/set', async () => {
    if (!available) return;

    const value = { recordId: 'R-1', count: 123, nested: { ok: true } };
    await service.set(`${TEST_PREFIX}:roundtrip`, value, 60_000);
    const got = await service.get<typeof value>(`${TEST_PREFIX}:roundtrip`);
    expect(got).toEqual(value);
  });

  it('returns undefined on cache miss', async () => {
    if (!available) return;

    const got = await service.get(`${TEST_PREFIX}:does-not-exist`);
    expect(got).toBeUndefined();
  });

  it('distinguishes cached null from miss via sentinel', async () => {
    if (!available) return;

    await service.set(`${TEST_PREFIX}:nullable`, null, 60_000);

    const hit = await service.get(`${TEST_PREFIX}:nullable`);
    const miss = await service.get(`${TEST_PREFIX}:nope`);

    expect(hit).toBeNull();
    expect(miss).toBeUndefined();
  });

  it('flushNamespace removes only keys under that namespace', async () => {
    if (!available) return;

    await service.set(`${TEST_PREFIX}:a`, 1, 60_000);
    await service.set(`${TEST_PREFIX}:b`, 2, 60_000);
    await service.set('app:itest-other:keep', 'should-remain', 60_000);

    try {
      const flushed = await service.flushNamespace(TEST_PREFIX as any);
      expect(flushed).toBeGreaterThanOrEqual(2);

      expect(await probe.get(`${TEST_PREFIX}:a`)).toBeNull();
      expect(await probe.get(`${TEST_PREFIX}:b`)).toBeNull();
      // Bystander key in a different namespace must survive.
      expect(await probe.get('app:itest-other:keep')).toBeTruthy();
    } finally {
      // Clean up the bystander we wrote above so we don't leak between tests.
      await probe.del('app:itest-other:keep');
    }
  });

  it('countKeys reports keys actually present in Redis', async () => {
    if (!available) return;

    await service.set(`${TEST_PREFIX}:c1`, 'v1', 60_000);
    await service.set(`${TEST_PREFIX}:c2`, 'v2', 60_000);

    const count = await service.countKeys(`${TEST_PREFIX}:*`);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  describe('throttleHit (the rate-limit script)', () => {
    const key = `${TEST_PREFIX}:throttle`;

    it('counts hits in one fixed window and sets its expiry once', async () => {
      if (!available) return;

      const first = await service.throttleHit(key, 60_000, 3, 60_000);
      const second = await service.throttleHit(key, 60_000, 3, 60_000);

      expect(first).toMatchObject({ totalHits: 1, isBlocked: false, blockLeftMs: 0 });
      expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
      expect(first.windowMs).toBe(60_000);
      expect(second.windowMs).toBeLessThanOrEqual(60_000);
      expect(await probe.get(key)).toBe('2');
      expect(await probe.pttl(key)).toBeGreaterThan(0);
    });

    it('blocks the hit that passes the limit, and every hit after it, for the block duration', async () => {
      if (!available) return;

      await service.throttleHit(key, 60_000, 2, 30_000);
      await service.throttleHit(key, 60_000, 2, 30_000);
      const over = await service.throttleHit(key, 60_000, 2, 30_000);
      const stillBlocked = await service.throttleHit(key, 60_000, 2, 30_000);

      expect(over).toMatchObject({ totalHits: 3, isBlocked: true, blockLeftMs: 30_000 });
      expect(stillBlocked.isBlocked).toBe(true);
      expect(stillBlocked.blockLeftMs).toBeGreaterThan(0);
      expect(stillBlocked.blockLeftMs).toBeLessThanOrEqual(30_000);
      expect(await probe.pttl(`${key}:blocked`)).toBeGreaterThan(0);
    });

    it('starts a fresh window once the block has lifted', async () => {
      if (!available) return;

      await service.throttleHit(key, 60_000, 1, 50);
      expect((await service.throttleHit(key, 60_000, 1, 50)).isBlocked).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 80));

      expect(await service.throttleHit(key, 60_000, 1, 50)).toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('a second client on the same Redis shares the count (what replicas need)', async () => {
      if (!available) return;
      const otherReplica = new AppCacheService(probe);

      await service.throttleHit(key, 60_000, 5, 60_000);
      const fromOther = await otherReplica.throttleHit(key, 60_000, 5, 60_000);

      expect(fromOther.totalHits).toBe(2);
    });
  });

  it('increment is atomic — INCRBY then first-touch EXPIRE', async () => {
    if (!available) return;

    const key = `${TEST_PREFIX}:counter`;
    const v1 = await service.increment(key, 1, 60);
    const v2 = await service.increment(key, 1, 60);
    expect(v1).toBe(1);
    expect(v2).toBe(2);
    const ttl = await probe.ttl(key);
    expect(ttl).toBeGreaterThan(0);
  });
});
