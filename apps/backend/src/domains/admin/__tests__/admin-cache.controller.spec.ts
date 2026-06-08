import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AdminCacheController } from '../admin-cache.controller';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { CACHE_NAMESPACES } from '../../../constants/cache.constants';

describe('AdminCacheController', () => {
  let controller: AdminCacheController;
  let cacheService: Record<string, jest.Mock>;

  beforeEach(async () => {
    cacheService = {
      getRedisInfo: jest.fn(),
      getMetrics: jest.fn().mockReturnValue({ hits: 100, misses: 20 }),
      countKeys: jest.fn().mockResolvedValue(5),
      flushAll: jest.fn().mockResolvedValue(50),
      flushNamespace: jest.fn().mockResolvedValue(10),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminCacheController],
      providers: [{ provide: AppCacheService, useValue: cacheService }],
    }).compile();

    controller = module.get<AdminCacheController>(AdminCacheController);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getHealth ───────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('should return unavailable when Redis info is null', async () => {
      cacheService.getRedisInfo.mockResolvedValue(null);

      const result = await controller.getHealth();

      expect(result.status).toBe('unavailable');
      expect(result.backend).toBe('redis');
      expect(result.message).toBe('Redis client unreachable');
    });

    it('should return connected status with Redis info', async () => {
      cacheService.getRedisInfo.mockResolvedValue({
        uptime_in_seconds: '86400',
        used_memory_human: '1.5M',
        used_memory_peak_human: '2.0M',
        connected_clients: '5',
        db0: 'keys=120,expires=50',
        redis_version: '7.0.1',
      });

      const result = await controller.getHealth();

      expect(result.status).toBe('connected');
      expect(result.backend).toBe('redis');
      expect(result.uptime).toBe('86400s');
      expect(result.memoryUsed).toBe('1.5M');
      expect(result.memoryPeak).toBe('2.0M');
      expect(result.connectedClients).toBe('5');
      expect(result.totalKeys).toBe('keys=120,expires=50');
      expect(result.redisVersion).toBe('7.0.1');
    });

    it('should return unknown for missing Redis info fields', async () => {
      cacheService.getRedisInfo.mockResolvedValue({});

      const result = await controller.getHealth();

      expect(result.status).toBe('connected');
      expect(result.uptime).toBe('unknown');
      expect(result.memoryUsed).toBe('unknown');
      expect(result.memoryPeak).toBe('unknown');
      expect(result.connectedClients).toBe('unknown');
      expect(result.totalKeys).toBe('none');
      expect(result.redisVersion).toBe('unknown');
    });
  });

  // ─── getStats ────────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should return namespaces, metrics, and keyCounts', async () => {
      const result = await controller.getStats();

      expect(result.namespaces).toBe(CACHE_NAMESPACES);
      expect(result.metrics).toEqual({ hits: 100, misses: 20 });
      expect(result.keyCounts).toBeDefined();
      expect(cacheService.getMetrics).toHaveBeenCalled();
      expect(cacheService.countKeys).toHaveBeenCalledTimes(CACHE_NAMESPACES.length);
    });
  });

  // ─── flushAll ────────────────────────────────────────────────────────────

  describe('flushAll', () => {
    it('should throw BadRequestException when confirm is not true', async () => {
      await expect(controller.flushAll({})).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when body is empty', async () => {
      await expect(controller.flushAll({} as any)).rejects.toThrow(BadRequestException);
    });

    it('should flush all caches when confirmed', async () => {
      const result = await controller.flushAll({ confirm: true });

      expect(cacheService.flushAll).toHaveBeenCalled();
      expect(result).toEqual({ flushed: 50, scope: 'all' });
    });
  });

  // ─── flushNamespace ──────────────────────────────────────────────────────

  describe('flushNamespace', () => {
    it('should throw BadRequestException for invalid namespace', async () => {
      await expect(controller.flushNamespace('invalid-namespace')).rejects.toThrow(BadRequestException);
    });

    it('should flush a valid namespace', async () => {
      // Use first valid namespace from CACHE_NAMESPACES
      const validNamespace = CACHE_NAMESPACES[0];
      const result = await controller.flushNamespace(validNamespace);

      expect(cacheService.flushNamespace).toHaveBeenCalledWith(validNamespace);
      expect(result).toEqual({ flushed: 10, scope: validNamespace });
    });
  });
});
