import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AlertPriority } from '@prisma/client';
import type { WireItem } from '@sally/shared-types';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { SseService } from '../../../../infrastructure/sse/sse.service';
import { SSE_EVENTS } from '../../../../infrastructure/sse/sse-events.constants';
import { TOWER_DESK_RESPONSIBILITY_ALLOW_LIST, TowerWireService } from './tower-wire.service';
import { TOWER_RISK_TRANSITION_EVENT, type TowerRiskTransitionPayload } from './risk-score.service';

/**
 * Tower v3 — SSE fan-out for events that need WireItem formatting.
 *
 * Lives in the domain (not infrastructure) because the formatter calls
 * are domain logic and we want infrastructure to stay free of domain
 * service imports. The infrastructure-level `DomainEventSseBridge` still
 * owns the simple 1:1 mappings (LOAD_* → TOWER_LOAD_CHANGED).
 */
@Injectable()
export class TowerSseSubscriber {
  private readonly logger = new Logger(TowerSseSubscriber.name);

  constructor(
    private readonly sseService: SseService,
    private readonly wireService: TowerWireService,
  ) {}

  // ─── Tier-1 ops events → wire item + ops fan-out ───────────────────────
  @OnEvent(SALLY_EVENTS.LOAD_ASSIGNED, { async: true })
  onLoadAssigned(event: DomainEvent): void {
    this.emitWireFromLoadEvent(event);
  }

  @OnEvent(SALLY_EVENTS.LOAD_STATUS_CHANGED, { async: true })
  onLoadStatusChanged(event: DomainEvent): void {
    this.emitWireFromLoadEvent(event);
  }

  @OnEvent(SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED, { async: true })
  onLoadStopStatusChanged(event: DomainEvent): void {
    this.emitWireFromLoadEvent(event);
  }

  @OnEvent(SALLY_EVENTS.LOAD_LEG_ASSIGNED, { async: true })
  onLoadLegAssigned(event: DomainEvent): void {
    this.emitWireFromLoadEvent(event);
  }

  @OnEvent(SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED, { async: true })
  onLoadLegStatusChanged(event: DomainEvent): void {
    this.emitWireFromLoadEvent(event);
  }

  // ─── Alerts → wire item (kind=alert) + TOWER_ALERTS_CHANGED ────────────
  @OnEvent(SALLY_EVENTS.ALERT_FIRED, { async: true })
  onAlertFired(event: DomainEvent): void {
    this.emitAlertWire(event);
  }

  @OnEvent(SALLY_EVENTS.ALERT_ESCALATED, { async: true })
  onAlertEscalated(event: DomainEvent): void {
    this.emitAlertWire(event);
  }

  @OnEvent(SALLY_EVENTS.ALERT_RESOLVED, { async: true })
  onAlertResolved(event: DomainEvent): void {
    this.emitAlertWire(event);
  }

