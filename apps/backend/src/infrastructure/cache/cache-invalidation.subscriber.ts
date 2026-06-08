import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/domain-event';
import { SALLY_EVENTS } from '../events/sally-events.constants';
import { SallyCacheService } from './sally-cache.service';
import { buildKey } from './cache-key.constants';
import { TOWER_CACHE_NAMESPACE } from '../../constants/cache.constants';

@Injectable()
export class CacheInvalidationSubscriber {
  private readonly logger = new Logger(CacheInvalidationSubscriber.name);

  // Throttle map for high-frequency events (TELEMATICS_UPDATED)
  private readonly lastInvalidation = new Map<string, number>();
  private static readonly THROTTLE_MS = 10_000; // 10 seconds

  constructor(private readonly cache: SallyCacheService) {}

  @OnEvent('sally.**', { async: true })
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
   * Cache families keyed with variable trailing segments (lookahead hours,
   * filter kinds, time buckets) can't be invalidated by exact key — see the
   * Tower `active-loads`/`wire` keys. Those go in `prefixes` and are flushed
   * via SCAN; everything else stays an exact-key `del()`.
   */
  private getInvalidationsForEvent(event: DomainEvent): { keys: string[]; prefixes: string[] } {
    const tenantId = event.tenantId;
    const data = event.data as Record<string, any>;
    const keys: string[] = [];
    const prefixes: string[] = [];
    // Tower v3 — `active-loads` keys carry the lookahead-hours segment and
    // `wire` keys carry kinds + time-bucket + limit; both vary per request.
    // Flush by tenant prefix so every variant is invalidated. The trailing
    // `:` keeps the match tenant-scoped (tenant 1 won't match tenant 12).
    const towerActiveLoadsPrefix = `${TOWER_CACHE_NAMESPACE}:active-loads:${tenantId}:`;
    const towerWirePrefix = `${TOWER_CACHE_NAMESPACE}:wire:${tenantId}:`;

    switch (event.event) {
      case SALLY_EVENTS.LOAD_CREATED:
        keys.push(
          buildKey('sally:cmdcenter', 'overview', tenantId),
          buildKey('sally:dispatch', 'board', tenantId),
          buildKey('sally:analytics', 'kpi', tenantId),
          buildKey('sally:closeout', 'summary', tenantId),
          buildKey('sally:loads', 'counts', tenantId),
        );
        prefixes.push(towerActiveLoadsPrefix, towerWirePrefix);
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.LOAD_UPDATED:
        keys.push(
          buildKey('sally:cmdcenter', 'overview', tenantId),
          buildKey('sally:profitability', 'tenant', tenantId),
        );
        prefixes.push(towerActiveLoadsPrefix);
        if (data?.loadNumber) {
          keys.push(
            buildKey('sally:profitability', 'load', tenantId, data.loadNumber),
            buildKey('sally:loads', 'detail', tenantId, data.loadNumber),
          );
        }
        break;

      case SALLY_EVENTS.LOAD_ASSIGNED:
      case SALLY_EVENTS.LOAD_LEG_ASSIGNED:
        keys.push(buildKey('sally:cmdcenter', 'overview', tenantId), buildKey('sally:dispatch', 'board', tenantId));
        prefixes.push(towerActiveLoadsPrefix, towerWirePrefix);
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.LOAD_STATUS_CHANGED:
      case SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED:
        keys.push(
          buildKey('sally:cmdcenter', 'overview', tenantId),
          buildKey('sally:cmdcenter', 'map', tenantId),
          buildKey('sally:dispatch', 'board', tenantId),
          buildKey('sally:analytics', 'kpi', tenantId),
          buildKey('sally:closeout', 'summary', tenantId),
          buildKey('sally:profitability', 'tenant', tenantId),
          buildKey('sally:loads', 'counts', tenantId),
          buildKey('sally:alerts', 'analytics-volume-category', tenantId),
          buildKey('sally:alerts', 'analytics-volume-priority', tenantId),
          buildKey('sally:alerts', 'analytics-response-trend', tenantId),
          buildKey('sally:alerts', 'analytics-top-types', tenantId),
        );
        prefixes.push(towerActiveLoadsPrefix, towerWirePrefix);
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED:
        keys.push(buildKey('sally:cmdcenter', 'overview', tenantId), buildKey('sally:closeout', 'summary', tenantId));
        prefixes.push(towerActiveLoadsPrefix, towerWirePrefix);
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED:
        keys.push(
          buildKey('sally:analytics', 'kpi', tenantId),
          buildKey('sally:closeout', 'summary', tenantId),
          buildKey('sally:invoicing', 'summary', tenantId),
        );
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.LOAD_DELETED:
        keys.push(
          buildKey('sally:cmdcenter', 'overview', tenantId),
          buildKey('sally:dispatch', 'board', tenantId),
          buildKey('sally:analytics', 'kpi', tenantId),
        );
        if (data?.loadNumber) {
          keys.push(buildKey('sally:loads', 'detail', tenantId, data.loadNumber));
        }
        break;

      case SALLY_EVENTS.ALERT_FIRED:
        keys.push(
          buildKey('sally:alerts', 'stats', tenantId),
          buildKey('sally:alerts', 'smart-stats', tenantId),
          buildKey('sally:cmdcenter', 'overview', tenantId),
          buildKey('sally:alerts', 'analytics-volume-category', tenantId),
          buildKey('sally:alerts', 'analytics-volume-priority', tenantId),
          buildKey('sally:alerts', 'analytics-response-trend', tenantId),
          buildKey('sally:alerts', 'analytics-top-types', tenantId),
        );
        break;

      case SALLY_EVENTS.ALERT_RESOLVED:
        keys.push(
          buildKey('sally:alerts', 'stats', tenantId),
          buildKey('sally:alerts', 'smart-stats', tenantId),
          buildKey('sally:alerts', 'analytics-volume-category', tenantId),
          buildKey('sally:alerts', 'analytics-volume-priority', tenantId),
          buildKey('sally:alerts', 'analytics-response-trend', tenantId),
          buildKey('sally:alerts', 'analytics-top-types', tenantId),
        );
        break;

      case SALLY_EVENTS.ALERT_ESCALATED:
        keys.push(buildKey('sally:alerts', 'stats', tenantId));
        break;

      case SALLY_EVENTS.TELEMATICS_UPDATED: {
        // Throttle: max 1 invalidation per 10s per tenant
        const throttleKey = `telematics:${tenantId}`;
        const now = Date.now();
        const last = this.lastInvalidation.get(throttleKey) ?? 0;
        if (now - last < CacheInvalidationSubscriber.THROTTLE_MS) break;
        this.lastInvalidation.set(throttleKey, now);
        keys.push(buildKey('sally:cmdcenter', 'map', tenantId));
        break;
      }

      case SALLY_EVENTS.SYNC_COMPLETED:
        keys.push(buildKey('sally:dispatch', 'board', tenantId), buildKey('sally:cmdcenter', 'overview', tenantId));
        break;

      case SALLY_EVENTS.INVOICE_SENT:
        keys.push(
          buildKey('sally:analytics', 'kpi', tenantId),
          buildKey('sally:invoicing', 'summary', tenantId),
          buildKey('sally:closeout', 'summary', tenantId),
          buildKey('sally:analytics', 'profitability-trend', tenantId),
        );
        break;

      // Phase 4 — every factoring money event busts the invoice detail cache,
      // the AR summary, the per-invoice transaction list, and the dashboard
      // summary (4C consumer; safe to register the key now).
      case SALLY_EVENTS.FACTORING_ADVANCE_RECORDED:
      case SALLY_EVENTS.FACTORING_FEE_RECORDED:
      case SALLY_EVENTS.FACTORING_RESERVE_RELEASED:
      case SALLY_EVENTS.FACTORING_CHARGEBACK_RECEIVED:
      case SALLY_EVENTS.FACTORING_CHARGEBACK_REVERSED:
      case SALLY_EVENTS.FACTORING_TRANSACTION_DELETED:
        if (data?.invoiceNumber) {
          keys.push(
            buildKey('sally:invoicing', 'detail', tenantId, data.invoiceNumber),
            buildKey('sally:factoring', 'transactions', tenantId, data.invoiceNumber),
          );
        }
        keys.push(
          buildKey('sally:invoicing', 'summary', tenantId),
          buildKey('sally:factoring', 'summary', tenantId),
          buildKey('sally:analytics', 'kpi', tenantId),
        );
        break;

      case SALLY_EVENTS.ROUTE_PLANNED:
        keys.push(buildKey('sally:cmdcenter', 'overview', tenantId));
        break;

      case SALLY_EVENTS.MESSAGE_NEW:
        keys.push(buildKey('sally:cmdcenter', 'messages', tenantId));
        break;

      case SALLY_EVENTS.FEATURE_FLAG_TOGGLED:
        if (data?.key) {
          keys.push(buildKey('sally:flags', 'enabled', data.key));
        }
        keys.push(buildKey('sally:flags', 'all'));
        break;

      case SALLY_EVENTS.SHIELD_AUDIT_COMPLETE:
        keys.push(buildKey('sally:shield', 'results', tenantId), buildKey('sally:shield', 'score', tenantId));
        break;

      case SALLY_EVENTS.ACCOUNTING_COMPLETED:
        keys.push(buildKey('sally:invoicing', 'summary', tenantId));
        break;

      case SALLY_EVENTS.TRIP_CREATED:
      case SALLY_EVENTS.TRIP_ASSIGNED:
      case SALLY_EVENTS.TRIP_CANCELLED:
      case SALLY_EVENTS.TRIP_LOAD_ADDED:
      case SALLY_EVENTS.TRIP_LOAD_REMOVED:
        keys.push(buildKey('sally:cmdcenter', 'overview', tenantId), buildKey('sally:dispatch', 'board', tenantId));
        break;

      case SALLY_EVENTS.TRIP_STARTED:
      case SALLY_EVENTS.TRIP_COMPLETED:
        keys.push(buildKey('sally:cmdcenter', 'overview', tenantId));
        break;

      case SALLY_EVENTS.VEHICLE_MAINTENANCE_SCHEDULED:
        // No prior vehicle-domain precedent for cache keys; use conservative
        // list + detail prefix per the Desk PR-2 review. If other vehicle
        // events start caching, align prefixes then.
        keys.push(buildKey('sally:vehicle', 'list', tenantId));
        if (data?.entityId) {
          keys.push(buildKey('sally:vehicle', 'detail', tenantId, String(data.entityId)));
        }
        break;

      case SALLY_EVENTS.DESK_REVIEW_ITEM_CREATED:
      case SALLY_EVENTS.DESK_REVIEW_ITEM_RESOLVED:
        // Findings-only responsibilities feed the Review Inbox panel. One
        // list key covers the desk/review-items list; detail views read
        // live so they don't need their own key. Frontend SSE invalidation
        // widens the same prefix — see sse-invalidation-map.ts.
        keys.push(buildKey('sally:desk', 'review-items', 'list', tenantId));
        break;

      case SALLY_EVENTS.DESK_EPISODE_CHANGED:
        // An episode opened, closed, or was resolved. Flush any server-side
        // desk episode-list / handled / handoff-count caches by tenant prefix
        // so a stale list never outlives the change. The live refresh on the
        // client is driven by the SSE bridge → FE query invalidation; these
        // prefixes are the server-cache safety net (and forward-proof if the
        // list endpoints start caching). Trailing `:` keeps it tenant-scoped.
        prefixes.push(
          `sally:desk:episodes:${tenantId}:`,
          `sally:desk:handled:${tenantId}:`,
          `sally:desk:handoff-counts:${tenantId}:`,
        );
        break;

      // ─── Phase D: API key management ─────────────────────────────
      case SALLY_EVENTS.API_KEY_ROTATED:
      case SALLY_EVENTS.API_KEY_REVOKED:
      case SALLY_EVENTS.API_KEY_SCOPES_UPDATED:
      case SALLY_EVENTS.API_KEY_PAUSED:
      case SALLY_EVENTS.API_KEY_RESUMED:
        keys.push(buildKey('sally:api-keys', 'list', tenantId));
        break;

      // ─── Phase D: OAuth client management ────────────────────────
      case SALLY_EVENTS.OAUTH_CLIENT_ROTATED:
      case SALLY_EVENTS.OAUTH_CLIENT_REVOKED:
      case SALLY_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED:
      case SALLY_EVENTS.OAUTH_CLIENT_PAUSED:
      case SALLY_EVENTS.OAUTH_CLIENT_RESUMED:
        keys.push(buildKey('sally:oauth-clients', 'list', tenantId));
        break;
    }

    return { keys, prefixes };
  }
}
