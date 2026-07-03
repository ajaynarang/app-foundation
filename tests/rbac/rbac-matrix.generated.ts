/**
 * Platform RBAC Permission Matrix — AUTO-GENERATED
 *
 * DO NOT EDIT MANUALLY. Regenerate with:
 *   npx tsx scripts/generate-rbac-matrix.ts --write
 *
 * Generated: 2026-07-03T09:56:11.533Z
 * Source: 0 domains, 86 endpoints
 * Controllers scanned: 256 total endpoints across all controllers
 *
 * Status codes:
 *   200      = allowed (request succeeds)
 *   403      = forbidden (role not permitted). Test also accepts 404.
 *   null     = skip (needs entity ID or tested in workflows)
 */

export interface RbacEntry {
  method: string;
  path: string;
  description: string;
  domain: string;
  featureGate: string | null;
  expectations: Record<string, number | null>;
}

export const RBAC_MATRIX: RbacEntry[] = [

  // ═══════════════════════════════════════════════════════
  // SUPER-ADMIN
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/admin/ai-spend/tenants',
    description: 'AdminAiSpendController: GET /admin/ai-spend/tenants',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/events',
    description: 'AdminEventsController: GET /admin/events',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/events/stats',
    description: 'AdminEventsController: GET /admin/events/stats',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/events/volume',
    description: 'AdminEventsController: GET /admin/events/volume',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/events/webhooks/health',
    description: 'AdminEventsController: GET /admin/events/webhooks/health',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/jobs',
    description: 'AdminJobsController: GET /admin/jobs',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/schedules',
    description: 'AdminSchedulesController: GET /admin/schedules',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },

  // ═══════════════════════════════════════════════════════
  // AI
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/agent-activity',
    description: 'AgentActivityController: GET /agent-activity',
    domain: 'ai',
    featureGate: null,
    expectations: { MEMBER: 400, ADMIN: 400, OWNER: 400, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/developer/scopes',
    description: 'DeveloperScopesController: GET /developer/scopes',
    domain: 'ai',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },

  // ═══════════════════════════════════════════════════════
  // BILLING
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/admin/billing/revenue',
    description: 'BillingAdminController: GET /admin/billing/revenue',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/billing/invoices',
    description: 'BillingController: GET /billing/invoices',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/billing/overview',
    description: 'BillingController: GET /billing/overview',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/billing/payment-methods',
    description: 'BillingController: GET /billing/payment-methods',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/billing/wallet',
    description: 'BillingController: GET /billing/wallet',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/billing/wallet/transactions',
    description: 'BillingController: GET /billing/wallet/transactions',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/cancel',
    description: 'BillingController: POST /billing/cancel',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/checkout',
    description: 'BillingController: POST /billing/checkout',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/downgrade',
    description: 'BillingController: POST /billing/downgrade',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/payment-methods/setup',
    description: 'BillingController: POST /billing/payment-methods/setup',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'PATCH', path: '/billing/quantity',
    description: 'BillingController: PATCH /billing/quantity',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/reactivate',
    description: 'BillingController: POST /billing/reactivate',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/upgrade',
    description: 'BillingController: POST /billing/upgrade',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'PATCH', path: '/billing/wallet/auto-reload',
    description: 'BillingController: PATCH /billing/wallet/auto-reload',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/billing/wallet/top-up',
    description: 'BillingController: POST /billing/wallet/top-up',
    domain: 'billing',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // DESK
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/desk/agents',
    description: 'DeskAgentController: GET /desk/agents',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/agents/eligible-supervisors',
    description: 'DeskAgentController: GET /desk/agents/eligible-supervisors',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/approvals',
    description: 'ApprovalController: GET /desk/approvals',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/approvals/counts',
    description: 'ApprovalController: GET /desk/approvals/counts',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/episodes',
    description: 'DeskEpisodeController: GET /desk/episodes',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/episodes/handled',
    description: 'DeskEpisodeController: GET /desk/episodes/handled',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/memories',
    description: 'DeskMemoryController: GET /desk/memories',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/responsibilities',
    description: 'DeskResponsibilityController: GET /desk/responsibilities',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/desk/schedule',
    description: 'DeskScheduleController: GET /desk/schedule',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'PATCH', path: '/desk/schedule',
    description: 'DeskScheduleController: PATCH /desk/schedule',
    domain: 'desk',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: null },
  },

  // ═══════════════════════════════════════════════════════
  // FEEDBACK
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/admin/feedback',
    description: 'FeedbackAdminController: GET /admin/feedback',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/feedback/stats',
    description: 'FeedbackAdminController: GET /admin/feedback/stats',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/feedback/tenants',
    description: 'FeedbackAdminController: GET /admin/feedback/tenants',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/feedback',
    description: 'FeedbackController: GET /feedback',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/admin/feedback/bulk-categorize',
    description: 'FeedbackAdminController: POST /admin/feedback/bulk-categorize',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: null },
  },
  {
    method: 'POST', path: '/feedback',
    description: 'FeedbackController: POST /feedback',
    domain: 'feedback',
    featureGate: null,
    expectations: { MEMBER: null, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // INTEGRATIONS
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/integrations',
    description: 'IntegrationsController: GET /integrations',
    domain: 'integrations',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/integrations/health',
    description: 'IntegrationsController: GET /integrations/health',
    domain: 'integrations',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/integrations/sync-history',
    description: 'IntegrationsController: GET /integrations/sync-history',
    domain: 'integrations',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/integrations/vendors',
    description: 'IntegrationsController: GET /integrations/vendors',
    domain: 'integrations',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/integrations',
    description: 'IntegrationsController: POST /integrations',
    domain: 'integrations',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/notifications',
    description: 'NotificationsController: GET /notifications',
    domain: 'notifications',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/notifications/count',
    description: 'NotificationsController: GET /notifications/count',
    domain: 'notifications',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/notifications/dismiss-all-read',
    description: 'NotificationsController: POST /notifications/dismiss-all-read',
    domain: 'notifications',
    featureGate: null,
    expectations: { MEMBER: null, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/notifications/mark-all-read',
    description: 'NotificationsController: POST /notifications/mark-all-read',
    domain: 'notifications',
    featureGate: null,
    expectations: { MEMBER: null, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // SUPPORT
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/support/admin/stats',
    description: 'SupportController: GET /support/admin/stats',
    domain: 'support',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/support/admin/tenants',
    description: 'SupportController: GET /support/admin/tenants',
    domain: 'support',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/support/admin/tickets',
    description: 'SupportController: GET /support/admin/tickets',
    domain: 'support',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/support/tickets',
    description: 'SupportController: GET /support/tickets',
    domain: 'support',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/support/tickets',
    description: 'SupportController: POST /support/tickets',
    domain: 'support',
    featureGate: null,
    expectations: { MEMBER: null, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // OTHER
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/drivers',
    description: 'DriversController: GET /drivers',
    domain: 'other',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/push/vapid-key',
    description: 'PushSubscriptionController: GET /push/vapid-key',
    domain: 'other',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/webhooks',
    description: 'SubscriptionController: GET /webhooks',
    domain: 'other',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/webhooks/events',
    description: 'SubscriptionController: GET /webhooks/events',
    domain: 'other',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/webhooks',
    description: 'SubscriptionController: POST /webhooks',
    domain: 'other',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },

  // ═══════════════════════════════════════════════════════
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/auth/me',
    description: 'AuthController: GET /auth/me',
    domain: 'infrastructure',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/health/live',
    description: 'HealthController: GET /health/live',
    domain: 'infrastructure',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/health/ready',
    description: 'HealthController: GET /health/ready',
    domain: 'infrastructure',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },

  // ═══════════════════════════════════════════════════════
  // PLATFORM
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/admin/broadcasts',
    description: 'AnnouncementsController: GET /admin/broadcasts',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/login-activity',
    description: 'LoginActivityController: GET /admin/login-activity',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 400, OWNER: 400, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/admin/login-activity/summary',
    description: 'LoginActivityController: GET /admin/login-activity/summary',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 400, OWNER: 400, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/api-keys',
    description: 'ApiKeysController: GET /api-keys',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/api-keys/admin/tenant',
    description: 'ApiKeysController: GET /api-keys/admin/tenant',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/broadcasts/active',
    description: 'BroadcastsPublicController: GET /broadcasts/active',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/feature-flags',
    description: 'FeatureFlagsController: GET /feature-flags',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/invitations',
    description: 'UserInvitationsController: GET /invitations',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/oauth/clients',
    description: 'OAuthClientsController: GET /oauth/clients',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/onboarding/status',
    description: 'OnboardingController: GET /onboarding/status',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/plans',
    description: 'PlansController: GET /plans',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/plans/my-plan',
    description: 'PlansController: GET /plans/my-plan',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/settings/admin',
    description: 'SuperAdminPreferencesController: GET /settings/admin',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/super-admin/login-activity',
    description: 'LoginActivityAdminController: GET /super-admin/login-activity',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/super-admin/login-activity/summary',
    description: 'LoginActivityAdminController: GET /super-admin/login-activity/summary',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 400 },
  },
  {
    method: 'GET', path: '/tenants',
    description: 'TenantsController: GET /tenants',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/tenants/me/profile',
    description: 'TenantsController: GET /tenants/me/profile',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'GET', path: '/users',
    description: 'UsersController: GET /users',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/admin/broadcasts',
    description: 'AnnouncementsController: POST /admin/broadcasts',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: null },
  },
  {
    method: 'POST', path: '/invitations',
    description: 'UserInvitationsController: POST /invitations',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/oauth/clients',
    description: 'OAuthClientsController: POST /oauth/clients',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: null },
  },
  {
    method: 'PUT', path: '/settings/admin',
    description: 'SuperAdminPreferencesController: PUT /settings/admin',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: null },
  },
  {
    method: 'PATCH', path: '/tenants/me',
    description: 'TenantsController: PATCH /tenants/me',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
  {
    method: 'POST', path: '/users',
    description: 'UsersController: POST /users',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: null, OWNER: null, SUPER_ADMIN: 403 },
  },
];
