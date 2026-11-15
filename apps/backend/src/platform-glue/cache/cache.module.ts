import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { RedisClientProvider, REDIS_CLIENT } from '@appshore/platform/infrastructure/cache/redis-client.provider';
import { IdempotencyStore } from '@appshore/platform/infrastructure/idempotency/idempotency.store';
import { CacheInvalidationSubscriber } from './cache-invalidation.subscriber';

/**
 * Cache infrastructure module (@Global). Note: no explicit EventBusModule /
 * QueueModule imports here — the glue modules are all @Global and importing
 * one another creates a require-time cycle that breaks Nest bootstrap.
 */
@Global()
@Module({
  imports: [ConfigModule],
  // IdempotencyStore: Idempotency-Key records live in this Redis with a 24-hour TTL.
  providers: [RedisClientProvider, AppCacheService, CacheInvalidationSubscriber, IdempotencyStore],
  exports: [AppCacheService, REDIS_CLIENT, IdempotencyStore],
})
export class CacheModule {}
