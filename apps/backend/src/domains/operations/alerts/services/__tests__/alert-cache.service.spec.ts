import { Test, TestingModule } from '@nestjs/testing';
import { AlertCacheService } from '../alert-cache.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

const mockCache = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

describe('AlertCacheService', () => {
  let service: AlertCacheService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [AlertCacheService, { provide: SallyCacheService, useValue: mockCache }],
    }).compile();

    service = module.get<AlertCacheService>(AlertCacheService);
  });

  describe('get', () => {
    it('should return cached value', async () => {
      mockCache.get.mockResolvedValue({ count: 5 });
      const result = await service.get('key');
      expect(result).toEqual({ count: 5 });
    });

    it('should return null for missing key', async () => {
      mockCache.get.mockResolvedValue(undefined);
      const result = await service.get('missing');
      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value with TTL in ms', async () => {
      await service.set('key', { data: 1 }, 300);
      expect(mockCache.set).toHaveBeenCalledWith('key', { data: 1 }, 300000);
    });
  });

  describe('invalidate', () => {
    it('should delete cache key', async () => {
      await service.invalidate('key');
      expect(mockCache.del).toHaveBeenCalledWith('key');
    });
  });

  describe('bustStatsCache', () => {
    it('should invalidate both stats and smart-stats keys', async () => {
      mockCache.del.mockResolvedValue(undefined);
      await service.bustStatsCache(1);
      expect(mockCache.del).toHaveBeenCalledTimes(2);
    });

    it('should not throw when cache fails', async () => {
      mockCache.del.mockRejectedValue(new Error('Redis down'));
      await expect(service.bustStatsCache(1)).resolves.toBeUndefined();
    });
  });
});
