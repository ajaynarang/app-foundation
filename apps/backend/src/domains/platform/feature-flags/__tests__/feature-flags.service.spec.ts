import { NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../../infrastructure/cache/app-cache.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;
  let prisma: any;
  let cache: any;
  let eventEmitter: any;

  const mockFlag = {
    key: 'shield',
    name: 'Shield Compliance',
    description: 'Enable Shield',
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
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
    };

    eventEmitter = {
      emit: jest.fn().mockResolvedValue(undefined),
    };

    service = new FeatureFlagsService(
      prisma as unknown as PrismaService,
      cache as unknown as AppCacheService,
      eventEmitter as unknown as DomainEventService,
    );
  });

  describe('getAllFlags', () => {
    it('should return all flags', async () => {
      const result = await service.getAllFlags();
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('shield');
    });
  });

  describe('getFlagByKey', () => {
    it('should return a flag by key', async () => {
      const result = await service.getFlagByKey('shield');
      expect(result).not.toBeNull();
      expect(result.key).toBe('shield');
    });

    it('should return null when flag not found', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      const result = await service.getFlagByKey('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled flag', async () => {
      const result = await service.isEnabled('shield');
      expect(result).toBe(true);
    });

    it('should return false for disabled flag', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue({
        ...mockFlag,
        enabled: false,
      });
      const result = await service.isEnabled('shield');
      expect(result).toBe(false);
    });

    it('should return false when flag not found', async () => {
      prisma.featureFlag.findUnique.mockResolvedValue(null);
      const result = await service.isEnabled('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('toggleFlag', () => {
    it('should toggle flag and emit event', async () => {
      const result = await service.toggleFlag('shield', false);
      expect(prisma.featureFlag.update).toHaveBeenCalledWith({
        where: { key: 'shield' },
        data: { enabled: false },
      });
      expect(eventEmitter.emit).toHaveBeenCalled();
      expect(result.key).toBe('shield');
    });

    it('should throw NotFoundException for P2025 error', async () => {
      prisma.featureFlag.update.mockRejectedValue({ code: 'P2025' });
      await expect(service.toggleFlag('bad', true)).rejects.toThrow(NotFoundException);
    });

    it('should re-throw non-P2025 errors', async () => {
      prisma.featureFlag.update.mockRejectedValue(new Error('DB error'));
      await expect(service.toggleFlag('shield', true)).rejects.toThrow('DB error');
    });
  });
});
