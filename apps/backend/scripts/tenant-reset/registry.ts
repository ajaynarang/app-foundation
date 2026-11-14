/**
 * Tenant reset registry: every tenant-owned table, in the order it is deleted.
 *
 * One entry per table. Coverage is held by `__tests__/registry.spec.ts` against the tenant-isolation registry
 * (`@appshore/platform/infrastructure/database/rls-registry.ts` plus the app's `app-rls-registry.ts`): every table
 * classed `tenant`, `tenant_nullable` or `child` must appear here, and no `catalog`, `platform`, `root` or
 * `identity_system` table may, so a reset never reaches a platform row. A new model therefore fails the spec until
 * it is registered here.
 *
 * Order is foreign-key order: a table comes before every table it points at with a required relation. The tenant row
 * itself is deleted last by `core.ts`, in hard mode only. Children that cascade from a registered parent are still
 * listed, so a dry run counts them.
 *
 * Two modes:
 *   soft  deletes every `soft: 'wipe'` entry and keeps the tenant, its users and memberships, its configuration
 *         and its billing.
 *   hard  deletes every entry, then the tenant row.
 */
export type ResetMode = 'soft' | 'hard';
export type SoftBehaviour = 'wipe' | 'keep';

/** The tenant a reset runs for, plus the users a hard reset deletes. Computed before any delete. */
export interface ResetContext {
  /** `Tenant.id`, the numeric key every tenant column holds. */
  readonly tenantDbId: number;
  /** `Tenant.tenantId`, the public string id. */
  readonly tenantId: string;
  /**
   * Users whose home workspace is this tenant and who belong to no other workspace. A hard reset deletes them and
   * their own rows. A user homed here with another membership is moved to that workspace instead (`core.ts`).
   */
  readonly deletableUserIds: readonly number[];
}

export const CATEGORIES = {
  ACTIVITY: 'activity',
  AI: 'ai',
  BILLING: 'billing',
  CONFIG: 'config',
  DESK: 'desk',
  INTEGRATIONS: 'integrations',
  JOBS_EVENTS: 'jobs_events',
  MESSAGING: 'messaging',
  SUPPORT: 'support',
  USERS: 'users',
} as const;
export type Category = (typeof CATEGORIES)[keyof typeof CATEGORIES];

/** The Prisma delegate surface a reset uses: count for the dry run, deleteMany for the run. */
export interface ResetDelegate {
  count(args: { where: Record<string, unknown> }): Promise<number>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<{ count: number }>;
}

export interface RegistryEntry {
  /** The table name (`@@map`). */
  readonly table: string;
  /** The Prisma client delegate for it (`prisma.<delegate>`). */
  readonly delegate: string;
  readonly category: Category;
  readonly soft: SoftBehaviour;
  /** The rows of this tenant. Every `where` is scoped by the tenant's id or the deletable users; never empty. */
  readonly where: (ctx: ResetContext) => Record<string, unknown>;
}

const { ACTIVITY, AI, BILLING, CONFIG, DESK, INTEGRATIONS, JOBS_EVENTS, MESSAGING, SUPPORT, USERS } = CATEGORIES;

const byTenant = (ctx: ResetContext) => ({ tenantId: ctx.tenantDbId });
const byUser = (ctx: ResetContext) => ({ userId: { in: [...ctx.deletableUserIds] } });

function entry(
  table: string,
  delegate: string,
  category: Category,
  soft: SoftBehaviour,
  where: (ctx: ResetContext) => Record<string, unknown> = byTenant,
): RegistryEntry {
  return { table, delegate, category, soft, where };
}

