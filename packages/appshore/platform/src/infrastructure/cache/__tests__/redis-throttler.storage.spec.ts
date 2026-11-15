import { RedisThrottlerStorage } from '../redis-throttler.storage';
import type { AppCacheService } from '../app-cache.service';

const storageOver = (throttleHit: jest.Mock, options = {}) =>
  new RedisThrottlerStorage({ throttleHit } as unknown as AppCacheService, options);

describe('RedisThrottlerStorage', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('with Redis up', () => {
    it('counts in Redis: namespaces the key by throttler and reports times in seconds, rounded up', async () => {
      const throttleHit = jest
        .fn()
        .mockResolvedValue({ totalHits: 6, windowMs: 1500, isBlocked: true, blockLeftMs: 59_001 });

      const record = await storageOver(throttleHit).increment('abc', 60_000, 5, 60_000, 'default');

      expect(throttleHit).toHaveBeenCalledWith('app:throttle:default:abc', 60_000, 5, 60_000);
      expect(record).toEqual({ totalHits: 6, timeToExpire: 2, isBlocked: true, timeToBlockExpire: 60 });
    });

    it('passes an unblocked hit through', async () => {
      const throttleHit = jest
        .fn()
        .mockResolvedValue({ totalHits: 1, windowMs: 60_000, isBlocked: false, blockLeftMs: 0 });

      expect(await storageOver(throttleHit).increment('k', 60_000, 5, 60_000, 'burst')).toEqual({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      });
    });

    it('two instances over the same Redis share one count', async () => {
      let hits = 0;
      const throttleHit = jest.fn().mockImplementation(async () => {
        hits += 1;
        return { totalHits: hits, windowMs: 60_000, isBlocked: hits > 2, blockLeftMs: hits > 2 ? 60_000 : 0 };
      });
      const replicaA = storageOver(throttleHit);
      const replicaB = storageOver(throttleHit);

      await replicaA.increment('k', 60_000, 2, 60_000, 'default');
      await replicaB.increment('k', 60_000, 2, 60_000, 'default');
      const third = await replicaA.increment('k', 60_000, 2, 60_000, 'default');

      expect(third).toMatchObject({ totalHits: 3, isBlocked: true });
    });
  });

  describe('with Redis unavailable', () => {
    it('still enforces the limit, from a local count, instead of allowing everything', async () => {
      const throttleHit = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      const storage = storageOver(throttleHit);

      const first = await storage.increment('k', 60_000, 2, 60_000, 'default');
      const second = await storage.increment('k', 60_000, 2, 60_000, 'default');
      const third = await storage.increment('k', 60_000, 2, 60_000, 'default');
      const fourth = await storage.increment('k', 60_000, 2, 60_000, 'default');

      expect(first).toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
      expect(second).toMatchObject({ totalHits: 2, isBlocked: false });
      expect(third).toMatchObject({ totalHits: 3, isBlocked: true, timeToBlockExpire: 60 });
      expect(fourth).toMatchObject({ isBlocked: true });
    });

    it('counts each key separately and never throws', async () => {
      const storage = storageOver(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')));

      await storage.increment('a', 60_000, 1, 60_000, 'default');
      const blockedA = await storage.increment('a', 60_000, 1, 60_000, 'default');
      const firstB = await storage.increment('b', 60_000, 1, 60_000, 'default');

      expect(blockedA.isBlocked).toBe(true);
      expect(firstB).toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('does not wait on a Redis that never answers: the hit is answered locally after the timeout', async () => {
      jest.useFakeTimers();
      const throttleHit = jest.fn().mockReturnValue(new Promise(() => undefined)); // a disconnected client queues forever
      const storage = storageOver(throttleHit, { timeoutMs: 250 });

      const pending = storage.increment('k', 60_000, 5, 60_000, 'default');
      await jest.advanceTimersByTimeAsync(250);

      await expect(pending).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
    });

    it('leaves Redis alone for the retry interval after a failure, then goes back to it', async () => {
      jest.useFakeTimers();
      const throttleHit = jest
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValue({ totalHits: 9, windowMs: 60_000, isBlocked: false, blockLeftMs: 0 });
      const storage = storageOver(throttleHit, { retryAfterMs: 5_000 });

      await storage.increment('k', 60_000, 5, 60_000, 'default'); // fails, falls back
      await storage.increment('k', 60_000, 5, 60_000, 'default'); // still local
      expect(throttleHit).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5_000);
      const backOnRedis = await storage.increment('k', 60_000, 5, 60_000, 'default');

      expect(throttleHit).toHaveBeenCalledTimes(2);
      expect(backOnRedis.totalHits).toBe(9);
    });

    it('lifts a local block once it has run out and starts a fresh window', async () => {
      jest.useFakeTimers();
      const storage = storageOver(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')), { retryAfterMs: 600_000 });

      await storage.increment('k', 1_000, 1, 2_000, 'default');
      expect((await storage.increment('k', 1_000, 1, 2_000, 'default')).isBlocked).toBe(true);

      jest.advanceTimersByTime(2_001);

      expect(await storage.increment('k', 1_000, 1, 2_000, 'default')).toMatchObject({
        totalHits: 1,
        isBlocked: false,
      });
    });
  });
});
