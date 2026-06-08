import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEvent } from '../events/domain-event';
import { SALLY_EVENTS } from '../events/sally-events.constants';
import { SseService } from './sse.service';
import { SSE_EVENTS, SseEventType } from './sse-events.constants';

/**
 * Domain events that ALSO fan out to TOWER_LOAD_CHANGED. The bridge emits
 * the primary mapping (e.g. LOAD_STATUS_CHANGED → load:status-changed),
 * then a second SSE for any tower-aware client. Detailed wire-item fan-out
 * (TOWER_WIRE_ITEM_ADDED) is handled by `TowerSseSubscriber` in the
 * command-center domain since it needs WireItem formatting.
 */
const TOWER_LOAD_FANOUT = new Set<string>([
  SALLY_EVENTS.LOAD_ASSIGNED,
  SALLY_EVENTS.LOAD_STATUS_CHANGED,
  SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED,
  SALLY_EVENTS.LOAD_LEG_ASSIGNED,
  SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED,
  SALLY_EVENTS.LOAD_CHARGE_ADDED,
  SALLY_EVENTS.LOAD_STATUS_REVERSED,
  SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED,
  SALLY_EVENTS.DOCUMENT_UPLOADED,
]);

/**
 * Bridges domain events (EventEmitter2) → SSE broadcasts.
 *
 * Routing config: each entry is either a shorthand SseEventType (tenant scope,
 * the default for the ~70 broadcast events) or an explicit object with
 * `scope: 'user'` for events targeted at specific users. User-scoped events
 * MUST include `recipientUserIds: string[]` in their DomainEvent.data; the
 * bridge fans out one emitToUser call per id and strips the field from the
 * SSE wire payload.
 *
 * Identifier contract for `recipientUserIds`: each entry must be a User.userId
 * (the string column from `users.user_id` — same value the SSE controller
 * stores in the client registry on connect). NEVER pass User.id (numeric) or
 * User.firebaseUid (Firebase Auth identifier).
 */
type SseRoute = SseEventType | { sseType: SseEventType; scope: 'tenant' } | { sseType: SseEventType; scope: 'user' };

