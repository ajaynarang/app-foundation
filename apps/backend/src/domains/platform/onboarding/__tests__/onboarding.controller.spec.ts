import { OnboardingController } from '../onboarding.controller';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';

describe('OnboardingController', () => {
  let controller: OnboardingController;
  let service: { getOnboardingStatus: jest.Mock };
  let cache: { getOrSet: jest.Mock };

  const mockStatus = {
    overallProgress: 50,
    items: [{ id: 'profile', label: 'Complete Your Profile', done: true }],
  };

  beforeEach(() => {
    service = {
      getOnboardingStatus: jest.fn().mockResolvedValue(mockStatus),
    };
    // getOrSet is the only path the controller uses now — model the cache-miss
    // case by default (factory runs and produces the value), and individual
    // tests can override to model a cache hit.
    cache = {
      getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) => factory()),
    };
    controller = new OnboardingController(service as any, cache as unknown as AppCacheService);
  });

  describe('getOnboardingStatus', () => {
    it('should return cached status without invoking the underlying service when cache hits', async () => {
      const cachedStatus = { overallProgress: 100, items: [] };
      cache.getOrSet.mockResolvedValueOnce(cachedStatus);

      const result = await controller.getOnboardingStatus(42);

      expect(result).toEqual(cachedStatus);
      expect(cache.getOrSet).toHaveBeenCalledWith('sally:onboarding:status:tenant:42', expect.any(Function), 30_000);
      // Service is NOT called because the factory was never invoked (cache hit path).
      expect(service.getOnboardingStatus).not.toHaveBeenCalled();
    });

    it('should compute via the underlying service when cache misses', async () => {
      const result = await controller.getOnboardingStatus(42);

      expect(result).toEqual(mockStatus);
      expect(service.getOnboardingStatus).toHaveBeenCalledWith(42);
      expect(cache.getOrSet).toHaveBeenCalledWith('sally:onboarding:status:tenant:42', expect.any(Function), 30_000);
    });

    it('should produce per-tenant cache keys', async () => {
      await controller.getOnboardingStatus(99);

      expect(cache.getOrSet).toHaveBeenCalledWith('sally:onboarding:status:tenant:99', expect.any(Function), 30_000);
      expect(service.getOnboardingStatus).toHaveBeenCalledWith(99);
    });
  });
});
