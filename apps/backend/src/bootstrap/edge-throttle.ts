import type { ConfigService } from '@nestjs/config';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { AppCacheService } from '@appshore/platform/infrastructure/cache/app-cache.service';
import { RedisThrottlerStorage } from '@appshore/platform/infrastructure/cache/redis-throttler.storage';
import { IS_PUBLIC_KEY } from '@appshore/platform/auth/decorators/public.decorator';
import { ThrottleTracker } from '@appshore/platform/auth/throttle/throttle-tracker';
import { OAuthTokenGuard } from '@appshore/platform/domains/oauth-provider/oauth-token.guard';

type RouteTarget = Parameters<typeof Reflect.getMetadata>[1];

const isPublicRoute = (target: RouteTarget): boolean => Reflect.getMetadata(IS_PUBLIC_KEY, target) === true;

/** True when `@UseGuards(OAuthTokenGuard, ...)` sits on the handler or its controller. */
const hasOAuthGuard = (target: RouteTarget): boolean =>
  ((Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ?? []).includes(OAuthTokenGuard);

/**
 * Options for the global ThrottlerGuard: the limit comes from config (THROTTLE_LIMIT / THROTTLE_TTL_MS), the count
 * lives in Redis so every replica shares one window, and a request is counted against its verified principal
 * (signed-in user, OAuth client + user) or otherwise its client IP. A @Public() route is counted by client IP
 * whatever bearer is attached, except a @Public() route that OAuthTokenGuard protects (the MCP endpoint): there a
 * verified OAuth access token is counted per client + user, read from the route's own @UseGuards so no extra
 * marker can be forgotten. Per-route @Throttle overrides still apply.
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
    getTracker: (req, context) => {
      const targets = context ? [context.getHandler(), context.getClass()] : [];
      return tracker.resolve(req as Parameters<ThrottleTracker['resolve']>[0], {
        isPublic: targets.some(isPublicRoute),
        oauthGuarded: targets.some(hasOAuthGuard),
      });
    },
  };
}
