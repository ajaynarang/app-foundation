import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/domain-event';
import { DOMAIN_EVENTS } from '../events/sally-events.constants';
import { AppCacheService } from './app-cache.service';
import { buildKey } from './cache-key.constants';

@Injectable()
export class CacheInvalidationSubscriber {
  private readonly logger = new Logger(CacheInvalidationSubscriber.name);

  // Throttle map for high-frequency events.
  private readonly lastInvalidation = new Map<string, number>();
  private static readonly THROTTLE_MS = 10_000; // 10 seconds

  constructor(private readonly cache: AppCacheService) {}

  @OnEvent('app.**', { async: true })
  async handleDomainEvent(event: DomainEvent): Promise<void> {
    const { keys, prefixes } = this.getInvalidationsForEvent(event);
    if (keys.length === 0 && prefixes.length === 0) return;

    this.logger.debug(
      `Cache invalidation: event=${event.event} tenant=${event.tenantId} keys=${keys.length} prefixes=${prefixes.length}`,
    );

    await Promise.allSettled([
      ...keys.map((k) => this.cache.del(k)),
      ...prefixes.map((p) => this.cache.delByPrefix(p)),
    ]);
  }

  /**
   * Maps a domain event to the cache entries it invalidates.
   *
   * Generic starter mapping — covers the platform events the template ships
   * with. Add a case here when a new event should bust a server-side cache
   * family. Keys that carry variable trailing segments go in `prefixes` and
   * are flushed via SCAN; everything else is an exact-key `del()`.
   */
  private getInvalidationsForEvent(event: DomainEvent): { keys: string[]; prefixes: string[] } {
    const tenantId = event.tenantId;
    const data = event.data as Record<string, any>;
    const keys: string[] = [];
    const prefixes: string[] = [];

    switch (event.event) {
      case DOMAIN_EVENTS.FEATURE_FLAG_TOGGLED:
        if (data?.key) {
          keys.push(buildKey('app:flags', 'enabled', data.key));
        }
        keys.push(buildKey('app:flags', 'all'));
        break;

      case DOMAIN_EVENTS.TENANT_UPDATED:
        keys.push(buildKey('app:tenants', 'detail', tenantId), buildKey('app:settings', 'tenant', tenantId));
        break;

      case DOMAIN_EVENTS.USER_PREFERENCES_UPDATED:
        if (data?.userId) {
          keys.push(buildKey('app:prefs', 'user', tenantId, String(data.userId)));
        }
        break;

      case DOMAIN_EVENTS.SYNC_COMPLETED:
      case DOMAIN_EVENTS.INTEGRATION_SYNCED:
        prefixes.push(`app:integrations:${tenantId}:`);
        break;

      // ─── API key management ──────────────────────────────────────
      case DOMAIN_EVENTS.API_KEY_ROTATED:
      case DOMAIN_EVENTS.API_KEY_REVOKED:
      case DOMAIN_EVENTS.API_KEY_SCOPES_UPDATED:
      case DOMAIN_EVENTS.API_KEY_PAUSED:
      case DOMAIN_EVENTS.API_KEY_RESUMED:
        keys.push(buildKey('app:api-keys', 'list', tenantId));
        break;

      // ─── OAuth client management ─────────────────────────────────
      case DOMAIN_EVENTS.OAUTH_CLIENT_ROTATED:
      case DOMAIN_EVENTS.OAUTH_CLIENT_REVOKED:
      case DOMAIN_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED:
      case DOMAIN_EVENTS.OAUTH_CLIENT_PAUSED:
      case DOMAIN_EVENTS.OAUTH_CLIENT_RESUMED:
        keys.push(buildKey('app:oauth-clients', 'list', tenantId));
        break;

      // ─── Desk (optional workflow engine) ─────────────────────────
      case DOMAIN_EVENTS.DESK_EPISODE_CHANGED:
        prefixes.push(
          `app:desk:episodes:${tenantId}:`,
          `app:desk:handled:${tenantId}:`,
          `app:desk:handoff-counts:${tenantId}:`,
        );
        break;
    }

    return { keys, prefixes };
  }
}
