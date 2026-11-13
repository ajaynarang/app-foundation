/**
 * Every table in `foundation.prisma`, classified for tenant isolation (design item 20). Nothing enforces it yet: no
 * row-level security policy exists. It is the list the later enforcement work starts from, and
 * `apps/backend/src/architecture/rls-registry.spec.ts` fails `pnpm test` when a model has no class, so every new
 * table decides now. An app classifies its own `app.prisma` tables in
 * `apps/backend/src/platform-glue/database/app-rls-registry.ts`, merged with these by `mergeRlsRegistry`.
 *
 * Classes:
 *   tenant           direct `tenantId Int` (NOT NULL)
 *   tenant_nullable  `tenantId Int?` (NULL is a platform or pre-tenant row: a super-admin, a login before a tenant)
 *   child            no tenant column; belongs to a tenant through `parent`
 *   identity         no tenant column; scoped through the user it belongs to (`parent` is `users`)
 *   identity_system  credential and token tables, read before any tenant is known; never readable by tenant code.
 *                    A `tenantId` it carries (a refresh token's session workspace) is a value, not its scope.
 *   catalog          global reference data the app reads (plans, flags, prices)
 *   platform         platform-owned rows (allow-lists, broadcasts); super-admin only
 *   root             `tenants` itself
 *
 * Tables outside Prisma (`_prisma_migrations`, `mastra_*`) are external and never listed: `EXTERNAL_TABLE_PATTERNS`.
 * Enforcement groups are not part of this registry; a group is a unit of enforcement and arrives with it.
 */
export const RLS_CLASS = {
  TENANT: 'tenant',
  TENANT_NULLABLE: 'tenant_nullable',
  CHILD: 'child',
  IDENTITY: 'identity',
  IDENTITY_SYSTEM: 'identity_system',
  CATALOG: 'catalog',
  PLATFORM: 'platform',
  ROOT: 'root',
} as const;
export type RlsClass = (typeof RLS_CLASS)[keyof typeof RLS_CLASS];

export interface RlsTableEntry {
  class: RlsClass;
  /** The table the tenant comes from: required for `child` and `identity`, refused for every other class. */
  parent?: string;
  /**
   * Set only when the tenant column is a string, not the tenant's numeric id, with the reason. Enforcement needs the
   * numeric id, so such a table changes its column first.
   */
  stringTenantColumn?: string;
}

const { TENANT, TENANT_NULLABLE, CHILD, IDENTITY, IDENTITY_SYSTEM, CATALOG, PLATFORM, ROOT } = RLS_CLASS;

const tenant: RlsTableEntry = { class: TENANT };
const nullable: RlsTableEntry = { class: TENANT_NULLABLE };
const child = (parent: string): RlsTableEntry => ({ class: CHILD, parent });
const identity: RlsTableEntry = { class: IDENTITY, parent: 'users' };
const identitySystem: RlsTableEntry = { class: IDENTITY_SYSTEM };
const catalog: RlsTableEntry = { class: CATALOG };
const platform: RlsTableEntry = { class: PLATFORM };

export const FOUNDATION_RLS_REGISTRY: Readonly<Record<string, RlsTableEntry>> = {
  // ── root ──────────────────────────────────────────────────────────────────
  tenants: { class: ROOT },

  // ── tenant: tenantId Int ──────────────────────────────────────────────────
  agent_invocation_logs: tenant,
  ai_credentials: tenant,
  ai_invocations: tenant,
  billing_customers: tenant,
  billing_invoices: tenant,
  billing_subscriptions: tenant,
  dead_letter_logs: tenant,
  deadlines: tenant,
  desk_agents: tenant,
  desk_entity_suppressions: tenant,
  desk_episodes: tenant,
  desk_memories: tenant,
  desk_responsibilities: tenant,
  domain_event_log: tenant,
  feedback: tenant,
  hitl_challenges: tenant,
  integration_configs: tenant,
  integration_entity_mappings: tenant,
  integration_external_entities: tenant,
  jobs: tenant,
  notification_deliveries: tenant,
  notification_devices: tenant,
  payment_methods: tenant,
  push_subscriptions: tenant,
  support_tickets: tenant,
  tenant_add_ons: tenant,
  tenant_ai_budgets: tenant,
  tenant_ai_sub_keys: tenant,
  tenant_counters: tenant,
  tenant_job_runs: tenant,
  tenant_plan_events: tenant,
  user_invitations: tenant,
  wallet_transactions: tenant,
  wallets: tenant,
  webhook_subscriptions: tenant,
  workspace_members: tenant,
  // The outbox keeps the emitter's tenant as the event's wire value (`DomainEvent.tenantId`), not a foreign key.
  outbox_events: {
    class: TENANT,
    stringTenantColumn: "the event's own tenant string (the emitter's id as the event carries it), not a foreign key",
  },

  // ── tenant_nullable: tenantId Int? ────────────────────────────────────────
  conversation_sessions: nullable,
  conversations: nullable,
  login_events: nullable,
  notifications: nullable,
  oauth_clients: nullable,
  outbound_suppressions: nullable,
  users: nullable,

  // ── child: tenant through a parent ────────────────────────────────────────
  conversation_messages: child('conversations'),
  desk_approvals: child('desk_episodes'),
  desk_episode_steps: child('desk_episodes'),
  support_ticket_messages: child('support_tickets'),
  webhook_delivery_logs: child('webhook_subscriptions'),

  // ── identity: scoped through the user ─────────────────────────────────────
  api_keys: identity,
  user_preferences: identity,
  whatsapp_consents: identity,

  // ── identity_system: tokens and credentials ───────────────────────────────
  oauth_access_tokens: identitySystem,
  oauth_authorization_codes: identitySystem,
  oauth_refresh_tokens: identitySystem,
  password_reset_tokens: identitySystem,
  refresh_tokens: identitySystem,
  super_admin_preferences: identitySystem,

  // ── catalog ───────────────────────────────────────────────────────────────
  add_ons: catalog,
  feature_flags: catalog,
  job_schedules: catalog,
  knowledge_documents: catalog,
  model_pricing: catalog,
  plan_configs: catalog,
  plan_entitlements: catalog,
  vendor_configs: catalog,

  // ── platform ──────────────────────────────────────────────────────────────
  announcements: platform,
  outbound_allow_entries: platform,
  processed_billing_events: platform,
};

/** Tables in the database that Prisma does not manage. Never registered. */
export const EXTERNAL_TABLE_PATTERNS: readonly RegExp[] = [/^mastra_/, /^_prisma_migrations$/];

export function isExternalTable(table: string): boolean {
  return EXTERNAL_TABLE_PATTERNS.some((re) => re.test(table));
}

/** The foundation's tables plus the app's. A table classified twice fails at load. */
export function mergeRlsRegistry(
  app: Readonly<Record<string, RlsTableEntry>>,
  foundation: Readonly<Record<string, RlsTableEntry>> = FOUNDATION_RLS_REGISTRY,
): Readonly<Record<string, RlsTableEntry>> {
  for (const table of Object.keys(app)) {
    if (Object.prototype.hasOwnProperty.call(foundation, table)) {
      throw new Error(`RLS registry: "${table}" is classified by the foundation and again by the app.`);
    }
  }
  return { ...foundation, ...app };
}