const DOMAIN_TO_SSE: Record<string, SseRoute> = {
  // ── Tenant-scoped (default) ────────────────────────────────────────
  // Load lifecycle
  [SALLY_EVENTS.LOAD_CREATED]: SSE_EVENTS.LOAD_CREATED,
  [SALLY_EVENTS.LOAD_UPDATED]: SSE_EVENTS.LOAD_UPDATED,
  [SALLY_EVENTS.LOAD_DELETED]: SSE_EVENTS.LOAD_DELETED,
  [SALLY_EVENTS.LOAD_ASSIGNED]: SSE_EVENTS.LOAD_ASSIGNED,
  [SALLY_EVENTS.LOAD_STATUS_CHANGED]: SSE_EVENTS.LOAD_STATUS_CHANGED,
  [SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED]: SSE_EVENTS.LOAD_BILLING_STATUS_CHANGED,
  [SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED]: SSE_EVENTS.LOAD_STOP_STATUS_CHANGED,
  [SALLY_EVENTS.LOAD_LEG_ASSIGNED]: SSE_EVENTS.LOAD_LEG_ASSIGNED,
  [SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED]: SSE_EVENTS.LOAD_LEG_STATUS_CHANGED,
  [SALLY_EVENTS.LOAD_EXCHANGE_REMOVED]: SSE_EVENTS.LOAD_EXCHANGE_REMOVED,
  [SALLY_EVENTS.LOAD_MILEAGE_CALCULATED]: SSE_EVENTS.LOAD_MILEAGE_CALCULATED,

  // Sync
  [SALLY_EVENTS.SYNC_STARTED]: SSE_EVENTS.SYNC_STARTED,
  [SALLY_EVENTS.SYNC_COMPLETED]: SSE_EVENTS.SYNC_COMPLETED,
  [SALLY_EVENTS.SYNC_FAILED]: SSE_EVENTS.SYNC_FAILED,

  // Shield
  [SALLY_EVENTS.SHIELD_AUDIT_COMPLETE]: SSE_EVENTS.SHIELD_AUDIT_COMPLETE,
  [SALLY_EVENTS.SHIELD_AUDIT_FAILED]: SSE_EVENTS.SHIELD_AUDIT_FAILED,

  // Documents
  [SALLY_EVENTS.RATECON_COMPLETED]: SSE_EVENTS.RATECON_COMPLETED,
  [SALLY_EVENTS.RATECON_FAILED]: SSE_EVENTS.RATECON_FAILED,

  // Messages
  [SALLY_EVENTS.MESSAGE_NEW]: SSE_EVENTS.MESSAGE_NEW,

  // Accounting
  [SALLY_EVENTS.ACCOUNTING_STARTED]: SSE_EVENTS.ACCOUNTING_STARTED,
  [SALLY_EVENTS.ACCOUNTING_COMPLETED]: SSE_EVENTS.ACCOUNTING_COMPLETED,
  [SALLY_EVENTS.ACCOUNTING_FAILED]: SSE_EVENTS.ACCOUNTING_FAILED,

  // Telematics
  [SALLY_EVENTS.TELEMATICS_UPDATED]: SSE_EVENTS.TELEMATICS_UPDATE,

  // EDI
  [SALLY_EVENTS.EDI_TENDER_RECEIVED]: SSE_EVENTS.EDI_TENDER_RECEIVED,
  [SALLY_EVENTS.EDI_TENDER_ACCEPTED]: SSE_EVENTS.EDI_TENDER_ACCEPTED,
  [SALLY_EVENTS.EDI_TENDER_DECLINED]: SSE_EVENTS.EDI_TENDER_DECLINED,
  [SALLY_EVENTS.EDI_TENDER_COUNTERED]: SSE_EVENTS.EDI_TENDER_COUNTERED,
  [SALLY_EVENTS.EDI_MESSAGE_SENT]: SSE_EVENTS.EDI_MESSAGE_SENT,
  [SALLY_EVENTS.EDI_MESSAGE_FAILED]: SSE_EVENTS.EDI_MESSAGE_FAILED,

  // Email Intake
  [SALLY_EVENTS.EMAIL_INGEST_RECEIVED]: SSE_EVENTS.EMAIL_INGEST_RECEIVED,
  [SALLY_EVENTS.EMAIL_INGEST_PARSED]: SSE_EVENTS.EMAIL_INGEST_PARSED,
  [SALLY_EVENTS.EMAIL_INGEST_FAILED]: SSE_EVENTS.EMAIL_INGEST_FAILED,

  // Alerts (tenant-scoped lifecycle events)
  [SALLY_EVENTS.ALERT_ESCALATED]: SSE_EVENTS.ALERT_ESCALATED,
  [SALLY_EVENTS.ALERT_RESOLVED]: SSE_EVENTS.ALERT_RESOLVED,
  [SALLY_EVENTS.ALERT_UNSNOOZED]: SSE_EVENTS.ALERT_UNSNOOZED,

  // Trips
  [SALLY_EVENTS.TRIP_CREATED]: SSE_EVENTS.TRIP_CREATED,
  [SALLY_EVENTS.TRIP_ASSIGNED]: SSE_EVENTS.TRIP_ASSIGNED,
  [SALLY_EVENTS.TRIP_STARTED]: SSE_EVENTS.TRIP_STARTED,
  [SALLY_EVENTS.TRIP_COMPLETED]: SSE_EVENTS.TRIP_COMPLETED,
  [SALLY_EVENTS.TRIP_CANCELLED]: SSE_EVENTS.TRIP_CANCELLED,
  [SALLY_EVENTS.TRIP_LOAD_ADDED]: SSE_EVENTS.TRIP_LOAD_ADDED,
  [SALLY_EVENTS.TRIP_LOAD_REMOVED]: SSE_EVENTS.TRIP_LOAD_REMOVED,
  [SALLY_EVENTS.TRIP_ROUTE_STALE]: SSE_EVENTS.TRIP_ROUTE_STALE,

  // Sally's Desk
  [SALLY_EVENTS.DESK_DECISION_CREATED]: SSE_EVENTS.DESK_DECISION_CREATED,
  [SALLY_EVENTS.DESK_DECISION_RESOLVED]: SSE_EVENTS.DESK_DECISION_RESOLVED,
  [SALLY_EVENTS.DESK_AUTO_APPROVED]: SSE_EVENTS.DESK_AUTO_APPROVED,
  [SALLY_EVENTS.DESK_ACTION_EXECUTED]: SSE_EVENTS.DESK_ACTION_EXECUTED,
  [SALLY_EVENTS.DESK_ACTION_FAILED]: SSE_EVENTS.DESK_ACTION_FAILED,
  [SALLY_EVENTS.DESK_REVIEW_ITEM_CREATED]: SSE_EVENTS.DESK_REVIEW_ITEM_CREATED,
  [SALLY_EVENTS.DESK_REVIEW_ITEM_RESOLVED]: SSE_EVENTS.DESK_REVIEW_ITEM_RESOLVED,
  // Tenant-scoped — shared dispatcher queue data (no recipientUserIds).
  [SALLY_EVENTS.DESK_EPISODE_CHANGED]: SSE_EVENTS.DESK_EPISODE_CHANGED,

  // Trailers
  [SALLY_EVENTS.TRAILER_CREATED]: SSE_EVENTS.TRAILER_CREATED,
  [SALLY_EVENTS.TRAILER_UPDATED]: SSE_EVENTS.TRAILER_UPDATED,
  [SALLY_EVENTS.TRAILER_ASSIGNED]: SSE_EVENTS.TRAILER_ASSIGNED,
  [SALLY_EVENTS.TRAILER_UNASSIGNED]: SSE_EVENTS.TRAILER_UNASSIGNED,
  [SALLY_EVENTS.TRAILER_STATUS_CHANGED]: SSE_EVENTS.TRAILER_STATUS_CHANGED,

  // Vehicles
  [SALLY_EVENTS.VEHICLE_MAINTENANCE_SCHEDULED]: SSE_EVENTS.VEHICLE_MAINTENANCE_SCHEDULED,

  // Monitoring + route lifecycle
  [SALLY_EVENTS.MONITORING_CYCLE_COMPLETED]: SSE_EVENTS.MONITORING_CYCLE_COMPLETE,
  [SALLY_EVENTS.ROUTE_EVENT_RECORDED]: SSE_EVENTS.ROUTE_EVENT,
  [SALLY_EVENTS.ROUTE_REPLAN_RECOMMENDED]: SSE_EVENTS.ROUTE_REPLAN_RECOMMENDED,
  [SALLY_EVENTS.ROUTE_ETA_SHIFTED]: SSE_EVENTS.ROUTE_ETA_SHIFTED,

  // API keys / OAuth (Phase D — fan-in to single SSE event)
  [SALLY_EVENTS.API_KEY_ROTATED]: SSE_EVENTS.API_KEY_UPDATED,
  [SALLY_EVENTS.API_KEY_REVOKED]: SSE_EVENTS.API_KEY_UPDATED,
  [SALLY_EVENTS.API_KEY_SCOPES_UPDATED]: SSE_EVENTS.API_KEY_UPDATED,
  [SALLY_EVENTS.API_KEY_PAUSED]: SSE_EVENTS.API_KEY_UPDATED,
  [SALLY_EVENTS.API_KEY_RESUMED]: SSE_EVENTS.API_KEY_UPDATED,
  [SALLY_EVENTS.OAUTH_CLIENT_ROTATED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [SALLY_EVENTS.OAUTH_CLIENT_REVOKED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [SALLY_EVENTS.OAUTH_CLIENT_SCOPES_UPDATED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [SALLY_EVENTS.OAUTH_CLIENT_PAUSED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,
  [SALLY_EVENTS.OAUTH_CLIENT_RESUMED]: SSE_EVENTS.OAUTH_CLIENT_UPDATED,

  // Agent invocation completed (payload trimmed in shapeSsePayload below)
  [SALLY_EVENTS.AGENT_INVOCATION_COMPLETED]: SSE_EVENTS.AGENT_INVOCATION_COMPLETED,

  // Financials — factoring (Phase 4). All money lifecycle events fan-in to one
  // SSE event so the wire stays narrow; the frontend invalidates ['invoices']
  // and ['factoring'] on receipt.
  [SALLY_EVENTS.FACTORING_ADVANCE_RECORDED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  [SALLY_EVENTS.FACTORING_FEE_RECORDED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  [SALLY_EVENTS.FACTORING_RESERVE_RELEASED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  [SALLY_EVENTS.FACTORING_CHARGEBACK_RECEIVED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  [SALLY_EVENTS.FACTORING_CHARGEBACK_REVERSED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  [SALLY_EVENTS.FACTORING_TRANSACTION_DELETED]: SSE_EVENTS.FACTORING_TRANSACTION_RECORDED,
  // Invoice status change emitted from Phase 4 record* methods + submitToFactor
  [SALLY_EVENTS.INVOICE_UPDATED]: SSE_EVENTS.INVOICE_UPDATED,

  // ── User-scoped (explicit) ────────────────────────────────────────
  [SALLY_EVENTS.ALERT_FIRED]: { sseType: SSE_EVENTS.ALERT_NEW, scope: 'user' },
  [SALLY_EVENTS.NOTIFICATION_SENT]: { sseType: SSE_EVENTS.NOTIFICATION_NEW, scope: 'user' },
  [SALLY_EVENTS.LOAD_BOARD_ALERT_FIRED]: { sseType: SSE_EVENTS.LOAD_BOARD_ALERT, scope: 'user' },
};

/**
 * Strip bridge-internal routing fields and trim oversized payloads before
 * the SSE broadcast. `recipientUserIds` is always removed (bridge-only data).
 * `AGENT_INVOCATION_COMPLETED` is trimmed to a small status summary.
 */
function shapeSsePayload(domainEvent: string, data: unknown): Record<string, unknown> {
  const obj = (data ?? {}) as Record<string, unknown>;

  if (domainEvent === SALLY_EVENTS.AGENT_INVOCATION_COMPLETED) {
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

  @OnEvent('sally.**', { async: true })
  handleDomainEvent(event: DomainEvent): void {
    const route = DOMAIN_TO_SSE[event.event];

    const tenantId = typeof event.tenantId === 'string' ? parseInt(event.tenantId, 10) : event.tenantId;
    const tenantIdValid = !Number.isNaN(tenantId);

    // Tower v3 — every load-touching domain event also signals tower clients
    // to refetch active loads. Wire-item fan-out lives in TowerSseSubscriber.
    // Fires regardless of whether the event has a DOMAIN_TO_SSE route.
    if (TOWER_LOAD_FANOUT.has(event.event) && tenantIdValid) {
      this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_LOAD_CHANGED, event.data);
    }

    if (!route) return;

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
