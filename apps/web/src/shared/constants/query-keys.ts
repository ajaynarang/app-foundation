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
 */

export const queryKeys = {
  // ─── Fleet ─────────────────────────────────────────────────────────────────
  drivers: {
    root: ['drivers'] as const,
    detail: (id: string) => ['drivers', id] as const,
    hos: (id: string) => ['drivers', id, 'hos'] as const,
  },
  vehicles: {
    root: ['vehicles'] as const,
    detail: (id: string) => ['vehicles', id] as const,
  },
  trailers: {
    root: ['trailers'] as const,
    detail: (id: string) => ['trailers', id] as const,
  },
  trips: {
    root: ['trips'] as const,
    // Distinct 'list'/'detail' segments are REQUIRED: TanStack hashes keys with
    // JSON.stringify, which serializes both `undefined` (list with no params) and
    // `null` (detail id when a closed sheet calls useTripById(null)) to `null` —
    // so ['trips', undefined] and ['trips', null] collide, and a closed detail
    // sheet would read the list envelope ({data,total}). Namespacing prevents it.
    list: (params: Record<string, unknown>) => ['trips', 'list', params] as const,
    detail: (id: string) => ['trips', 'detail', id] as const,
  },
  loads: {
    root: ['loads'] as const,
    list: (params: Record<string, unknown>) => ['loads', params] as const,
    board: ['loads', 'board'] as const,
    detail: (id: string) => ['loads', id] as const,
    revertPreview: (id: string, status: string) => ['loads', id, 'revert-preview', status] as const,
    charges: (id: string) => ['loads', id, 'charges'] as const,
    notes: (id: string) => ['loads', id, 'notes'] as const,
    activity: (id: string) => ['loads', id, 'activity'] as const,
    driverRecommendations: (id: string) => ['loads', id, 'driver-recommendations'] as const,
    legs: (id: string) => ['loads', id, 'legs'] as const,
    exchangeRemovePreview: (id: string, stopId: number) => ['loads', id, 'exchange-remove-preview', stopId] as const,
    driverView: (id: string) => ['loads', id, 'driver-view'] as const,
    laneRate: (origin: string, dest: string, equipment?: string) =>
      ['loads', 'lane-rate', origin, dest, equipment] as const,
  },
  laneRateTargets: {
    root: ['lane-rate-targets'] as const,
  },
  customers: {
    root: ['customers'] as const,
    detail: (id: string) => ['customers', id] as const,
  },
  stops: {
    root: ['stops'] as const,
    list: (params: Record<string, unknown>) => ['stops', 'list', params] as const,
    detail: (id: number) => ['stops', 'detail', id] as const,
    search: (q: string) => ['stops', 'search', q] as const,
  },
  places: {
    root: ['places'] as const,
    autocomplete: (q: string) => ['places', 'autocomplete', q] as const,
  },
  driverPreferences: {
    root: ['driver-preferences'] as const,
  },
  documents: {
    root: ['documents'] as const,
    list: (entityType: string, entityId: number) => ['documents', entityType, entityId] as const,
    downloadUrl: (documentId: number) => ['documents', 'download-url', documentId] as const,
  },
  moneyCodes: {
    root: ['moneyCodes'] as const,
    byLoad: (loadId: string) => ['moneyCodes', loadId] as const,
    insights: (loadId: string) => ['moneyCodes', 'insights', loadId] as const,
  },
  driverActions: {
    root: ['driverActions'] as const,
    byLoad: (loadId: string) => ['driverActions', loadId] as const,
  },
  recurringLanes: {
    root: ['recurring-lanes'] as const,
  },
  customFields: {
    root: ['custom-fields'] as const,
    definitions: (entityType: string) => ['custom-fields', 'definitions', entityType] as const,
    usage: (id: number) => ['custom-fields', 'usage', id] as const,
  },

  // ─── Financials ────────────────────────────────────────────────────────────
  invoices: {
    root: ['invoices'] as const,
    detail: (id: string) => ['invoices', id] as const,
  },
  factoringCompanies: {
    root: ['factoring-companies'] as const,
  },
  factoring: {
    root: ['factoring'] as const,
    byInvoice: (invoiceId: string) => ['factoring', 'invoice', invoiceId] as const,
    summary: (dateRange?: { from?: string; to?: string }) =>
      dateRange && (dateRange.from || dateRange.to)
        ? (['factoring', 'summary', dateRange] as const)
        : (['factoring', 'summary'] as const),
  },
  tenantSettings: {
    root: ['tenants', 'me', 'settings'] as const,
  },
  organization: {
    root: ['tenants', 'me', 'profile'] as const,
  },
  noaRecords: {
    root: ['noa-records'] as const,
    byCustomer: (customerId: number) => ['noa-records', 'customer', customerId] as const,
    inbox: (filters?: Record<string, unknown>) =>
      filters && Object.keys(filters).length > 0
        ? (['noa-records', 'inbox', filters] as const)
        : (['noa-records', 'inbox'] as const),
    forInvoice: (invoiceId: string) => ['noa-records', 'invoice', invoiceId] as const,
  },
  settlements: {
    root: ['settlements'] as const,
    detail: (id: string) => ['settlements', id] as const,
  },
  payStructures: {
    root: ['pay-structures'] as const,
  },
  closeOut: {
    root: ['close-out'] as const,
  },
  invoiceSettings: {
    root: ['invoice-settings'] as const,
  },
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
  accounting: {
    root: ['accounting'] as const,
  },

  // ─── Horizon ───────────────────────────────────────────────────────────────
  horizon: {
    root: ['horizon'] as const,
    week: (weekOf: string) => ['horizon', weekOf] as const,
  },

  // ─── Operations ────────────────────────────────────────────────────────────
  alerts: {
    root: ['alerts'] as const,
    list: (params: Record<string, unknown>) => ['alerts', params] as const,
    detail: (id: string) => ['alerts', id] as const,
    stats: ['alerts', 'stats'] as const,
    smartStats: ['alerts', 'stats', 'smart'] as const,
    grouped: (scope: string, params: Record<string, unknown>) => ['alerts', 'grouped', scope, params] as const,
    briefing: ['alerts', 'briefing'] as const,
  },
  shield: {
    root: ['shield'] as const,
    latest: ['shield', 'latest'] as const,
    scores: ['shield', 'scores'] as const,
    history: (limit: number, offset: number, from?: string, to?: string) =>
      ['shield', 'history', limit, offset, from, to] as const,
    audit: (id: string) => ['shield', 'audit', id] as const,
    findings: (filters: Record<string, unknown>) => ['shield', 'findings', filters] as const,
    rules: ['shield', 'rules'] as const,
  },
  monitoring: {
    root: ['monitoring'] as const,
  },
  commandCenter: {
    root: ['command-center'] as const,
    messageSummary: ['command-center', 'message-summary'] as const,
    mapData: ['command-center', 'map-data'] as const,
    shiftNotes: ['command-center', 'shift-notes'] as const,
  },
  tower: {
    root: ['tower'] as const,
    activeLoadsRoot: ['tower', 'active-loads'] as const,
    activeLoads: (lookaheadHours: number | 'shift') => ['tower', 'active-loads', lookaheadHours] as const,
    riskScores: ['tower', 'risk-scores'] as const,
    wireRoot: ['tower', 'wire'] as const,
    wire: (tab: string, sinceBucket: string) => ['tower', 'wire', tab, sinceBucket] as const,
    driverConversations: ['tower', 'driver-conversations'] as const,
    driverThread: (driverId: string) => ['tower', 'driver-thread', driverId] as const,
  },
  notifications: {
    root: ['notifications'] as const,
  },
  support: {
    root: ['support'] as const,
  },

  // ─── Integrations ──────────────────────────────────────────────────────────
  integrations: {
    root: ['integrations'] as const,
  },
  integrationHealth: {
    root: ['integration-health'] as const,
  },
  edi: {
    tenders: ['edi', 'tenders'] as const,
    rules: ['edi', 'rules'] as const,
    partners: ['edi', 'partners'] as const,
    messages: ['edi', 'messages'] as const,
  },
  loadBoard: {
    search: ['load-board', 'search'] as const,
    searchWithParams: (params: Record<string, unknown>) => ['load-board', 'search', params] as const,
    searchHistory: ['load-board', 'search-history'] as const,
    savedSearches: ['load-board', 'saved-searches'] as const,
  },

  // ─── Platform ──────────────────────────────────────────────────────────────
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
    driver: ['preferences', 'driver'] as const,
  },
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

  // ─── Platform (misc) ───────────────────────────────────────────────────────
  referenceData: {
    root: ['reference-data'] as const,
  },

  // ─── Email Intake ──────────────────────────────────────────────────────────
  emailIngest: {
    root: ['email-ingest'] as const,
    threads: (params?: Record<string, unknown>) => ['email-ingest', 'threads', params] as const,
    threadDetail: (id: string) => ['email-ingest', 'threads', id] as const,
    settings: ['email-ingest', 'settings'] as const,
  },

  // ─── Admin ─────────────────────────────────────────────────────────────────
  customer: {
    loads: ['customer', 'loads'] as const,
  },

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
    fuelCardTypes: ['admin', 'fuel-card-types'] as const,
    brandAcceptance: ['admin', 'brand-acceptance'] as const,
  },

  // ─── AI Spend (super-admin) ──────────────────────────────────────────────
  aiSpend: {
    root: ['ai-spend'] as const,
    tenants: (days: number) => ['ai-spend', 'tenants', days] as const,
    bySurface: (tenantId: number, days: number) => ['ai-spend', 'by-surface', tenantId, days] as const,
    invocations: (tenantId: number, surface: string | undefined) =>
      ['ai-spend', 'invocations', tenantId, surface ?? 'all'] as const,
    budget: (tenantId: number) => ['ai-spend', 'budget', tenantId] as const,
    costVsQuota: (tenantId: number, days: number) => ['ai-spend', 'cost-vs-quota', tenantId, days] as const,
  },

  // ─── Driver ────────────────────────────────────────────────────────────────
  driverMessages: {
    root: ['driver-messages'] as const,
    unread: ['driver-messages', 'unread'] as const,
  },
  loadMessages: {
    root: ['load-messages'] as const,
    unreadCount: ['load-messages', 'unread-count'] as const,
  },
  driverTimeline: {
    root: ['driver-timeline'] as const,
  },
  dispatchBoard: {
    root: ['dispatch-board'] as const,
  },

  // ─── Routing ──────────────────────────────────────────────────────────────
  routePlans: {
    root: ['route-plans'] as const,
    list: (params?: Record<string, unknown>) => ['route-plans', params ?? {}] as const,
    detail: (id: string) => ['route-plans', id] as const,
    geojson: (id: string) => ['route-plans', id, 'geojson'] as const,
    driverActive: ['driver-active-route-plan'] as const,
  },

  // ─── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    root: ['analytics'] as const,
  },

  // ─── IFTA ──────────────────────────────────────────────────────────────────
  ifta: {
    root: ['ifta'] as const,
  },

  // ─── Home ──────────────────────────────────────────────────────────────
  home: {
    root: ['home'] as const,
    pulse: ['home', 'pulse'] as const,
    recentLoads: ['home', 'recent-loads'] as const,
    search: (q: string) => ['home', 'search', q] as const,
  },

  // ─── Sally's Desk (agentic runtime) ───────────────────────────────────
  desk: {
    root: ['desk'] as const,
    // Root-level keys — use these for invalidation when a mutation affects
    // every variant of a list (all param combinations at once).
    episodesRoot: ['desk', 'episodes'] as const,
    approvalsRoot: ['desk', 'approvals'] as const,
    handledRoot: ['desk', 'handled'] as const,
    pendingRoot: ['desk', 'pending'] as const,
    performanceRoot: ['desk', 'performance'] as const,
    reviewItemsRoot: ['desk', 'review-items'] as const,
    agents: () => ['desk', 'agents'] as const,
    agent: (key: string) => ['desk', 'agents', key] as const,
    agentActivity: (key: string, window: string) => ['desk', 'agents', key, 'activity', window] as const,
    eligibleSupervisors: () => ['desk', 'agents', 'eligible-supervisors'] as const,
    responsibilities: () => ['desk', 'responsibilities'] as const,
    responsibility: (key: string) => ['desk', 'responsibilities', key] as const,
    responsibilityUISpec: (key: string) => ['desk', 'responsibilities', key, 'ui-spec'] as const,
    schedule: () => ['desk', 'schedule'] as const,
    episodes: (params?: Record<string, unknown>) => ['desk', 'episodes', params ?? null] as const,
    episode: (id: string) => ['desk', 'episodes', id] as const,
    approvals: (params?: Record<string, unknown>) => ['desk', 'approvals', params ?? null] as const,
    handoffCounts: () => ['desk', 'approvals', 'counts'] as const,
    handled: (params?: Record<string, unknown>) => ['desk', 'handled', params ?? null] as const,
    suppressions: (params?: Record<string, unknown>) => ['desk', 'suppressions', params ?? null] as const,
    suppression: (id: string) => ['desk', 'suppressions', id] as const,
    memories: (params?: Record<string, unknown>) => ['desk', 'memories', params ?? null] as const,
  },

  // ─── Sally AI ──────────────────────────────────────────────────────────
  sallyAi: {
    root: ['ai'] as const,
    capabilities: (mode: string) => ['ai', 'capabilities', mode] as const,
    mentionSearch: (query: string) => ['ai', 'mention-search', query] as const,
  },
} as const;
