/**
 * Tenant Reset Registry — SINGLE SOURCE OF TRUTH
 *
 * Every tenant-scoped Prisma model must appear here exactly once. The
 * `fk-order.spec.ts` drift test fails CI when a new model with `tenantId`
 * is added to the schema but not registered here.
 *
 * Entries are declared in FK-safe deletion order. Do NOT reorder without
 * running the soft/hard integration tests.
 *
 * Two modes:
 *   - soft: wipes all entries with `soft: 'wipe'`; leaves `soft: 'keep'` alone.
 *   - hard: wipes every entry, plus the Tenant row itself.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

export type ResetMode = 'soft' | 'hard';
export type SoftBehavior = 'wipe' | 'keep' | 'reset';

/**
 * Categories are metadata for the operator — they drive the grouped summary
 * printed at the end of a run but don't affect deletion order.
 */
export const CATEGORIES = {
  TENANT_CONFIG: 'tenant_config',
  PLATFORM_USERS: 'platform_users',
  FLEET_ENTITIES: 'fleet_entities',
  FLEET_ARTIFACTS: 'fleet_artifacts',
  DESK_CONFIG: 'desk_config',
  DESK_RUNTIME: 'desk_runtime',
  SHIELD_CONFIG: 'shield_config',
  SHIELD_RUNTIME: 'shield_runtime',
  FACTORING_CONFIG: 'factoring_config',
  INTEGRATION_CONFIG: 'integration_config',
  INTEGRATION_STATE: 'integration_state',
  PLATFORM_BILLING: 'platform_billing',
  OAUTH: 'oauth',
  WEBHOOKS: 'webhooks',
  CUSTOMERS: 'customers',
  LANES: 'lanes',
  LOADS: 'loads',
  ROUTES: 'routes',
  MONEY: 'money',
  DOCUMENTS: 'documents',
  ALERTS_OPS: 'alerts_ops',
  AI_CHAT: 'ai_chat',
  EDI: 'edi',
  IFTA: 'ifta',
  EMAIL_INGEST: 'email_ingest',
  SUPPORT: 'support',
} as const;

export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/**
 * A registry entry describes how to delete one model's rows for one tenant.
 *
 * `scope` may be:
 *   - the string 'tenantId-int'   — model has `tenantId Int`
 *   - the string 'tenantId-string'— model has `tenantId String` (slug)
 *   - a function returning a Prisma `where` fragment (indirect scoping via a
 *     parent relation, e.g. AlertNote scoped via alert.tenantId)
 *
 * `reset` is used for integration configs — we keep credentials but clear
 * sync timestamps in soft mode. Only supported for a tiny allowlist of entries.
 */
export interface RegistryEntry {
  readonly table: string;
  readonly category: Category;
  readonly soft: SoftBehavior;
  readonly scope:
    | 'tenantId-int'
    | 'tenantId-string'
    | ((tenantIntId: number, tenantStringId: string) => Record<string, unknown>);
  /**
   * Function that issues the delete (or update, for `reset` entries) inside a
   * Prisma transaction. Returns the affected-row count.
   */
  readonly run: (
    tx: Prisma.TransactionClient,
    tenantIntId: number,
    tenantStringId: string,
    mode: ResetMode,
  ) => Promise<number>;
}

const whereTenantInt = (tenantIntId: number) => ({ tenantId: tenantIntId });
const whereTenantString = (tenantStringId: string) => ({
  tenantId: tenantStringId,
});

/**
 * Helper: delete rows where `{tenantId: <int>}`.
 */
function deleteByTenantInt<
  T extends {
    deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
  },
>(delegate: T, tenantIntId: number): Promise<{ count: number }> {
  return delegate.deleteMany({ where: whereTenantInt(tenantIntId) });
}

