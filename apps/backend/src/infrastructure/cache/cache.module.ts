import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SallyCacheService } from './sally-cache.service';
import { RedisClientProvider, REDIS_CLIENT } from './redis-client.provider';
import { CacheInvalidationSubscriber } from './cache-invalidation.subscriber';
import { EventBusModule } from '../events/event-bus.module';

/**
 * Cache infrastructure module.
 */
@Module({
  imports: [ConfigModule, EventBusModule],
  providers: [RedisClientProvider, SallyCacheService, CacheInvalidationSubscriber],
  exports: [SallyCacheService, REDIS_CLIENT],
})
export class CacheModule {}
