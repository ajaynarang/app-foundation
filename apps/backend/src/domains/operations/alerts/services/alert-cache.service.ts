import { Injectable, Logger } from '@nestjs/common';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';

@Injectable()
export class AlertCacheService {
  private readonly logger = new Logger(AlertCacheService.name);

  constructor(private readonly cache: SallyCacheService) {}

  async get<T>(key: string): Promise<T | null> {
    const value = await this.cache.get<T>(key);
    return value ?? null;
  }

  async set<T>(key: string, data: T, ttlSeconds: number): Promise<void> {
    await this.cache.set(key, data, ttlSeconds * 1000);
  }

  async invalidate(key: string): Promise<void> {
    await this.cache.del(key);
  }

  async bustStatsCache(tenantId: number): Promise<void> {
    try {
      await Promise.all([
        this.invalidate(buildKey('sally:alerts', 'stats', tenantId)),
        this.invalidate(buildKey('sally:alerts', 'smart-stats', tenantId)),
      ]);
    } catch {
      /* best-effort */
    }
  }
}
