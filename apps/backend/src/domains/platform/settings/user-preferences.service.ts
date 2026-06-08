import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_10M } from '../../../constants/cache.constants';
import { UpdateUserPreferencesDto } from './dto/user-preferences.dto';

@Injectable()
export class UserPreferencesService {
  private readonly logger = new Logger(UserPreferencesService.name);

  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
  ) {}

  private async getUserDbId(userId: string): Promise<number> {
    const user = await this.prisma.user.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user.id;
  }

  /**
   * Get user preferences (creates defaults if not exist)
   */
  async getUserPreferences(userId: string) {
    const cacheKey = buildKey('sally:prefs', 'user', userId);
    return this.cache.getOrSet(
      cacheKey,
      async () => {
        const dbId = await this.getUserDbId(userId);

        const prefs = await this.prisma.userPreferences.upsert({
          where: { userId: dbId },
          update: {},
          create: { userId: dbId },
        });

        return prefs;
      },
      CACHE_TTL_COLD_10M,
    );
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(userId: string, updates: UpdateUserPreferencesDto) {
    const dbId = await this.getUserDbId(userId);

    const prefs = await this.prisma.userPreferences.upsert({
      where: { userId: dbId },
      create: { userId: dbId, ...updates },
      update: updates,
    });

    await this.cache.del(buildKey('sally:prefs', 'user', userId));
    return prefs;
  }

  /**
   * Reset user preferences to defaults
   */
  async resetToDefaults(userId: string, scope: 'user') {
    const dbId = await this.getUserDbId(userId);

    if (scope === 'user') {
      await this.prisma.userPreferences
        .delete({
          where: { userId: dbId },
        })
        .catch(() => {});
      const prefs = await this.prisma.userPreferences.create({
        data: { userId: dbId },
      });
      await this.cache.del(buildKey('sally:prefs', 'user', userId));
      return prefs;
    }

    throw new BadRequestException('Invalid scope');
  }
}
