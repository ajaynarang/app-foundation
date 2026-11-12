import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { AppCacheService } from '../../infrastructure/cache/app-cache.service';
import { buildKey } from '@appshore/kernel/infrastructure/cache/cache-key.constants';
import { CACHE_TTL_COLD_30M } from '@appshore/kernel/constants/cache.constants';
import { OutboxService } from '../../infrastructure/events/outbox.service';
import { FOUNDATION_DOMAIN_EVENTS as DOMAIN_EVENTS } from '@appshore/kernel/infrastructure/events/foundation-events';
import { FeatureFlagDto } from './dto/feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);

  constructor(
    private prisma: PrismaService,
    private cache: AppCacheService,
    // Events commit with the write (ADR "Outbox and deadlines").
    private outbox: OutboxService,
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
   * Check if a feature is enabled. A flag that does not exist reads as off.
   */
  async isEnabled(key: string): Promise<boolean> {
    const cacheKey = buildKey('app:flags', 'enabled', key);
    const cached = await this.cache.get<boolean>(cacheKey);
    if (typeof cached === 'boolean') return cached;

    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });

    // A missing flag is answered "off" but never cached. Seeds and migrations
    // add flags without touching the cache, so a cached "off" would hide a
    // newly added feature from everyone for the full TTL, and nothing would
    // invalidate it: no toggle event fires when a row is inserted.
    if (!flag) return false;

    await this.cache.set(cacheKey, flag.enabled, CACHE_TTL_COLD_30M);
    return flag.enabled;
  }

  /**
   * Toggle feature flag (for admin use)
   */
  async toggleFlag(key: string, enabled: boolean): Promise<FeatureFlagDto> {
    let flag;
    try {
      // Cache invalidation is handled by CacheInvalidationSubscriber via the event, which commits with the
      // toggle and is published right after it.
      flag = await this.outbox.transaction(async (tx, emit) => {
        const row = await tx.featureFlag.update({
          where: { key },
          data: { enabled },
        });
        await emit(DOMAIN_EVENTS.FEATURE_FLAG_TOGGLED, 'global', {
          entityId: key,
          entityType: 'feature-flag',
          key,
          enabled,
        });
        return row;
      });
    } catch (err: any) {
      if (err?.code === 'P2025') {
        throw new NotFoundException(`Feature flag '${key}' not found`);
      }
      throw err;
    }

    this.logger.log(`Feature flag '${key}' ${enabled ? 'enabled' : 'disabled'}`);

    return {
      key: flag.key,
      name: flag.name,
      description: flag.description || undefined,
      enabled: flag.enabled,
      category: flag.category,
    };
  }
}
