import type { ConfigService } from '@nestjs/config';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { RedisThrottlerStorage } from '@appshore/platform/infrastructure/cache/redis-throttler.storage';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { ThrottleTracker } from '@appshore/platform/auth/throttle/throttle-tracker';

/**
 * Options for the global ThrottlerGuard: the limit comes from config (THROTTLE_LIMIT / THROTTLE_TTL_MS), the count
 * lives in Redis so every replica shares one window, and a request is counted against its verified principal
 * (signed-in user, OAuth client + user) or otherwise its client IP. A @Public() route is counted by client IP
 * whatever bearer is attached. Per-route @Throttle overrides still apply.
 */
export function edgeThrottlerOptions(config: ConfigService, cache: AppCacheService): ThrottlerModuleOptions {
  const tracker = new ThrottleTracker((key) => config.get<string>(key));
  return {
    throttlers: [
      {
        ttl: config.getOrThrow<number>('edge.throttleTtlMs'),
        limit: config.getOrThrow<number>('edge.throttleLimit'),
      },
    ],
    storage: new RedisThrottlerStorage(cache),
    getTracker: (req, context) =>
      tracker.resolve(req as Parameters<ThrottleTracker['resolve']>[0], {
        isPublic:
          !!context &&
          (Reflect.getMetadata(IS_PUBLIC_KEY, context.getHandler()) ??
            Reflect.getMetadata(IS_PUBLIC_KEY, context.getClass())) === true,
      }),
  };
}