  // ─── Messages → wire item (kind=message) + TOWER_MESSAGES_CHANGED ──────
  @OnEvent(SALLY_EVENTS.MESSAGE_NEW, { async: true })
  onMessageNew(event: DomainEvent): void {
    const tenantId = this.parseTenant(event);
    if (tenantId === null) return;
    const data = (event.data ?? {}) as Record<string, unknown>;
    const messageId = (data.messageId as string) ?? `live:${event.id}`;
    const content = (data.content as string) ?? '';
    // The live event carries no load join — the per-message load tag is
    // resolved on the next wire backfill. Until then the item has no
    // `relatedLoadId`, which the frontend handles gracefully.
    const wire: WireItem = this.wireService.formatMessage({
      messageId,
      content,
      role: (data.role as string) ?? 'driver',
      createdAt: event.timestamp ?? new Date(),
    });
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, wire);
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_MESSAGES_CHANGED, { messageId });
  }

  // ─── Desk → wire item (kind=desk) only when responsibility is in allow-list
  @OnEvent(SALLY_EVENTS.DESK_DECISION_CREATED, { async: true })
  onDeskDecisionCreated(event: DomainEvent): void {
    this.emitDeskWire(event);
  }

  @OnEvent(SALLY_EVENTS.DESK_AUTO_APPROVED, { async: true })
  onDeskAutoApproved(event: DomainEvent): void {
    this.emitDeskWire(event);
  }

  @OnEvent(SALLY_EVENTS.DESK_ACTION_EXECUTED, { async: true })
  onDeskActionExecuted(event: DomainEvent): void {
    this.emitDeskWire(event);
  }

  // ─── Synthetic internal event → TOWER_RISK_TRANSITION ──────────────────
  @OnEvent(TOWER_RISK_TRANSITION_EVENT, { async: true })
  onTowerRiskTransition(payload: TowerRiskTransitionPayload): void {
    this.sseService.emitToTenant(payload.tenantId, SSE_EVENTS.TOWER_RISK_TRANSITION, {
      loadId: payload.loadId,
      driverId: payload.driverId,
      fromBand: payload.fromBand,
      toBand: payload.toBand,
      score: payload.score,
    });
  }

  // ─── Helpers ───────────────────────────────────────────────────────────

  private emitWireFromLoadEvent(event: DomainEvent): void {
    const tenantId = this.parseTenant(event);
    if (tenantId === null) return;
    const wire = this.wireService.formatLoadEvent(event);
    if (!wire) return;
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, wire);
  }

  private emitAlertWire(event: DomainEvent): void {
    const tenantId = this.parseTenant(event);
    if (tenantId === null) return;
    const data = (event.data ?? {}) as Record<string, unknown>;
    // ALERT_* domain events carry `priority` as an AlertPriority enum value
    // and `driverId`/`loadNumber` as public string slugs (never the internal
    // Int FKs). `loadNumber` is the canonical key (set by AlertGenerationService
    // from the alert's load); `loadId` is accepted as a fallback so the same
    // load-reference handling mirrors `formatLoadEvent`. Adapt the flat event
    // payload into the relation-shaped `formatAlert` input.
    const driverSlug = data.driverId as string | undefined;
    const loadNumber = (data.loadNumber as string | undefined) ?? (data.loadId as string | undefined);
    const wire: WireItem = this.wireService.formatAlert({
      alertId: (data.alertId as string) ?? `live:${event.id}`,
      priority: (data.priority as AlertPriority) ?? AlertPriority.MEDIUM,
      title: (data.title as string) ?? 'Alert',
      message: data.message as string | undefined,
      createdAt: event.timestamp ?? new Date(),
      load: loadNumber ? { loadNumber } : null,
      driver: driverSlug ? { driverId: driverSlug } : null,
    });
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, wire);
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_ALERTS_CHANGED, { alertId: wire.id });
  }

  private emitDeskWire(event: DomainEvent): void {
    const tenantId = this.parseTenant(event);
    if (tenantId === null) return;
    const data = (event.data ?? {}) as Record<string, unknown>;
    const responsibilityType = (data.responsibilityType as string) ?? (data.responsibilityKey as string) ?? '';
    if (!TOWER_DESK_RESPONSIBILITY_ALLOW_LIST.has(responsibilityType)) return;

    const wire = this.wireService.formatDeskOutput({
      id: (data.episodeId as string) ?? (data.id as string) ?? `live:${event.id}`,
      entityType: (data.entityType as string) ?? null,
      entityId: (data.entityId as string) ?? null,
      openedAt: event.timestamp ?? new Date(),
      updatedAt: event.timestamp ?? new Date(),
      status: (data.status as string) ?? 'pending',
      outcome: (data.outcome as string) ?? null,
      responsibility: {
        key: responsibilityType,
        title: (data.responsibilityTitle as string) ?? responsibilityType,
      },
    });
    if (!wire) return;
    this.sseService.emitToTenant(tenantId, SSE_EVENTS.TOWER_WIRE_ITEM_ADDED, wire);
  }

  private parseTenant(event: DomainEvent): number | null {
    const tid = typeof event.tenantId === 'string' ? parseInt(event.tenantId, 10) : event.tenantId;
    if (Number.isNaN(tid)) {
      this.logger.warn(`tower-sse: bad tenantId "${event.tenantId}" for ${event.event}`);
      return null;
    }
    return tid;
  }
}
