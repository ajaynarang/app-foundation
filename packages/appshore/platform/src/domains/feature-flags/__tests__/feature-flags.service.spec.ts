import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { createMockOutbox } from '../../../test/mocks/outbox.mock';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let prisma: any;
  let cache: any;
  let eventEmitter: any;

  const mockFlag = {
    key: 'reports',
    name: 'Advanced Reports',
    description: 'Enable reports',
    enabled: true,
    category: 'compliance',
  };

  beforeEach(() => {
    prisma = {
      featureFlag: {
        findMany: jest.fn().mockResolvedValue([mockFlag]),
        findUnique: jest.fn().mockResolvedValue(mockFlag),
        update: jest.fn().mockResolvedValue(mockFlag),
      },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };

    // A small in-memory stand-in with the cache service's own semantics:
    // `get` answers undefined on a miss; `getOrSet` stores what the factory returns.
    const store = new Map<string, unknown>();
    cache = {
      store,
      get: jest.fn((key: string) => Promise.resolve(store.get(key))),
      set: jest.fn((key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      getOrSet: jest.fn(async (key: string, factory: () => Promise<unknown>) => {
        if (store.has(key)) return store.get(key);
        const value = await factory();
        store.set(key, value);
        return value;
      }),
    };

    // `eventEmitter.emit` records what the outbox published after its transaction committed.
    eventEmitter = createMockOutbox(prisma);

    service = new FeatureFlagsService(prisma, cache, eventEmitter);
  });

  describe('getAllFlags', () => {
    it('should return all flags', async () => {
      const result = await service.getAllFlags();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('reports');
    });
  });

  describe('getFlagByKey', () => {
    it('should return a flag by key', async () => {
      const result = await service.getFlagByKey('reports');
      expect(result).not.toBeNull();
      expect(result.key).toBe('reports');
    });

    it('should return null when flag not found', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      const result = await service.getFlagByKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled flag', async () => {
      const result = await service.isEnabled('reports');
      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        ...mockFlag,
        enabled: false,
      });
      const result = await service.isEnabled('reports');
      expect(result).toBe(false);
    });

    it('should return false when flag not found', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      const result = await service.isEnabled('nonexistent');
      expect(result).toBe(false);
    });

    it('does not cache a missing flag, so a flag added later is seen on the next read', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      expect(await service.isEnabled('new_feature')).toBe(false);
      expect(cache.set).not.toHaveBeenCalled();
      expect(cache.store.size).toBe(0);

      // A seed or migration inserts the row; nothing invalidates the cache.
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: true });
      expect(await service.isEnabled('new_feature')).toBe(true);
    });

    it('caches a flag that exists, on or off, and answers the next read from the cache', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({ enabled: false });
      expect(await service.isEnabled('reports')).toBe(false);
      expect(await service.isEnabled('reports')).toBe(false);

      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith('app:flags:enabled:reports', false, expect.any(Number));
    });
  });

  describe('toggleFlag', () => {
    it('should toggle flag and emit event', async () => {
      const result = await service.toggleFlag('reports', false);
      expect(prisma.featureFlag.update).toHaveBeenCalledWith({
        where: { key: 'reports' },
        data: { enabled: false },
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'app.feature-flag.toggled',
        'global',
        expect.objectContaining({ key: 'reports', enabled: false }),
      );
      expect(result.key).toBe('reports');
    });

    it('should throw NotFoundException for P2025 error', async () => {
      prisma.featureFlag.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.toggleFlag('bad', true)).rejects.toThrow(NotFoundException);
      // Nothing committed, so nothing is published.
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('should re-throw non-P2025 errors', async () => {
      prisma.featureFlag.update.mockRejectedValue(new Error('DB error'));
      await expect(service.toggleFlag('reports', true)).rejects.toThrow('DB error');
    });
  });
});
