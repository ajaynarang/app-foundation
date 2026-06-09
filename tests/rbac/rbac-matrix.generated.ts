/**
 * Platform RBAC Permission Matrix — AUTO-GENERATED
 *
 * DO NOT EDIT MANUALLY. Regenerate with:
 *   npx tsx scripts/generate-rbac-matrix.ts --write
 *
 * Generated from the domain-free platform controllers. Covers the
 * infrastructure, platform, and super-admin surfaces only — domain
 * feature endpoints are intentionally excluded from the starter.
 *
 * Roles: MEMBER, ADMIN, OWNER, SUPER_ADMIN
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
  // INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/admin/platform-services/health',
    description: 'PlatformHealthController: GET /admin/platform-services/health',
    domain: 'infrastructure',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
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
    method: 'GET', path: '/users',
    description: 'UserController: GET /users',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/feature-flags',
    description: 'FeatureFlagController: GET /feature-flags',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/api-keys',
    description: 'ApiKeyController: GET /api-keys',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/oauth/clients',
    description: 'OAuthClientController: GET /oauth/clients',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/plans',
    description: 'PlanController: GET /plans',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/plans/my-plan',
    description: 'PlanController: GET /plans/my-plan',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/billing/overview',
    description: 'BillingController: GET /billing/overview',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/billing/invoices',
    description: 'BillingController: GET /billing/invoices',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/add-ons',
    description: 'AddOnController: GET /add-ons',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 200, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/add-ons/my-add-ons',
    description: 'AddOnController: GET /add-ons/my-add-ons',
    domain: 'platform',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 200, OWNER: 200, SUPER_ADMIN: 200 },
  },

  // ═══════════════════════════════════════════════════════
  // SUPER-ADMIN
  // ═══════════════════════════════════════════════════════
  {
    method: 'GET', path: '/tenants',
    description: 'TenantController: GET /tenants',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/broadcasts',
    description: 'BroadcastController: GET /admin/broadcasts',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/feedback',
    description: 'FeedbackController: GET /admin/feedback',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
  {
    method: 'GET', path: '/admin/add-on-requests',
    description: 'AddOnRequestController: GET /admin/add-on-requests',
    domain: 'super-admin',
    featureGate: null,
    expectations: { MEMBER: 403, ADMIN: 403, OWNER: 403, SUPER_ADMIN: 200 },
  },
];