export const REGISTRY: readonly RegistryEntry[] = Object.freeze([
  // ── Desk runtime: steps and approvals belong to an episode; episodes and memories point at agents ────────────
  entry('desk_approvals', 'deskApproval', DESK, 'wipe', (ctx) => ({ episode: { tenantId: ctx.tenantDbId } })),
  entry('desk_episode_steps', 'deskEpisodeStep', DESK, 'wipe', (ctx) => ({ episode: { tenantId: ctx.tenantDbId } })),
  entry('desk_memories', 'deskMemory', DESK, 'wipe'),
  entry('desk_entity_suppressions', 'deskEntitySuppression', DESK, 'wipe'),
  entry('desk_episodes', 'deskEpisode', DESK, 'wipe'),

  // ── AI activity ──────────────────────────────────────────────────────────────────────────────────────────────
  entry('ai_invocations', 'aiInvocation', AI, 'wipe'),
  entry('agent_invocation_logs', 'agentInvocationLog', AI, 'wipe'),
  entry('hitl_challenges', 'hitlChallenge', AI, 'wipe'),

  // ── Support and feedback: tickets point at conversations, so they go first ───────────────────────────────────
  entry('support_ticket_messages', 'supportTicketMessage', SUPPORT, 'wipe', (ctx) => ({
    ticket: { tenantId: ctx.tenantDbId },
  })),
  entry('support_tickets', 'supportTicket', SUPPORT, 'wipe'),
  entry('feedback', 'feedback', SUPPORT, 'wipe'),

  // ── AI chat ──────────────────────────────────────────────────────────────────────────────────────────────────
  entry('conversation_messages', 'conversationMessage', AI, 'wipe', (ctx) => ({
    conversation: { tenantId: ctx.tenantDbId },
  })),
  entry('conversation_sessions', 'conversationSession', AI, 'wipe'),
  entry('conversations', 'conversation', AI, 'wipe'),

  // ── Notifications and outbound: notifications point at invitations ──────────────────────────────────────────
  entry('notifications', 'notification', MESSAGING, 'wipe'),
  entry('notification_deliveries', 'notificationDelivery', MESSAGING, 'wipe'),
  entry('outbound_suppressions', 'outboundSuppression', MESSAGING, 'wipe'),

  // ── Jobs, events and timers ──────────────────────────────────────────────────────────────────────────────────
  entry('jobs', 'job', JOBS_EVENTS, 'wipe'),
  entry('tenant_job_runs', 'tenantJobRun', JOBS_EVENTS, 'wipe'),
  entry('dead_letter_logs', 'deadLetterLog', JOBS_EVENTS, 'wipe'),
  entry('deadlines', 'deadline', JOBS_EVENTS, 'wipe'),
  entry('domain_event_log', 'domainEventLog', JOBS_EVENTS, 'wipe'),
  // The outbox keeps the tenant as the event carries it: the numeric id as a string, or the public id.
  entry('outbox_events', 'outboxEvent', JOBS_EVENTS, 'wipe', (ctx) => ({
    tenantId: { in: [String(ctx.tenantDbId), ctx.tenantId] },
  })),
  entry('webhook_delivery_logs', 'webhookDeliveryLog', JOBS_EVENTS, 'wipe', (ctx) => ({
    subscription: { tenantId: ctx.tenantDbId },
  })),

  // ── Sign-in history ──────────────────────────────────────────────────────────────────────────────────────────
  entry('login_events', 'loginEvent', ACTIVITY, 'wipe'),

  // ── Integration state (synced copies and id mappings); the connection itself is config ──────────────────────
  entry('integration_entity_mappings', 'integrationEntityMapping', INTEGRATIONS, 'wipe'),
  entry('integration_external_entities', 'integrationExternalEntity', INTEGRATIONS, 'wipe'),

  // ── Kept by soft mode from here on ───────────────────────────────────────────────────────────────────────────

  // Desk configuration: responsibilities point at agents.
  entry('desk_responsibilities', 'deskResponsibility', DESK, 'keep'),
  entry('desk_agents', 'deskAgent', DESK, 'keep'),

  // Workspace configuration.
  entry('integration_configs', 'integrationConfig', INTEGRATIONS, 'keep'),
  entry('webhook_subscriptions', 'webhookSubscription', CONFIG, 'keep'),
  entry('oauth_clients', 'oAuthClient', CONFIG, 'keep'),
  entry('tenant_ai_budgets', 'tenantAiBudget', CONFIG, 'keep'),
  entry('ai_credentials', 'aiCredential', CONFIG, 'keep'),
  entry('tenant_ai_sub_keys', 'tenantAiSubKey', CONFIG, 'keep'),
  // Counters keep numbering going: a number once handed out is never handed out again.
  entry('tenant_counters', 'tenantCounter', CONFIG, 'keep'),

  // Billing: transactions point at the wallet; invoices, payment methods and subscriptions at the customer.
  entry('wallet_transactions', 'walletTransaction', BILLING, 'keep'),
  entry('wallets', 'wallet', BILLING, 'keep'),
  entry('billing_invoices', 'billingInvoice', BILLING, 'keep'),
  entry('payment_methods', 'paymentMethod', BILLING, 'keep'),
  entry('billing_subscriptions', 'billingSubscription', BILLING, 'keep'),
  entry('billing_customers', 'billingCustomer', BILLING, 'keep'),
  entry('tenant_add_ons', 'tenantAddOn', BILLING, 'keep'),
  entry('tenant_plan_events', 'tenantPlanEvent', BILLING, 'keep'),

  // Users and their devices. Invitations point at the inviting user; the users go last.
  entry('push_subscriptions', 'pushSubscription', USERS, 'keep'),
  entry('notification_devices', 'notificationDevice', USERS, 'keep'),
  entry('user_invitations', 'userInvitation', USERS, 'keep'),
  entry('workspace_members', 'workspaceMember', USERS, 'keep'),
  entry('api_keys', 'apiKey', USERS, 'keep', byUser),
  entry('user_preferences', 'userPreferences', USERS, 'keep', byUser),
  entry('whatsapp_consents', 'whatsAppConsent', USERS, 'keep', byUser),
  entry('users', 'user', USERS, 'keep', (ctx) => ({ id: { in: [...ctx.deletableUserIds] } })),
]);

/** Soft mode skips the `keep` entries; hard mode runs them all. */
export function entriesForMode(mode: ResetMode): readonly RegistryEntry[] {
  if (mode === 'hard') return REGISTRY;
  return REGISTRY.filter((e) => e.soft === 'wipe');
}

export const REGISTERED_TABLES: ReadonlySet<string> = new Set(REGISTRY.map((e) => e.table));

/**
 * Mastra keeps the assistant's chat memory in its own tables (not Prisma models), under the resource id
 * `tenant-<Tenant.id>-user-<userId>` (`assistant.service.ts`, `base.agent.ts`). Both modes delete it, like the
 * conversations. A table that does not exist yet (Mastra creates them on first use) is skipped.
 */
export const MASTRA_MEMORY_TABLES: readonly { table: string; column: string }[] = Object.freeze([
  { table: 'mastra_messages', column: 'resourceId' },
  { table: 'mastra_threads', column: 'resourceId' },
  { table: 'mastra_resources', column: 'id' },
  { table: 'mastra_observational_memory', column: 'resourceId' },
]);

/** `tenant-12-user-%`: the trailing `-user-` keeps tenant 1 from matching tenant 12. */
export function mastraResourcePattern(tenantDbId: number): string {
  return `tenant-${tenantDbId}-user-%`;
}
