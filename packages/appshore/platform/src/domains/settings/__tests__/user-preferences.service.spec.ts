import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserPreferencesService } from '../user-preferences.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';

describe('UserPreferencesService', () => {
  let service: UserPreferencesService;
  let prisma: any;
  let cache: any;

  const mockPrefs = {
    id: 1,
    userId: 10,
    theme: 'dark',
    timezone: 'America/Chicago',
  };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 10 }),
      },
      userPreferences: {
        upsert: jest.fn().mockResolvedValue(mockPrefs),
        delete: jest.fn().mockResolvedValue(undefined),
        create: jest.fn().mockResolvedValue(mockPrefs),
      },
    };

    cache = {
      getOrSet: jest.fn().mockImplementation((_key: string, factory: () => any) => factory()),
      del: jest.fn().mockResolvedValue(undefined),
    };

    service = new UserPreferencesService(prisma, cache);
  });

  describe('getUserPreferences', () => {
    it('should return user preferences with cache', async () => {
      const result = await service.getUserPreferences('user_abc');
      expect(result).toEqual(mockPrefs);
      expect(prisma.userPreferences.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.getUserPreferences('bad_user')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateUserPreferences', () => {
    it('should update preferences and invalidate cache', async () => {
      const result = await service.updateUserPreferences('user_abc', {
        theme: 'light',
      } as any);
      expect(result).toEqual(mockPrefs);
      expect(prisma.userPreferences.upsert).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
    });
  });

  describe('resetToDefaults', () => {
    it('should reset user preferences', async () => {
      const result = await service.resetToDefaults('user_abc', 'user');
      expect(prisma.userPreferences.delete).toHaveBeenCalled();
      expect(prisma.userPreferences.create).toHaveBeenCalled();
      expect(cache.del).toHaveBeenCalled();
      expect(result).toEqual(mockPrefs);
    });

    it('should throw BadRequestException for invalid scope', async () => {
      await expect(service.resetToDefaults('user_abc', 'invalid' as any)).rejects.toThrow(BadRequestException);
    });

    it('should still reset even if delete fails (no existing prefs)', async () => {
      prisma.userPreferences.delete.mockRejectedValue(new Error('Not found'));
      const result = await service.resetToDefaults('user_abc', 'user');
      expect(result).toEqual(mockPrefs);
    });
  });
});
