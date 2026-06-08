import { Controller, Get, Post, Param, Body, BadRequestException, Logger } from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { SallyCacheService } from '../../infrastructure/cache/sally-cache.service';
import { CACHE_NAMESPACES, CacheNamespace } from '../../constants/cache.constants';

@Controller('admin/cache')
@Roles(UserRole.SUPER_ADMIN)
export class AdminCacheController {
  private readonly logger = new Logger(AdminCacheController.name);

  constructor(private readonly cacheService: SallyCacheService) {}

  @Get('health')
  async getHealth() {
    const info = await this.cacheService.getRedisInfo();
    if (!info) {
      // Every cache op goes through one ioredis client; if INFO fails, the
      // client itself is unhealthy. There is no in-memory fallback anymore.
      return { status: 'unavailable', backend: 'redis', message: 'Redis client unreachable' };
    }

    return {
      status: 'connected',
      // `backend` is the single source of truth for what the cache is actually
      // backed by. Today it can only be 'redis' (boot fails otherwise) — the
      // field exists so the admin UI can surface this fact and so future
      // backends (e.g. an opt-in in-memory dev mode) can be reflected honestly.
      backend: 'redis',
      uptime: info['uptime_in_seconds'] ? `${info['uptime_in_seconds']}s` : 'unknown',
      memoryUsed: info['used_memory_human'] ?? 'unknown',
      memoryPeak: info['used_memory_peak_human'] ?? 'unknown',
      connectedClients: info['connected_clients'] ?? 'unknown',
      totalKeys: info['db0'] ?? 'none',
      redisVersion: info['redis_version'] ?? 'unknown',
    };
  }

  @Get('stats')
  async getStats() {
    const keyCounts: Record<string, number> = {};
    await Promise.all(
      CACHE_NAMESPACES.map(async (ns) => {
        keyCounts[ns] = await this.cacheService.countKeys(`${ns}:*`);
      }),
    );

    return {
      namespaces: CACHE_NAMESPACES,
      metrics: this.cacheService.getMetrics(),
      keyCounts,
    };
  }

  @Post('flush')
  async flushAll(@Body() body: { confirm?: boolean }) {
    if (!body?.confirm) {
      throw new BadRequestException('Body must include { "confirm": true } to flush all caches');
    }

    this.logger.warn('Flushing ALL sally:* cache keys');
    const deleted = await this.cacheService.flushAll();
    return { flushed: deleted, scope: 'all' };
  }

  @Post('flush/:namespace')
  async flushNamespace(@Param('namespace') namespace: string) {
    if (!CACHE_NAMESPACES.includes(namespace as CacheNamespace)) {
      throw new BadRequestException(`Invalid namespace "${namespace}". Valid: ${CACHE_NAMESPACES.join(', ')}`);
    }

    this.logger.warn(`Flushing cache namespace: ${namespace}`);
    const deleted = await this.cacheService.flushNamespace(namespace as CacheNamespace);
    return { flushed: deleted, scope: namespace };
  }
}
