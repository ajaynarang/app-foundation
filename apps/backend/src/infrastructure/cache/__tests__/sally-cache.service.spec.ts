import { Test, TestingModule } from '@nestjs/testing';
import { SallyCacheService } from '../sally-cache.service';
import { REDIS_CLIENT } from '../redis-client.provider';

const mockRedis = {
  on: jest.fn().mockReturnThis(),
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  scan: jest.fn(),
  info: jest.fn(),
  incrby: jest.fn(),
  expire: jest.fn(),
  options: { host: 'localhost', port: 6379, tls: undefined },
};

describe('SallyCacheService', () => {
  let service: SallyCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.set.mockResolvedValue('OK');
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [SallyCacheService, { provide: REDIS_CLIENT, useValue: mockRedis }],
    }).compile();
    service = module.get<SallyCacheService>(SallyCacheService);
    service.onModuleInit();
  });

  describe('get', () => {
    it('should return undefined on cache miss (Redis null)', async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await service.get('sally:test:key');
      expect(result).toBeUndefined();
    });

    it('should return parsed object on hit', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ data: 'value' }));
      const result = await service.get<{ data: string }>('sally:test:key');
      expect(result).toEqual({ data: 'value' });
    });

    it('should unwrap null sentinel to null', async () => {
      mockRedis.get.mockResolvedValue('__SALLY_NULL__');
      const result = await service.get('sally:test:key');
      expect(result).toBeNull();
    });

    it('should return undefined on corrupt JSON (treated as miss-like)', async () => {
      mockRedis.get.mockResolvedValue('not-valid-json{{{');
      const result = await service.get('sally:test:key');
      expect(result).toBeUndefined();
    });

    it('should record hit/miss metrics', async () => {
      mockRedis.get.mockResolvedValue(null);
      await service.get('sally:test:key1');
      mockRedis.get.mockResolvedValue(JSON.stringify('data'));
      await service.get('sally:test:key2');

      const metrics = service.getMetrics();
      expect(metrics['sally:test'].misses).toBe(1);
      expect(metrics['sally:test'].hits).toBe(1);
    });
  });

  describe('set', () => {
    it('should JSON-stringify value and store with PX TTL', async () => {
      await service.set('sally:test:key', { foo: 'bar' }, 60000);
      expect(mockRedis.set).toHaveBeenCalledWith('sally:test:key', JSON.stringify({ foo: 'bar' }), 'PX', 60000);
    });

    it('should store null sentinel for null values', async () => {
      await service.set('sally:test:key', null, 60000);
      expect(mockRedis.set).toHaveBeenCalledWith('sally:test:key', '__SALLY_NULL__', 'PX', 60000);
    });

    it('should store null sentinel for undefined values', async () => {
      await service.set('sally:test:key', undefined, 60000);
      expect(mockRedis.set).toHaveBeenCalledWith('sally:test:key', '__SALLY_NULL__', 'PX', 60000);
    });
  });

  describe('del', () => {
    it('should delete from Redis', async () => {
      await service.del('sally:test:key');
      expect(mockRedis.del).toHaveBeenCalledWith('sally:test:key');
    });
  });

  describe('getOrSet', () => {
    it('should return cached value without calling factory', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify('cached-data'));
      const factory = jest.fn();

      const result = await service.getOrSet('sally:test:key', factory, 60000);

      expect(result).toBe('cached-data');
      expect(factory).not.toHaveBeenCalled();
    });

    it('should call factory and cache result on miss (lock acquired)', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK'); // lock acquired
      const factory = jest.fn().mockResolvedValue('fresh-data');

      const result = await service.getOrSet('sally:test:key', factory, 60000);

      expect(result).toBe('fresh-data');
      expect(factory).toHaveBeenCalled();
      // The set for the actual cache key (not the lock) — last set call
      const allSetCalls = mockRedis.set.mock.calls;
      const cacheSet = allSetCalls.find((c) => c[0] === 'sally:test:key');
      expect(cacheSet).toBeDefined();
      expect(cacheSet![1]).toBe(JSON.stringify('fresh-data'));
    });
  });

  describe('delByPrefix', () => {
    it('should scan and delete every key under the prefix', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['sally:tower:wire:1:alert:0:50', 'sally:tower:wire:1:desk:0:50']]);
      mockRedis.del.mockResolvedValue(2);

      const count = await service.delByPrefix('sally:tower:wire:1:');

      expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'sally:tower:wire:1:*', 'COUNT', 200);
      expect(mockRedis.del).toHaveBeenCalledWith('sally:tower:wire:1:alert:0:50', 'sally:tower:wire:1:desk:0:50');
      expect(count).toBe(2);
    });

    it('should walk the SCAN cursor until it returns to 0', async () => {
      mockRedis.scan
        .mockResolvedValueOnce(['7', ['sally:tower:active-loads:1:4']])
        .mockResolvedValueOnce(['0', ['sally:tower:active-loads:1:8']]);
      mockRedis.del.mockResolvedValue(1);

      const count = await service.delByPrefix('sally:tower:active-loads:1:');

      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(count).toBe(2);
    });
  });

  describe('flushNamespace', () => {
    it('should scan and delete keys matching pattern', async () => {
      mockRedis.scan.mockResolvedValueOnce(['0', ['sally:test:key1', 'sally:test:key2']]);
      mockRedis.del.mockResolvedValue(2);

      const count = await service.flushNamespace('sally:test' as any);
      expect(count).toBe(2);
    });
  });

  describe('getRedisInfo', () => {
    it('should parse Redis INFO output', async () => {
      mockRedis.info.mockResolvedValue('# Server\r\nredis_version:7.0.0\r\nused_memory:1024\r\n');

      const result = await service.getRedisInfo();
      expect(result).toEqual({
        redis_version: '7.0.0',
        used_memory: '1024',
      });
    });
  });

  describe('increment', () => {
    it('should INCRBY then EXPIRE on first touch only', async () => {
      mockRedis.incrby.mockResolvedValue(1);
      await service.increment('sally:test:counter', 1, 60);
      expect(mockRedis.incrby).toHaveBeenCalledWith('sally:test:counter', 1);
      expect(mockRedis.expire).toHaveBeenCalledWith('sally:test:counter', 60);
    });

    it('should NOT call EXPIRE on subsequent increments', async () => {
      mockRedis.incrby.mockResolvedValue(5);
      await service.increment('sally:test:counter', 1, 60);
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });
});
