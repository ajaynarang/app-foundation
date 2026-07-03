import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../../infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '@appshore/kernel/constants/cache.constants';
import { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import { FeatureFlagDto } from './dto/feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
    private events: DomainEventService,
  ) {}

  /**
   * Get all feature flags
   */
  async getAllFlags(): Promise<FeatureFlagDto[]> {
    return this.cache.getOrSet<FeatureFlagDto[]>(
      buildKey('app:flags', 'all'),
      async () => {
        const flags = await this.prisma.featureFlag.findMany({
          orderBy: { category: 'asc' },
        });

        return flags.map((flag) => ({
          key: flag.key,
          name: flag.name,
          description: flag.description || undefined,
          enabled: flag.enabled,
          category: flag.category,
        }));
      },
      CACHE_TTL_COLD_30M,
    );
  }

  /**
   * Get specific flag by key
   */
  async getFlagByKey(key: string): Promise<FeatureFlagDto | null> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
    });

    if (!flag) return null;

    return {
      key: flag.key,
      name: flag.name,
      description: flag.description || undefined,
      enabled: flag.enabled,
      category: flag.category,
    };
  }

  /**
   * Check if a feature is enabled
   */
  async isEnabled(key: string): Promise<boolean> {
    return this.cache.getOrSet<boolean>(
      buildKey('app:flags', 'enabled', key),
      async () => {
        const flag = await this.prisma.featureFlag.findUnique({
          where: { key },
          select: { enabled: true },
        });

        return flag?.enabled ?? false;
      },
      CACHE_TTL_COLD_30M,
    );
  }

  /**
   * Toggle feature flag (for admin use)
   */
  async toggleFlag(key: string, enabled: boolean): Promise<FeatureFlagDto> {
    let flag;
    try {
      flag = await this.prisma.featureFlag.update({
        where: { key },
        data: { enabled },
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        throw new NotFoundException(`Feature flag '${key}' not found`);
      }
      throw err;
    }

    this.logger.log(`Feature flag '${key}' ${enabled ? 'enabled' : 'disabled'}`);

    // Cache invalidation handled by CacheInvalidationSubscriber via event
    await this.events.emit(DOMAIN_EVENTS.FEATURE_FLAG_TOGGLED, 'global', {
      entityId: key,
      entityType: 'feature-flag',
      key,
      enabled,
    });

    return {
      key: flag.key,
      name: flag.name,
      description: flag.description || undefined,
      enabled: flag.enabled,
      category: flag.category,
    };
  }
}
