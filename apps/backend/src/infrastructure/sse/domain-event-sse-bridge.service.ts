import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/domain-event';
import { DOMAIN_EVENTS } from '../events/sally-events.constants';
import { SseService } from './sse.service';
import { SSE_EVENTS, SseEventType } from './sse-events.constants';

/**
 * Bridges domain events (EventEmitter2) → SSE broadcasts.
 *
 * Routing config: each entry is either a shorthand SseEventType (tenant scope,
 * the default broadcast) or an explicit object with `scope: 'user'` for events
 * targeted at specific users. User-scoped events MUST include
 * `recipientUserIds: string[]` in their DomainEvent.data; the bridge fans out
 * one emitToUser call per id and strips the field from the SSE wire payload.
 *
 * Identifier contract for `recipientUserIds`: each entry must be a User.userId
 * (the string column from `users.user_id` — same value the SSE controller
 * stores in the client registry on connect). NEVER pass User.id (numeric) or
 * User.firebaseUid (Firebase Auth identifier).
 */
type SseRoute = SseEventType | { sseType: SseEventType; scope: 'tenant' } | { sseType: SseEventType; scope: 'user' };

const DOMAIN_TO_SSE: Record<string, SseRoute> = {
  // ── Tenant-scoped (default) ────────────────────────────────────────
  [DOMAIN_EVENTS.TENANT_UPDATED]: SSE_EVENTS.TENANT_UPDATED,
  [DOMAIN_EVENTS.USER_INVITED]: SSE_EVENTS.USER_INVITED,
  [DOMAIN_EVENTS.USER_JOINED]: SSE_EVENTS.USER_INVITED,

  // Integrations
  [DOMAIN_EVENTS.INTEGRATION_SYNCED]: SSE_EVENTS.INTEGRATION_SYNCED,
  [DOMAIN_EVENTS.SYNC_COMPLETED]: SSE_EVENTS.INTEGRATION_SYNCED,

  // AI
  [DOMAIN_EVENTS.AI_MESSAGE]: SSE_EVENTS.AI_MESSAGE,

  // Agent management — fan-in to a single SSE event
  [DOMAIN_EVENTS.API_KEY_ROTATED]: SSE_EVENTS.API_KEY_UPDATED,
  [DOMAIN_EVENTS.API_KEY_REVOKED]: SSE_EVENTS.API_KEY_UPDATED,
  [DOMAIN_EVENTS.API_KEY_SCOPES_UPDATED]: SSE_EVENTS.API_KEY_UPDATED,
  [DOMAIN_EVENTS.API_KEY_PAUSED]: SSE_EVENTS.API_KEY_UPDATED,
  [DOMAIN_EVENTS.API_KEY_RESUMED]: SSE_EVENTS.API_KEY_UPDATED,
  [DOMAIN_EVENTS.OAUTH_CLIENT_ROTATED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [DOMAIN_EVENTS.OAUTH_CLIENT_REVOKED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [DOMAIN_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [DOMAIN_EVENTS.OAUTH_CLIENT_PAUSED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [DOMAIN_EVENTS.OAUTH_CLIENT_RESUMED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,

  // Agent invocation completed (payload trimmed in shapeSsePayload below)
  [DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED]: SSE_EVENTS.AGENT_INVOCATION_COMPLETED,

  // ── User-scoped (explicit) ────────────────────────────────────────
  [DOMAIN_EVENTS.NOTIFICATION_SENT]: { sseType: SSE_EVENTS.NOTIFICATION_NEW, scope: 'user' },
};

/**
 * Strip bridge-internal routing fields and trim oversized payloads before
 * the SSE broadcast. `recipientUserIds` is always removed (bridge-only data).
 * `AGENT_INVOCATION_COMPLETED` is trimmed to a small status summary.
 */
function shapeSsePayload(domainEvent: string, data: unknown): Record<string, unknown> {
  const obj = (data ?? {}) as Record<string, unknown>;

  if (domainEvent === DOMAIN_EVENTS.AGENT_INVOCATION_COMPLETED) {
    return {
      rowId: obj.rowId ?? null,
      success: obj.success ?? null,
      durationMs: obj.durationMs ?? null,
    };
  }

  if ('recipientUserIds' in obj) {
    const { recipientUserIds: _stripped, ...rest } = obj;
    return rest;
  }

  return obj;
}

@Injectable()
export class DomainEventSseBridge {
  private readonly logger = new Logger(DomainEventSseBridge.name);

  constructor(private readonly sseService: SseService) {}

  @OnEvent('app.**', { async: true })
  handleDomainEvent(event: DomainEvent): void {
    const route = DOMAIN_TO_SSE[event.event];
    if (!route) return;

    const tenantId = typeof event.tenantId === 'string' ? parseInt(event.tenantId, 10) : event.tenantId;
    const tenantIdValid = !Number.isNaN(tenantId);

    // Normalize shorthand → tenant route.
    const config: { sseType: SseEventType; scope: 'tenant' | 'user' } =
      typeof route === 'string' ? { sseType: route, scope: 'tenant' } : route;

    const payload = shapeSsePayload(event.event, event.data);

    if (config.scope === 'tenant') {
      if (!tenantIdValid) {
        this.logger.error(`Invalid tenantId "${event.tenantId}" for tenant-scoped event ${event.event}`);
        return;
      }
      this.logger.debug(`Bridge: ${event.event} → ${config.sseType} (tenant: ${tenantId})`);
      this.sseService.emitToTenant(tenantId, config.sseType, payload);
      return;
    }

    // scope === 'user'
    const data = (event.data ?? {}) as { recipientUserIds?: unknown };
    const ids = data.recipientUserIds;
    if (!Array.isArray(ids) || ids.length === 0) {
      this.logger.error(
        `User-scoped event ${event.event} missing recipientUserIds — dropping. Producer must include recipientUserIds: User.userId[] in the DomainEvent payload.`,
      );
      return;
    }

    let delivered = 0;
    for (const userId of ids) {
      if (typeof userId !== 'string' || userId.length === 0) continue;
      this.sseService.emitToUser(userId, config.sseType, payload);
      delivered += 1;
    }
    this.logger.debug(
      `Bridge: ${event.event} → ${config.sseType} (user-scope, delivered to ${delivered}/${ids.length})`,
    );
  }
}
