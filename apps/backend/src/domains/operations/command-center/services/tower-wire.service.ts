import { Injectable, Logger } from '@nestjs/common';
import { AlertPriority, LoadStatus } from '@prisma/client';
import type { WireAction, WireItem, WireKind, WireSeverity } from '@sally/shared-types';
import { DomainEvent } from '../../../../infrastructure/events/domain-event';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_HOT_30S, TOWER_CACHE_NAMESPACE } from '../../../../constants/cache.constants';
import { DRIVER_CONVERSATION_USER_MODE } from '../../../fleet/loads/driver-messages.constants';
import { WIRE_BACKFILL_MAX_LIMIT } from '../tower.constants';

/**
 * Tower v3 — Desk responsibility types whose decisions surface on the wire.
 * Other responsibility types (compliance background jobs, etc.) stay off the
 * wire so dispatchers aren't drowned in noise.
 */
export const TOWER_DESK_RESPONSIBILITY_ALLOW_LIST = new Set<string>([
  'backhaul-finder',
  'rate-con-triage',
  'appointment-confirmation',
  'pre-stage-recommendation',
]);

/**
 * Tier-1 stop status transitions that earn a wire item. Anything else is
 * an intermediate state we don't surface to the dispatcher.
 */
const TIER_ONE_STOP_STATUSES = new Set(['arrived', 'loaded', 'departed', 'unloaded']);

const STAGE_DURATION_BUCKET_MS = 30_000;

/**
 * Tower v3 — wire backfill + formatter service.
 *
 * Three responsibilities:
 *  1. Read a chronologically-merged "wire" of alerts + messages + desk
 *     decisions + Tier-1 ops events when the page mounts.
 *  2. Format individual domain events into `WireItem`s for the SSE bridge.
 *  3. Decide whether an incoming domain event is Tier-1 (wire-worthy) or
 *     Tier-2 (silent, but still cache-busting).
 *
 * The SSE bridge calls the formatters synchronously — no DB hits in those
 * paths. The backfill path is cached at 30s, bucketed on `since` so multiple
 * dispatchers share a single key.
 */
@Injectable()
export class TowerWireService {
  private readonly logger = new Logger(TowerWireService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
  ) {}

  async backfill(tenantId: number, since: Date, kinds: WireKind[], limit: number): Promise<WireItem[]> {
    const clampedLimit = Math.max(1, Math.min(WIRE_BACKFILL_MAX_LIMIT, limit));
    const sinceTrunc = Math.floor(since.getTime() / STAGE_DURATION_BUCKET_MS) * STAGE_DURATION_BUCKET_MS;
    const kindsKey = [...kinds].sort().join('+');

    return this.cache.getOrSet<WireItem[]>(
      buildKey(TOWER_CACHE_NAMESPACE, 'wire', tenantId, kindsKey, sinceTrunc, clampedLimit),
      () => this.fetchAll(tenantId, new Date(sinceTrunc), kinds, clampedLimit),
      CACHE_TTL_HOT_30S,
    );
  }

  // -------------------------------------------------------------------------
  // Backfill — DB pulls per kind, merge, sort
  // -------------------------------------------------------------------------

  private async fetchAll(tenantId: number, since: Date, kinds: WireKind[], limit: number): Promise<WireItem[]> {
    const kindSet = new Set(kinds);
    const collected: WireItem[] = [];

    if (kindSet.has('alert')) collected.push(...(await this.fetchAlerts(tenantId, since, limit)));
    if (kindSet.has('message')) collected.push(...(await this.fetchMessages(tenantId, since, limit)));
    if (kindSet.has('desk')) collected.push(...(await this.fetchDeskOutputs(tenantId, since, limit)));
    if (kindSet.has('ops')) collected.push(...(await this.fetchOpsEvents(tenantId, since, limit)));

    collected.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return collected.slice(0, limit);
  }