/**
 * Ordered list of deletions. Edit with care — FK safety depends on order.
 *
 * High-level order:
 *   1. Null out SetNull self-references that would block cascades (phase 0)
 *   2. Leaf tables with no dependents (support, webhooks, oauth, email ingest,
 *      load board searches, feedback, announcements)
 *   3. Desk runtime, shield runtime, alerts/ops, docs, AI chat
 *   4. Money: deductions & line items → settlements → payments → invoice lines → invoices
 *   5. Routes: events → plan_loads → segments → feedback → plans
 *   6. Loads: stops (cascaded), charges, legs, events, notes → loads
 *   7. Trips, lane targets, recurring lane stops → recurring lanes
 *   8. Customer contacts → customers
 *   9. Fleet artifacts → fleet entities
 *   10. Desk/Shield/Factoring config (hard only — kept in soft)
 *   11. Integration config (reset timestamps in soft, delete in hard)
 *   12. Platform billing (hard only)
 *   13. Tenant config (hard only)
 *   14. Platform users (hard only)
 *   15. Tenant row (hard only — very last)
 */
export const REGISTRY: readonly RegistryEntry[] = [
  // ── Phase 0: FK nulling (must run before related deletes) ────────────────
  // NOTE: These are not standalone registry entries — they're executed by
  // `core.ts` in a pre-phase. See `preDeletionNullouts` in core.ts.

  // ── Leaf / support / webhooks / oauth / email ingest ─────────────────────
  {
    table: 'feedback',
    category: CATEGORIES.SUPPORT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.feedback, t).then((r) => r.count),
  },
  {
    table: 'support_ticket_messages',
    category: CATEGORIES.SUPPORT,
    soft: 'wipe',
    scope: (t) => ({ ticket: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.supportTicketMessage.deleteMany({
          where: { ticket: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'support_tickets',
    category: CATEGORIES.SUPPORT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.supportTicket, t).then((r) => r.count),
  },
  {
    table: 'load_board_saved_searches',
    category: CATEGORIES.SUPPORT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.loadBoardSavedSearch, t).then((r) => r.count),
  },
  {
    table: 'webhook_delivery_logs',
    category: CATEGORIES.WEBHOOKS,
    soft: 'wipe',
    scope: (t) => ({ subscription: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.webhookDeliveryLog.deleteMany({
          where: { subscription: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'dead_letter_logs',
    category: CATEGORIES.WEBHOOKS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deadLetterLog, t).then((r) => r.count),
  },
  {
    table: 'webhook_subscriptions',
    category: CATEGORIES.WEBHOOKS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.webhookSubscription, t).then((r) => r.count),
  },
  {
    table: 'domain_event_log',
    category: CATEGORIES.WEBHOOKS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.domainEventLog, t).then((r) => r.count),
  },
  {
    table: 'oauth_access_tokens',
    category: CATEGORIES.OAUTH,
    soft: 'wipe',
    scope: (t) => ({ client: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.oAuthAccessToken.deleteMany({
          where: { client: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'oauth_refresh_tokens',
    category: CATEGORIES.OAUTH,
    soft: 'wipe',
    scope: (t) => ({ client: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.oAuthRefreshToken.deleteMany({
          where: { client: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'oauth_authorization_codes',
    category: CATEGORIES.OAUTH,
    soft: 'wipe',
    scope: (t) => ({ client: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.oAuthAuthorizationCode.deleteMany({
          where: { client: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'oauth_clients',
    category: CATEGORIES.OAUTH,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.oAuthClient, t).then((r) => r.count),
  },
  {
    table: 'email_ingest_attachments',
    category: CATEGORIES.EMAIL_INGEST,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.emailIngestAttachment, t).then((r) => r.count),
  },
  {
    table: 'email_ingest_messages',
    category: CATEGORIES.EMAIL_INGEST,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.emailIngestMessage, t).then((r) => r.count),
  },
  {
    table: 'email_ingest_threads',
    category: CATEGORIES.EMAIL_INGEST,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.emailIngestThread, t).then((r) => r.count),
  },

  // ── Desk runtime (episodes + steps + approvals) ──
  // Cascade: episode→step, episode→approval, step→approval.
  // We delete episodes; the cascade handles steps + approvals.
  {
    table: 'desk_episodes',
    category: CATEGORIES.DESK_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deskEpisode, t).then((r) => r.count),
  },
  {
    table: 'desk_memories',
    category: CATEGORIES.DESK_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deskMemory, t).then((r) => r.count),
  },
  {
    table: 'desk_entity_suppressions',
    category: CATEGORIES.DESK_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deskEntitySuppression, t).then((r) => r.count),
  },
  {
    table: 'agent_invocation_logs',
    category: CATEGORIES.DESK_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.agentInvocationLog, t).then((r) => r.count),
  },
  {
    table: 'hitl_challenges',
    category: CATEGORIES.DESK_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.hitlChallenge, t).then((r) => r.count),
  },
  {
    // AI cost ledger — wiped on tenant reset so a recycled tenant doesn't
    // carry forward another tenant's spend numbers. Cascade from `tenants`
    // already drops these on hard delete; this entry covers soft-reset.
    // Listed AFTER `desk_episode_steps` indirectly via category ordering —
    // FK is SET NULL so deletion order doesn't matter, but we wipe in
    // categorical group with other runtime artifacts.
    table: 'ai_invocations',
    category: CATEGORIES.AI_CHAT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.aiInvocation, t).then((r) => r.count),
  },
  {
    // Per-tenant AI cost budget. Wiped on reset; `AiTelemetryService.getBudget`
    // lazily re-creates a default-cap row on the next AI call, so a recycled
    // tenant starts from the standard low caps rather than inheriting custom
    // ones. Hard delete cascades from `tenants`.
    table: 'tenant_ai_budgets',
    category: CATEGORIES.AI_CHAT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantAiBudget, t).then((r) => r.count),
  },

  // ── Shield runtime ────────────────────────────────────────────────────────
  {
    table: 'shield_findings',
    category: CATEGORIES.SHIELD_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.shieldFinding, t).then((r) => r.count),
  },
  {
    table: 'shield_audits',
    category: CATEGORIES.SHIELD_RUNTIME,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.shieldAudit, t).then((r) => r.count),
  },

  // ── Alerts / ops / notifications ──────────────────────────────────────────
  {
    table: 'alert_notes',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: (t) => ({ alert: { tenantId: t } }),
    run: async (tx, t) => (await tx.alertNote.deleteMany({ where: { alert: { tenantId: t } } })).count,
  },
  {
    table: 'alerts',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.alert, t).then((r) => r.count),
  },
  {
    table: 'notifications',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.notification, t).then((r) => r.count),
  },
  {
    table: 'shift_notes',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.shiftNote, t).then((r) => r.count),
  },
  {
    table: 'jobs',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.job, t).then((r) => r.count),
  },
  {
    table: 'tenant_counters',
    category: CATEGORIES.ALERTS_OPS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantCounter, t).then((r) => r.count),
  },

  // ── Documents + Events (load-attached) ────────────────────────────────────
  {
    table: 'documents',
    category: CATEGORIES.DOCUMENTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.document, t).then((r) => r.count),
  },
  // Event has no tenantId directly — skip for now. It's an append-only event
  // log; if it grows tenant-specific later, register here.

  // ── AI chat ───────────────────────────────────────────────────────────────
  // conversation_messages cascade via conversation→ConversationMessage
  {
    table: 'conversation_messages',
    category: CATEGORIES.AI_CHAT,
    soft: 'wipe',
    scope: (t) => ({ conversation: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.conversationMessage.deleteMany({
          where: { conversation: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'conversation_sessions',
    category: CATEGORIES.AI_CHAT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.conversationSession, t).then((r) => r.count),
  },
  {
    table: 'conversations',
    category: CATEGORIES.AI_CHAT,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.conversation, t).then((r) => r.count),
  },
  // KnowledgeDocument is global reference data (no tenantId) — never deleted.

  // ── Money: deductions + line items → settlements → payments → invoice lines → invoices
  {
    table: 'settlement_deductions',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: (t) => ({ settlement: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.settlementDeduction.deleteMany({
          where: { settlement: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'settlement_line_items',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: (t) => ({ settlement: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.settlementLineItem.deleteMany({
          where: { settlement: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'settlements',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.settlement, t).then((r) => r.count),
  },
  {
    table: 'invoice_share_links',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.invoiceShareLink, t).then((r) => r.count),
  },
  {
    table: 'invoice_line_items',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: (t) => ({ invoice: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.invoiceLineItem.deleteMany({
          where: { invoice: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'payments',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.payment, t).then((r) => r.count),
  },
  {
    // Phase 4 — must delete before invoices (FK to invoice + factoring_company).
    table: 'factoring_transactions',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.factoringTransaction, t).then((r) => r.count),
  },
  {
    table: 'invoices',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.invoice, t).then((r) => r.count),
  },
  {
    table: 'driver_pay_structures',
    category: CATEGORIES.MONEY,
    // Pay structure is fleet config — keep in soft (drivers survive).
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driverPayStructure, t).then((r) => r.count),
  },
  {
    table: 'billing_overrides',
    category: CATEGORIES.MONEY,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.billingOverride, t).then((r) => r.count),
  },

  // ── Routes: events → plan_loads → segments → feedback → plans ────────────
  {
    table: 'route_events',
    category: CATEGORIES.ROUTES,
    soft: 'wipe',
    scope: (t) => ({ plan: { tenantId: t } }),
    run: async (tx, t) => (await tx.routeEvent.deleteMany({ where: { plan: { tenantId: t } } })).count,
  },
  {
    table: 'route_plan_loads',
    category: CATEGORIES.ROUTES,
    soft: 'wipe',
    scope: (t) => ({ plan: { tenantId: t } }),
    run: async (tx, t) => (await tx.routePlanLoad.deleteMany({ where: { plan: { tenantId: t } } })).count,
  },
  {
    table: 'route_segments',
    category: CATEGORIES.ROUTES,
    soft: 'wipe',
    scope: (t) => ({ plan: { tenantId: t } }),
    run: async (tx, t) => (await tx.routeSegment.deleteMany({ where: { plan: { tenantId: t } } })).count,
  },
  {
    table: 'route_plan_feedback',
    category: CATEGORIES.ROUTES,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.routePlanFeedback, t).then((r) => r.count),
  },
  {
    table: 'route_plans',
    category: CATEGORIES.ROUTES,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.routePlan, t).then((r) => r.count),
  },

  // ── EDI (before loads — load has ediTenderId FK) ─────────────────────────
  // Null out Load.ediTenderId is handled in preDeletionNullouts (core.ts).
  {
    table: 'edi_messages',
    category: CATEGORIES.EDI,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.eDIMessage, t).then((r) => r.count),
  },
  {
    table: 'edi_auto_accept_rules',
    category: CATEGORIES.EDI,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.eDIAutoAcceptRule, t).then((r) => r.count),
  },
  {
    table: 'edi_trading_partners',
    category: CATEGORIES.EDI,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.eDITradingPartner, t).then((r) => r.count),
  },

  // ── Loads: legs first (FKs to stops) then load-scoped children ───────────
  // Note: LoadLeg sets null on drivers/vehicles/trailers; safe as-is.
  {
    table: 'load_legs',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.loadLeg, t).then((r) => r.count),
  },
  // Load charges, notes, events, stops, money codes, driver action requests
  // all cascade via Load→ onDelete: Cascade. Delete them explicitly anyway
  // for clean reporting.
  {
    table: 'load_share_links',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.loadShareLink, t).then((r) => r.count),
  },
  {
    table: 'load_charges',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: (t) => ({ load: { tenantId: t } }),
    run: async (tx, t) => (await tx.loadCharge.deleteMany({ where: { load: { tenantId: t } } })).count,
  },
  {
    table: 'load_notes',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: (t) => ({ load: { tenantId: t } }),
    run: async (tx, t) => (await tx.loadNote.deleteMany({ where: { load: { tenantId: t } } })).count,
  },
  {
    table: 'load_events',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: (t) => ({ load: { tenantId: t } }),
    run: async (tx, t) => (await tx.loadEvent.deleteMany({ where: { load: { tenantId: t } } })).count,
  },
  {
    table: 'money_codes',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.moneyCode, t).then((r) => r.count),
  },
  {
    table: 'driver_action_requests',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driverActionRequest, t).then((r) => r.count),
  },
  {
    table: 'load_stops',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: (t) => ({ load: { tenantId: t } }),
    run: async (tx, t) => (await tx.loadStop.deleteMany({ where: { load: { tenantId: t } } })).count,
  },
  {
    table: 'trips',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.trip, t).then((r) => r.count),
  },
  {
    table: 'loads',
    category: CATEGORIES.LOADS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.load, t).then((r) => r.count),
  },

  // ── Lanes ─────────────────────────────────────────────────────────────────
  {
    table: 'lane_rate_history',
    category: CATEGORIES.LANES,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.laneRateHistory, t).then((r) => r.count),
  },
  {
    table: 'lane_rate_targets',
    category: CATEGORIES.LANES,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.laneRateTarget, t).then((r) => r.count),
  },
  {
    table: 'recurring_lane_stops',
    category: CATEGORIES.LANES,
    soft: 'wipe',
    scope: (t) => ({ lane: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.recurringLaneStop.deleteMany({
          where: { lane: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'recurring_lanes',
    category: CATEGORIES.LANES,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.recurringLane, t).then((r) => r.count),
  },

  // ── IFTA ─────────────────────────────────────────────────────────────────
  {
    table: 'ifta_fuel_purchases',
    category: CATEGORIES.IFTA,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.iftaFuelPurchase, t).then((r) => r.count),
  },
  {
    table: 'ifta_state_mileage',
    category: CATEGORIES.IFTA,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.iftaStateMileage, t).then((r) => r.count),
  },
  {
    table: 'ifta_filings',
    category: CATEGORIES.IFTA,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.iftaFiling, t).then((r) => r.count),
  },
  {
    table: 'ifta_quarters',
    category: CATEGORIES.IFTA,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.iftaQuarter, t).then((r) => r.count),
  },

  // ── Customers (after loads) ──────────────────────────────────────────────
  {
    table: 'noa_records',
    category: CATEGORIES.CUSTOMERS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.noaRecord, t).then((r) => r.count),
  },
  {
    table: 'customer_contacts',
    category: CATEGORIES.CUSTOMERS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.customerContact, t).then((r) => r.count),
  },
  {
    table: 'customers',
    category: CATEGORIES.CUSTOMERS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.customer, t).then((r) => r.count),
  },

  // ── Fleet artifacts (before fleet entities) ──────────────────────────────
  {
    table: 'driver_unavailabilities',
    category: CATEGORIES.FLEET_ARTIFACTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driverUnavailability, t).then((r) => r.count),
  },
  {
    table: 'vehicle_unavailabilities',
    category: CATEGORIES.FLEET_ARTIFACTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.vehicleUnavailability, t).then((r) => r.count),
  },
  {
    table: 'trailer_dvirs',
    category: CATEGORIES.FLEET_ARTIFACTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.trailerDVIR, t).then((r) => r.count),
  },
  {
    table: 'vehicle_dvirs',
    category: CATEGORIES.FLEET_ARTIFACTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.vehicleDVIR, t).then((r) => r.count),
  },
  {
    table: 'vehicle_telematics',
    category: CATEGORIES.FLEET_ENTITIES,
    // Telematics snapshot is current state — keep in soft (otherwise we lose
    // GPS/odometer state on re-seeded fleet).
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.vehicleTelematics, t).then((r) => r.count),
  },
  {
    table: 'driver_performance_metrics',
    category: CATEGORIES.FLEET_ARTIFACTS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driverPerformanceMetrics, t).then((r) => r.count),
  },
  {
    table: 'driver_preferences',
    category: CATEGORIES.FLEET_ENTITIES,
    soft: 'keep',
    scope: (t) => ({ driver: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.driverPreferences.deleteMany({
          where: { driver: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'driver_fleet_preferences',
    category: CATEGORIES.FLEET_ENTITIES,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driverFleetPreferences, t).then((r) => r.count),
  },

  // ── Fleet entities (hard only — kept in soft) ────────────────────────────
  {
    table: 'trailers',
    category: CATEGORIES.FLEET_ENTITIES,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.trailer, t).then((r) => r.count),
  },
  {
    table: 'vehicles',
    category: CATEGORIES.FLEET_ENTITIES,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.vehicle, t).then((r) => r.count),
  },
  {
    table: 'drivers',
    category: CATEGORIES.FLEET_ENTITIES,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.driver, t).then((r) => r.count),
  },

  // ── Desk config (kept in soft) ───────────────────────────────────────────
  {
    table: 'desk_responsibilities',
    category: CATEGORIES.DESK_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deskResponsibility, t).then((r) => r.count),
  },
  {
    table: 'desk_agents',
    category: CATEGORIES.DESK_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.deskAgent, t).then((r) => r.count),
  },

  // ── Shield config (kept in soft) ─────────────────────────────────────────
  {
    table: 'shield_custom_rules',
    category: CATEGORIES.SHIELD_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.shieldCustomRule, t).then((r) => r.count),
  },

  // ── Factoring config (kept in soft) ──────────────────────────────────────
  {
    table: 'factoring_contacts',
    category: CATEGORIES.FACTORING_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.factoringContact, t).then((r) => r.count),
  },
  {
    table: 'factoring_companies',
    category: CATEGORIES.FACTORING_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.factoringCompany, t).then((r) => r.count),
  },

  // ── Integration state (wiped in soft) + config (reset timestamps in soft) ─
  {
    table: 'accounting_account_mappings',
    category: CATEGORIES.INTEGRATION_STATE,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.accountingAccountMapping, t).then((r) => r.count),
  },
  {
    table: 'integration_entity_mappings',
    category: CATEGORIES.INTEGRATION_STATE,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.integrationEntityMapping, t).then((r) => r.count),
  },
  {
    table: 'integration_external_entities',
    category: CATEGORIES.INTEGRATION_STATE,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.integrationExternalEntity, t).then((r) => r.count),
  },
  {
    table: 'integration_configs',
    category: CATEGORIES.INTEGRATION_CONFIG,
    soft: 'reset',
    scope: 'tenantId-int',
    run: async (tx, t, _, mode) => {
      if (mode === 'soft') {
        const res = await tx.integrationConfig.updateMany({
          where: whereTenantInt(t),
          data: {
            lastSyncAt: null,
            lastSuccessAt: null,
            lastErrorAt: null,
            lastErrorMessage: null,
          },
        });
        return res.count;
      }
      return (await tx.integrationConfig.deleteMany({ where: whereTenantInt(t) })).count;
    },
  },

  // ── Platform billing (kept in soft — wiping would kill subscription) ─────
  {
    table: 'wallet_transactions',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.walletTransaction, t).then((r) => r.count),
  },
  {
    table: 'wallets',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.wallet, t).then((r) => r.count),
  },
  {
    table: 'billing_invoices',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.billingInvoice, t).then((r) => r.count),
  },
  {
    table: 'payment_methods',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.paymentMethod, t).then((r) => r.count),
  },
  {
    table: 'billing_subscriptions',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.billingSubscription, t).then((r) => r.count),
  },
  {
    table: 'billing_customers',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.billingCustomer, t).then((r) => r.count),
  },
  {
    table: 'add_on_requests',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.addOnRequest, t).then((r) => r.count),
  },
  {
    table: 'tenant_add_on_events',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantAddOnEvent, t).then((r) => r.count),
  },
  {
    table: 'tenant_add_ons',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantAddOn, t).then((r) => r.count),
  },
  {
    table: 'tenant_plan_events',
    category: CATEGORIES.PLATFORM_BILLING,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantPlanEvent, t).then((r) => r.count),
  },

  // ── Tenant config (kept in soft, deleted in hard) ────────────────────────
  {
    table: 'alert_configurations',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.alertConfiguration, t).then((r) => r.count),
  },
  {
    table: 'operations_settings',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.fleetOperationsSettings, t).then((r) => r.count),
  },
  {
    // Runtime idempotency stamps for tenant-local time-of-day jobs, NOT durable
    // config — wipe on reset so digest/audit re-fire cleanly for the test tenant.
    table: 'tenant_job_runs',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.tenantJobRun, t).then((r) => r.count),
  },
  {
    table: 'invoice_settings',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.invoiceSettings, t).then((r) => r.count),
  },
  {
    table: 'email_ingest_settings',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.emailIngestSettings, t).then((r) => r.count),
  },
  {
    table: 'custom_field_definitions',
    category: CATEGORIES.TENANT_CONFIG,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.customFieldDefinition, t).then((r) => r.count),
  },

  // ── Platform users (hard only) ───────────────────────────────────────────
  // LoginEvent is wiped in soft too (it's log data, not identity)
  {
    table: 'login_events',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'wipe',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.loginEvent, t).then((r) => r.count),
  },
  // FK-nulling of user.driverId / userInvitation.driverId happens in
  // preDeletionNullouts (core.ts) ONLY in hard mode (drivers survive in soft).
  {
    table: 'user_preferences',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: (t) => ({ user: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.userPreferences.deleteMany({
          where: { user: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'push_subscriptions',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: (t) => ({ user: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.pushSubscription.deleteMany({
          where: { user: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'api_keys',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: (t) => ({ user: { tenantId: t } }),
    run: async (tx, t) => (await tx.apiKey.deleteMany({ where: { user: { tenantId: t } } })).count,
  },
  {
    table: 'refresh_tokens',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: (t) => ({ user: { tenantId: t } }),
    run: async (tx, t) => (await tx.refreshToken.deleteMany({ where: { user: { tenantId: t } } })).count,
  },
  {
    table: 'super_admin_preferences',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: (t) => ({ user: { tenantId: t } }),
    run: async (tx, t) =>
      (
        await tx.superAdminPreferences.deleteMany({
          where: { user: { tenantId: t } },
        })
      ).count,
  },
  {
    table: 'user_invitations',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.userInvitation, t).then((r) => r.count),
  },
  {
    table: 'users',
    category: CATEGORIES.PLATFORM_USERS,
    soft: 'keep',
    scope: 'tenantId-int',
    run: (tx, t) => deleteByTenantInt(tx.user, t).then((r) => r.count),
  },

  // Tenant row itself — hard mode only. Deleted by core.ts after all of the
  // above, outside the registry iteration to keep the final step explicit.
] as const;

/**
 * Returns the subset of registry entries that should run for a given mode.
 * Soft-mode excludes entries where `soft: 'keep'`. Integration config entries
 * with `soft: 'reset'` always run but the `run` fn branches on mode.
 */
export function entriesForMode(mode: ResetMode): readonly RegistryEntry[] {
  if (mode === 'hard') return REGISTRY;
  return REGISTRY.filter((entry) => entry.soft !== 'keep');
}

/**
 * All table names expected to be handled by the registry. Used by the drift
 * test to verify schema coverage.
 */
export const REGISTERED_TABLES: ReadonlySet<string> = new Set(REGISTRY.map((entry) => entry.table));

export type { PrismaClient };
