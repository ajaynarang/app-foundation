import type { QueryKey } from '@tanstack/react-query';
import { SSE_EVENTS, type SseEventType } from '@app/shared-types';
import { queryKeys } from '@/shared/constants/query-keys';

/**
 * Map SSE event types to TanStack Query keys to invalidate.
 *
 * Single source of truth — every cache-busting effect for an event lives
 * here, not in feature components.
 *
 * Values reference `queryKeys` so a rename in query-keys.ts propagates
 * automatically. Inline tuples are reserved for the few keys that have
 * no `queryKeys` namespace today (e.g. ['jobs'], ['load-messages']);
 * they're noted in comments below.
 */
export const SSE_INVALIDATION_MAP: Partial<Record<SseEventType, readonly QueryKey[]>> = {
  // Loads
  [SSE_EVENTS.LOAD_CREATED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.closeOut.root,
  ],
  [SSE_EVENTS.LOAD_UPDATED]: [queryKeys.loads.root, queryKeys.dispatchBoard.root, queryKeys.commandCenter.root],
  [SSE_EVENTS.LOAD_DELETED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.closeOut.root,
  ],
  [SSE_EVENTS.LOAD_ASSIGNED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.drivers.root,
  ],
  [SSE_EVENTS.LOAD_STATUS_CHANGED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.closeOut.root,
  ],
  [SSE_EVENTS.LOAD_BILLING_STATUS_CHANGED]: [
    queryKeys.loads.root,
    queryKeys.closeOut.root,
    queryKeys.commandCenter.root,
  ],
  [SSE_EVENTS.LOAD_STOP_STATUS_CHANGED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
  ],
  [SSE_EVENTS.LOAD_LEG_ASSIGNED]: [queryKeys.loads.root, queryKeys.dispatchBoard.root, queryKeys.commandCenter.root],
  [SSE_EVENTS.LOAD_LEG_STATUS_CHANGED]: [
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.closeOut.root,
  ],
  // Exchange removed — relay legs are recomputed; refresh the load detail.
  [SSE_EVENTS.LOAD_EXCHANGE_REMOVED]: [queryKeys.loads.root, queryKeys.dispatchBoard.root],
  // Async mileage write — refresh the load detail/list so the route summary chip updates.
  [SSE_EVENTS.LOAD_MILEAGE_CALCULATED]: [queryKeys.loads.root],

  // Alerts
  [SSE_EVENTS.ALERT_NEW]: [queryKeys.alerts.root],
  [SSE_EVENTS.ALERT_UPDATED]: [queryKeys.alerts.root],
  [SSE_EVENTS.ALERT_RESOLVED]: [queryKeys.alerts.root],
  [SSE_EVENTS.ALERT_ESCALATED]: [queryKeys.alerts.root],
  [SSE_EVENTS.ALERT_UNSNOOZED]: [queryKeys.alerts.root],

  // Notifications
  [SSE_EVENTS.NOTIFICATION_NEW]: [queryKeys.notifications.root],

  // Monitoring
  [SSE_EVENTS.MONITORING_CYCLE_COMPLETE]: [queryKeys.monitoring.root, queryKeys.commandCenter.root],
  [SSE_EVENTS.MONITORING_TRIGGER_FIRED]: [
    queryKeys.monitoring.root,
    queryKeys.alerts.root,
    queryKeys.commandCenter.root,
  ],

  // Routes
  [SSE_EVENTS.ROUTE_EVENT]: [queryKeys.commandCenter.root],
  [SSE_EVENTS.ROUTE_REPLAN_RECOMMENDED]: [queryKeys.commandCenter.root],
  [SSE_EVENTS.ROUTE_ETA_SHIFTED]: [queryKeys.commandCenter.root],

  // Documents — `['jobs']` has no queryKeys namespace; only consumer is the
  // ratecon job poller, so a one-off namespace would be over-engineering.
  [SSE_EVENTS.RATECON_COMPLETED]: [queryKeys.loads.root, ['jobs'] as const],
  [SSE_EVENTS.RATECON_FAILED]: [['jobs'] as const],

  // Sync
  [SSE_EVENTS.SYNC_COMPLETED]: [
    queryKeys.loads.root,
    queryKeys.drivers.root,
    queryKeys.vehicles.root,
    queryKeys.trailers.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
    queryKeys.integrationHealth.root,
  ],
  [SSE_EVENTS.SYNC_FAILED]: [queryKeys.integrationHealth.root],

  // Accounting
  [SSE_EVENTS.ACCOUNTING_COMPLETED]: [queryKeys.invoices.root, queryKeys.integrationHealth.root],
  [SSE_EVENTS.ACCOUNTING_FAILED]: [queryKeys.integrationHealth.root],

  // Telematics
  [SSE_EVENTS.TELEMATICS_UPDATE]: [queryKeys.commandCenter.mapData],

  // Shield
  [SSE_EVENTS.SHIELD_AUDIT_COMPLETE]: [queryKeys.shield.root],
  [SSE_EVENTS.SHIELD_AUDIT_FAILED]: [queryKeys.shield.root],

  // Trips
  [SSE_EVENTS.TRIP_CREATED]: [
    queryKeys.trips.root,
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
  ],
  [SSE_EVENTS.TRIP_ASSIGNED]: [
    queryKeys.trips.root,
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
  ],
  [SSE_EVENTS.TRIP_STARTED]: [queryKeys.trips.root, queryKeys.loads.root, queryKeys.commandCenter.root],
  [SSE_EVENTS.TRIP_COMPLETED]: [queryKeys.trips.root, queryKeys.loads.root, queryKeys.commandCenter.root],
  [SSE_EVENTS.TRIP_CANCELLED]: [
    queryKeys.trips.root,
    queryKeys.loads.root,
    queryKeys.dispatchBoard.root,
    queryKeys.commandCenter.root,
  ],
  [SSE_EVENTS.TRIP_LOAD_ADDED]: [queryKeys.trips.root, queryKeys.loads.root, queryKeys.dispatchBoard.root],
  [SSE_EVENTS.TRIP_LOAD_REMOVED]: [queryKeys.trips.root, queryKeys.loads.root, queryKeys.dispatchBoard.root],
  [SSE_EVENTS.TRIP_ROUTE_STALE]: [queryKeys.trips.root],

  // Trailers
  [SSE_EVENTS.TRAILER_CREATED]: [queryKeys.trailers.root],
  [SSE_EVENTS.TRAILER_UPDATED]: [queryKeys.trailers.root],
  [SSE_EVENTS.TRAILER_ASSIGNED]: [queryKeys.trailers.root, queryKeys.vehicles.root],
  [SSE_EVENTS.TRAILER_UNASSIGNED]: [queryKeys.trailers.root, queryKeys.vehicles.root],
  [SSE_EVENTS.TRAILER_STATUS_CHANGED]: [queryKeys.trailers.root],

  // Vehicles
  [SSE_EVENTS.VEHICLE_MAINTENANCE_SCHEDULED]: [queryKeys.vehicles.root],

  // Sally's Desk
  [SSE_EVENTS.DESK_DECISION_CREATED]: [queryKeys.desk.episodesRoot, queryKeys.desk.pendingRoot],
  [SSE_EVENTS.DESK_DECISION_RESOLVED]: [
    queryKeys.desk.episodesRoot,
    queryKeys.desk.pendingRoot,
    queryKeys.desk.performanceRoot,
  ],
  [SSE_EVENTS.DESK_AUTO_APPROVED]: [
    queryKeys.desk.episodesRoot,
    queryKeys.desk.pendingRoot,
    queryKeys.desk.performanceRoot,
  ],
  [SSE_EVENTS.DESK_ACTION_EXECUTED]: [queryKeys.desk.episodesRoot, queryKeys.desk.performanceRoot],
  [SSE_EVENTS.DESK_ACTION_FAILED]: [queryKeys.desk.episodesRoot, queryKeys.desk.performanceRoot],
  [SSE_EVENTS.DESK_REVIEW_ITEM_CREATED]: [queryKeys.desk.reviewItemsRoot],
  [SSE_EVENTS.DESK_REVIEW_ITEM_RESOLVED]: [queryKeys.desk.reviewItemsRoot],
  // An episode opened / closed / was resolved — refresh both queue tabs and
  // the handoff counts so a manual run (or any close) shows up live without a
  // page reload. `approvalsRoot` covers both pending approvals and the counts
  // aggregate (counts is keyed under approvals).
  [SSE_EVENTS.DESK_EPISODE_CHANGED]: [
    queryKeys.desk.episodesRoot,
    queryKeys.desk.handledRoot,
    queryKeys.desk.approvalsRoot,
  ],

  // Email Intake
  [SSE_EVENTS.EMAIL_INGEST_RECEIVED]: [queryKeys.emailIngest.root],
  [SSE_EVENTS.EMAIL_INGEST_PARSED]: [queryKeys.emailIngest.root],
  [SSE_EVENTS.EMAIL_INGEST_FAILED]: [queryKeys.emailIngest.root],

  // Agent management
  [SSE_EVENTS.API_KEY_UPDATED]: [queryKeys.apiKeys.list()],
  [SSE_EVENTS.OAUTH_CLIENT_UPDATED]: [queryKeys.oauthClients.list()],
  [SSE_EVENTS.AGENT_INVOCATION_COMPLETED]: [queryKeys.agentActivity.root],

  // Financials — factoring (Phase 4). All sally.factoring.* events fan-in to
  // a single SSE event server-side; the frontend invalidates the per-invoice
  // transactions list, the global factoring root (4C summary), and the
  // invoice list (status badge / money cells refresh).
  [SSE_EVENTS.FACTORING_TRANSACTION_RECORDED]: [queryKeys.factoring.root, queryKeys.invoices.root],
  [SSE_EVENTS.INVOICE_UPDATED]: [queryKeys.invoices.root],

  // Tower v3 — TOWER_WIRE_ITEM_ADDED and TOWER_RISK_TRANSITION are handled
  // by useTowerEvents directly (cache patch, not full invalidate) so they
  // are intentionally absent here. ['load-messages'] is a raw tuple — no
  // queryKeys namespace for it today (see header comment).
  [SSE_EVENTS.TOWER_LOAD_CHANGED]: [queryKeys.tower.root],
  [SSE_EVENTS.TOWER_ALERTS_CHANGED]: [queryKeys.alerts.root],
  // A new driver message refreshes the legacy load-message threads, the
  // Messages-tab triage list, and any open driver thread.
  [SSE_EVENTS.TOWER_MESSAGES_CHANGED]: [
    ['load-messages'],
    queryKeys.tower.driverConversations,
    ['tower', 'driver-thread'],
  ],
};
