import { Test, TestingModule } from '@nestjs/testing';
import { SearchHistoryService } from '../search-history.service';
import { SallyCacheService } from '../../../../../infrastructure/cache/sally-cache.service';

describe('SearchHistoryService', () => {
  let service: SearchHistoryService;
  let cache: any;

  beforeEach(async () => {
    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SearchHistoryService, { provide: SallyCacheService, useValue: cache }],
    }).compile();

    service = module.get<SearchHistoryService>(SearchHistoryService);
  });

  describe('logSearch', () => {
    it('should add new entry when no existing match', async () => {
      cache.get.mockResolvedValue(null);

      await service.logSearch(1, {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
      } as any);

      expect(cache.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            origin: { city: 'Dallas', state: 'TX' },
            searchCount: 1,
          }),
        ]),
        expect.any(Number),
      );
    });

    it('should increment count for existing search with same params', async () => {
      // First log to discover the generated id
      cache.get.mockResolvedValue(null);
      await service.logSearch(1, {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
      } as any);

      const firstCallEntries = cache.set.mock.calls[0][1];
      const generatedId = firstCallEntries[0].id;

      // Second log with same params — use the captured entry
      cache.get.mockResolvedValue([{ ...firstCallEntries[0] }]);
      jest.clearAllMocks();
      cache.get.mockResolvedValue([{ ...firstCallEntries[0] }]);

      await service.logSearch(1, {
        origin: { city: 'Dallas', state: 'TX', radius: 50 },
        provider: 'dat',
      } as any);

      const storedEntries = cache.set.mock.calls[0][1];
      const entry = storedEntries.find((e: any) => e.id === generatedId);
      expect(entry.searchCount).toBe(2);
    });
  });

  describe('getHistory', () => {
    it('should return empty when no history', async () => {
      cache.get.mockResolvedValue(null);

      const result = await service.getHistory(1);

      expect(result.recent).toEqual([]);
      expect(result.frequent).toEqual([]);
    });

    it('should return recent (sorted by date) and frequent (count > 1)', async () => {
      const entries = [
        {
          id: 'a',
          origin: { city: 'Dallas', state: 'TX' },
          destination: null,
          equipment: [],
          minRate: null,
          searchedAt: '2026-01-02T00:00:00Z',
          searchCount: 5,
          label: 'Dallas, TX',
        },
        {
          id: 'b',
          origin: { city: 'Houston', state: 'TX' },
          destination: null,
          equipment: [],
          minRate: null,
          searchedAt: '2026-01-03T00:00:00Z',
          searchCount: 1,
          label: 'Houston, TX',
        },
      ];
      cache.get.mockResolvedValue(entries);

      const result = await service.getHistory(1);

      expect(result.recent[0].id).toBe('b'); // most recent
      expect(result.frequent).toHaveLength(1); // only 'a' has count > 1
      expect(result.frequent[0].id).toBe('a');
    });

    it('should filter by query string', async () => {
      const entries = [
        {
          id: 'a',
          label: 'Dallas, TX → Houston, TX',
          searchedAt: '2026-01-01',
          searchCount: 2,
        },
        {
          id: 'b',
          label: 'Chicago, IL → Anywhere',
          searchedAt: '2026-01-02',
          searchCount: 3,
        },
      ];
      cache.get.mockResolvedValue(entries);

      const result = await service.getHistory(1, 'dallas');

      expect(result.recent).toHaveLength(1);
      expect(result.recent[0].id).toBe('a');
    });
  });

  describe('clearHistory', () => {
    it('should delete cache entry', async () => {
      await service.clearHistory(1);

      expect(cache.del).toHaveBeenCalled();
    });
  });
});