  private async fetchAlerts(tenantId: number, since: Date, limit: number): Promise<WireItem[]> {
    // Phase 2 Task 10 — `Alert.loadId`/`driverId` are now Int FKs. Join the
    // `load` and `driver` relations so the wire item can carry the public
    // string identifiers (loadNumber / driver slug) the frontend consumes.
    const rows = await this.prisma.alert.findMany({
      where: { tenantId, createdAt: { gte: since } },
      include: {
        load: { select: { loadNumber: true } },
        driver: { select: { driverId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.formatAlert(row));
  }

  private async fetchMessages(tenantId: number, since: Date, limit: number): Promise<WireItem[]> {
    // Only driver-dispatch conversations — the driver↔dispatcher threads.
    // Without this filter every Sally AI chat message (greetings, assistant
    // replies) leaks into the operational wire.
    const rows = await this.prisma.conversationMessage.findMany({
      where: {
        conversation: { tenantId, userMode: DRIVER_CONVERSATION_USER_MODE },
        createdAt: { gte: since },
      },
      include: {
        load: { select: { loadNumber: true, referenceNumber: true } },
        // The driver this message's thread belongs to — gives the "All" wire
        // item its driver-name context.
        conversation: { select: { driver: { select: { driverId: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => this.formatMessage(row));
  }

  private async fetchDeskOutputs(tenantId: number, since: Date, limit: number): Promise<WireItem[]> {
    const rows = await this.prisma.deskEpisode.findMany({
      where: {
        tenantId,
        openedAt: { gte: since },
        responsibility: { key: { in: Array.from(TOWER_DESK_RESPONSIBILITY_ALLOW_LIST) } },
      },
      include: {
        responsibility: { select: { key: true, title: true } },
        // Undecided approvals — `decision: null` — are the ones a dispatcher can
        // still accept/decline straight from the wire. Newest first; we surface
        // the most recent on the wire item's accept/decline actions.
        approvals: {
          where: { decision: null },
          select: { id: true },
          orderBy: { requestedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { openedAt: 'desc' },
      take: limit,
    });

    const items: WireItem[] = [];
    for (const row of rows) {
      const item = this.formatDeskOutput(row);
      if (item) items.push(item);
    }
    return items;
  }

  private async fetchOpsEvents(tenantId: number, since: Date, limit: number): Promise<WireItem[]> {
    const rows = await this.prisma.loadEvent.findMany({
      where: { load: { tenantId }, createdAt: { gte: since } },
      include: { load: { select: { loadNumber: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const items: WireItem[] = [];
    for (const row of rows) {
      const item = this.formatLoadEventRow(row);
      if (item) items.push(item);
    }
    return items;
  }

  // -------------------------------------------------------------------------
  // Formatters — pure functions used by both backfill and the SSE bridge
  // -------------------------------------------------------------------------

  /**
   * Format a live `LOAD_*` domain event into an ops wire item.
   *
   * Reads the real domain-event payload keys emitted by the load services
   * (verified against load-assignment / load-status / stop-status / load-leg):
   *   - `entityId`        — public load number for load events (leg id for leg events)
   *   - `loadNumber`      — public load number (load events only)
   *   - `loadId`          — load number for leg events; absent on load events
   *   - `status`          — new LoadStatus / stop status
   *   - `newStatus`       — new leg status
   *
   * The wire item's `relatedLoadId` carries the public load number (never an
   * internal Int FK) so the frontend can deep-link without another lookup.
   */
  formatLoadEvent(event: DomainEvent): WireItem | null {
    const data = (event.data ?? {}) as Record<string, unknown>;
    // Public load number — load events put it in `loadNumber`/`entityId`; leg
    // events put the load number in `loadId` and the leg id in `entityId`.
    const loadNumber =
      (data.loadNumber as string | undefined) ??
      (data.loadId as string | undefined) ??
      (data.entityId as string | undefined);
    if (!loadNumber) return null;

    const at = event.timestamp ?? new Date();

    switch (event.event) {
      case SALLY_EVENTS.LOAD_ASSIGNED:
        return this.opsWireItem(`${loadNumber} assigned`, loadNumber, at);

      case SALLY_EVENTS.LOAD_STATUS_CHANGED: {
        const status = data.status as string | undefined;
        if (status !== LoadStatus.IN_TRANSIT && status !== LoadStatus.DELIVERED) return null;
        const text = status === LoadStatus.IN_TRANSIT ? `${loadNumber} in transit` : `${loadNumber} delivered`;
        return this.opsWireItem(text, loadNumber, at);
      }

      case SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED: {
        const status = data.status as string | undefined;
        if (!status || !TIER_ONE_STOP_STATUSES.has(status)) return null;
        return this.opsWireItem(`${loadNumber} stop ${status}`, loadNumber, at);
      }

      case SALLY_EVENTS.LOAD_LEG_ASSIGNED:
        return this.opsWireItem(`${loadNumber} leg assigned`, loadNumber, at);

      case SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED:
        return this.opsWireItem(`${loadNumber} leg ${data.newStatus ?? data.action ?? 'updated'}`, loadNumber, at);

      default:
        return null;
    }
  }

  formatAlert(row: {
    alertId: string;
    priority: AlertPriority;
    title: string;
    message?: string | null;
    createdAt: Date;
    load?: { loadNumber: string } | null;
    driver?: { driverId: string } | null;
  }): WireItem {
    return {
      id: `alert:${row.alertId}`,
      kind: 'alert',
      severity: this.mapAlertSeverity(row.priority),
      text: row.title,
      timestamp: new Date(row.createdAt).toISOString(),
      relatedLoadId: row.load?.loadNumber ?? undefined,
      relatedDriverId: row.driver?.driverId ?? undefined,
      // `alertId` lets the wire "Mute 1h" button call the alert snooze
      // endpoint without a second lookup.
      actions: [{ kind: 'mute', label: 'Mute 1h', payload: { alertId: row.alertId } }],
    };
  }

  formatMessage(row: {
    messageId: string;
    content: string;
    role: string;
    createdAt: Date;
    // The message's per-message load tag, if any. Absent on the live SSE path
    // (the event has no load join) — the next backfill fills it in.
    load?: { loadNumber: string; referenceNumber: string | null } | null;
    // The driver this message's thread belongs to. Absent on the live SSE
    // path; the next backfill fills it in.
    conversation?: { driver?: { driverId: string; name: string } | null } | null;
  }): WireItem {
    const trimmed = row.content.length > 120 ? `${row.content.slice(0, 117)}…` : row.content;
    const driver = row.conversation?.driver ?? null;
    return {
      id: `message:${row.messageId}`,
      kind: 'message',
      severity: 'info',
      text: trimmed,
      timestamp: new Date(row.createdAt).toISOString(),
      // The per-message load tag — lets the wire item's Open-load action
      // deep-link to the load this message is about.
      relatedLoadId: row.load?.loadNumber ?? undefined,
      relatedLoadReference: row.load?.referenceNumber ?? undefined,
      relatedDriverId: driver?.driverId ?? undefined,
      relatedDriverName: driver?.name ?? undefined,
    };
  }

  formatDeskOutput(row: {
    id: string;
    entityType: string | null;
    entityId: string | null;
    openedAt: Date;
    updatedAt: Date;
    status: string;
    outcome: string | null;
    responsibility: { key: string; title: string };
    approvals?: { id: string }[];
  }): WireItem | null {
    const key = row.responsibility.key;
    if (!TOWER_DESK_RESPONSIBILITY_ALLOW_LIST.has(key)) return null;

    return {
      id: `desk:${row.id}`,
      kind: 'desk',
      severity: 'info',
      text: row.responsibility.title,
      timestamp: new Date(row.updatedAt).toISOString(),
      relatedLoadId: row.entityType === 'load' ? (row.entityId ?? undefined) : undefined,
      deskAnchor: {
        responsibilityType: key,
        episodeId: row.id,
      },
      actions: this.deskActions(row.approvals?.[0]?.id),
    };
  }

  /**
   * Accept/decline actions for a desk wire item. They only appear when the
   * episode has an undecided approval — the `approvalId` payload is what the
   * wire buttons hand to the Desk decide endpoint. With no pending approval
   * the item carries no actions (the row stays read-only with its Desk link).
   */
  private deskActions(approvalId: string | undefined): WireAction[] | undefined {
    if (!approvalId) return undefined;
    return [
      { kind: 'accept-desk', label: 'Accept', payload: { approvalId } },
      { kind: 'decline-desk', label: 'Decline', payload: { approvalId } },
    ];
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private formatLoadEventRow(row: {
    id: number;
    eventType: string;
    fromValue: string | null;
    toValue: string | null;
    description: string | null;
    createdAt: Date;
    load: { loadNumber: string };
  }): WireItem | null {
    // Convert the persisted load_event row into a synthetic DomainEvent and
    // reuse `formatLoadEvent` so backfill + live SSE stay in lockstep. The
    // synthetic payload mirrors the *real* domain-event keys (`loadNumber`,
    // `status`, `newStatus`) — the persisted `toValue` carries the new state.
    const synthetic = new DomainEvent(this.mapEventTypeToSallyName(row.eventType), '0', {
      loadNumber: row.load.loadNumber,
      status: row.toValue,
      newStatus: row.toValue,
    });
    Object.assign(synthetic, { timestamp: row.createdAt });
    return this.formatLoadEvent(synthetic);
  }

  /**
   * `load_events.event_type` is free-form string; map the ones we care about
   * to SALLY_EVENTS names so the live + backfill formatters stay aligned.
   * Anything we don't recognize returns a token that won't match the switch.
   */
  private mapEventTypeToSallyName(eventType: string): string {
    switch (eventType) {
      case 'assigned':
      case 'LOAD_ASSIGNED':
        return SALLY_EVENTS.LOAD_ASSIGNED;
      case 'status-changed':
      case 'LOAD_STATUS_CHANGED':
        return SALLY_EVENTS.LOAD_STATUS_CHANGED;
      case 'stop-status-changed':
      case 'LOAD_STOP_STATUS_CHANGED':
        return SALLY_EVENTS.LOAD_STOP_STATUS_CHANGED;
      case 'leg-assigned':
      case 'LOAD_LEG_ASSIGNED':
        return SALLY_EVENTS.LOAD_LEG_ASSIGNED;
      case 'leg-status-changed':
      case 'LOAD_LEG_STATUS_CHANGED':
        return SALLY_EVENTS.LOAD_LEG_STATUS_CHANGED;
      default:
        return `unknown.${eventType}`;
    }
  }

  private opsWireItem(text: string, loadId: string, timestamp: Date): WireItem {
    return {
      id: `ops:${loadId}:${timestamp.getTime()}`,
      kind: 'ops',
      severity: 'info',
      text,
      timestamp: timestamp.toISOString(),
      relatedLoadId: loadId,
    };
  }

  private mapAlertSeverity(priority: AlertPriority): WireSeverity {
    switch (priority) {
      case AlertPriority.CRITICAL:
      case AlertPriority.HIGH:
        return 'critical';
      case AlertPriority.MEDIUM:
        return 'caution';
      default:
        return 'info';
    }
  }
}
