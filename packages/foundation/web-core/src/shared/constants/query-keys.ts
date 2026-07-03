/**
 * TanStack Query keys — single source of truth.
 *
 * Centralizing query keys ensures:
 * - Consistent invalidation across features
 * - No duplicate key definitions across hooks
 * - Easy to find all queries for a given entity
 *
 * Pattern: Each domain gets a factory object with a `root` key and sub-keys.
 * Hooks should import from here and NEVER define local query key constants.
 *
 * This is the GENERIC platform set — preferences, feature flags, API keys,
 * OAuth clients, notifications, plans, organization, billing, AI/conversations,
 * onboarding, and the super-admin consoles. Add your own domain namespaces
 * alongside these as you build features.
 */

export const queryKeys = {
  // ─── Notifications ──────────────────────────────────────────────────────
  notifications: {
    root: ['notifications'] as const,
  },

  // ─── Support ────────────────────────────────────────────────────────────
  support: {
    root: ['support'] as const,
  },

  // ─── Integrations ──────────────────────────────────────────────────────
  integrations: {
    root: ['integrations'] as const,
  },
  integrationHealth: {
    root: ['integration-health'] as const,
  },

  // ─── Organization / tenant ──────────────────────────────────────────────
  tenantSettings: {
    root: ['tenants', 'me', 'settings'] as const,
  },
  organization: {
    root: ['tenants', 'me', 'profile'] as const,
  },

  // ─── Billing ────────────────────────────────────────────────────────────
  billing: {
    root: ['billing'] as const,
    wallet: ['billing', 'wallet'] as const,
    invoices: ['billing', 'invoices'] as const,
    paymentMethods: ['billing', 'payment-methods'] as const,
    transactions: ['billing', 'wallet', 'transactions'] as const,
  },
  wallet: {
    root: ['wallet'] as const,
  },

  // ─── Platform / entitlements ────────────────────────────────────────────
  onboarding: {
    root: ['onboarding'] as const,
    status: ['onboarding', 'status'] as const,
  },
  plans: {
    root: ['my-plan'] as const,
  },
  addOns: {
    catalog: ['add-ons', 'catalog'] as const,
    myAddOns: ['add-ons', 'my-add-ons'] as const,
    status: (slug: string) => ['add-ons', 'status', slug] as const,
  },
  featureFlags: {
    root: ['feature-flags'] as const,
    detail: (key: string) => ['feature-flags', key] as const,
    enabled: (key: string) => ['feature-flags', key, 'enabled'] as const,
  },
  preferences: {
    root: ['preferences'] as const,
    user: ['preferences', 'user'] as const,
    operations: ['preferences', 'operations'] as const,
  },

  // ─── API keys / OAuth clients / agents ──────────────────────────────────
  apiKeys: {
    root: ['api-keys'] as const,
    list: (tenantId?: number) =>
      tenantId === undefined ? (['api-keys', 'list'] as const) : (['api-keys', 'list', tenantId] as const),
  },
  webhooks: {
    root: ['webhooks'] as const,
  },
  oauthClients: {
    root: ['oauth-clients'] as const,
    list: (tenantId?: number) =>
      tenantId === undefined ? (['oauth-clients', 'list'] as const) : (['oauth-clients', 'list', tenantId] as const),
  },
  agentActivity: {
    root: ['agent-activity'] as const,
    list: (params: { principalKind: string; principalId: string; filter: string }) =>
      ['agent-activity', params.principalKind, params.principalId, params.filter] as const,
  },
  loginActivity: {
    root: ['login-activity'] as const,
    list: (scope: 'tenant' | 'super', params: Record<string, unknown>) =>
      ['login-activity', scope, 'list', params] as const,
    summary: (scope: 'tenant' | 'super', params: Record<string, unknown>) =>
      ['login-activity', scope, 'summary', params] as const,
  },

  // ─── Admin (super-admin consoles) ───────────────────────────────────────
  admin: {
    addOnRequests: ['admin', 'add-on-requests'] as const,
    tenants: ['admin', 'tenants'] as const,
    broadcasts: ['admin', 'broadcasts'] as const,
    plans: ['admin', 'plans'] as const,
    tenantBilling: (tenantId: string) => ['admin-tenant-billing', tenantId] as const,
    tenantPlan: ['tenant-plan'] as const,
    feedback: ['admin', 'feedback'] as const,
    billingTenants: ['admin', 'billing', 'tenants'] as const,
    billingPlans: ['admin', 'billing', 'plans'] as const,
  },

  // ─── AI spend (super-admin) ─────────────────────────────────────────────
  aiSpend: {
    root: ['ai-spend'] as const,
    tenants: (days: number) => ['ai-spend', 'tenants', days] as const,
    bySurface: (tenantId: number, days: number) => ['ai-spend', 'by-surface', tenantId, days] as const,
    invocations: (tenantId: number, surface: string | undefined) =>
      ['ai-spend', 'invocations', tenantId, surface ?? 'all'] as const,
    budget: (tenantId: number) => ['ai-spend', 'budget', tenantId] as const,
    costVsQuota: (tenantId: number, days: number) => ['ai-spend', 'cost-vs-quota', tenantId, days] as const,
  },

  // ─── AI / conversations ─────────────────────────────────────────────────
  ai: {
    root: ['ai'] as const,
    capabilities: (mode: string) => ['ai', 'capabilities', mode] as const,
    mentionSearch: (query: string) => ['ai', 'mention-search', query] as const,
  },
  // Back-compat alias for the chat feature, which imports `queryKeys.assistantAi`.
  assistantAi: {
    root: ['ai'] as const,
    capabilities: (mode: string) => ['ai', 'capabilities', mode] as const,
    mentionSearch: (query: string) => ['ai', 'mention-search', query] as const,
  },
  conversations: {
    root: ['conversations'] as const,
    detail: (id: string) => ['conversations', id] as const,
    messages: (id: string) => ['conversations', id, 'messages'] as const,
  },

  // ─── Desk (agentic runtime — schedule console) ──────────────────────────
  desk: {
    root: ['desk'] as const,
    schedule: () => ['desk', 'schedule'] as const,
  },
} as const;
