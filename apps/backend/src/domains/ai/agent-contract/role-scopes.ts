import { AgentScopeSchema, type AgentScope } from '@app/shared-types';

/**
 * Role → AgentScope set for first-party Sally principals (user principals
 * built from a JWT role).
 *
 * Design intent (from 00-design §AgentPrincipal + §Security):
 * - First-party callers act *on behalf of a human role*; their scope set is
 *   derived from that role, not configured per-user.
 * - Intra-tenant role isolation is structural, not scope-driven: DRIVER /
 *   CUSTOMER records are further filtered by driverId / customerId inside
 *   tool code. The scopes here just gate *which tools* the role can reach.
 * - `:sensitive` tier and `platform:admin` are only granted to roles that
 *   genuinely need them, matching the HITL matrix in the umbrella plan.
 *
 * Unknown roles resolve to an empty scope set → every tool call is
 * scope-denied. This is the correct fail-closed behavior; if a new role
 * needs tool access, add it here explicitly.
 */
export function scopesForRole(role: string): AgentScope[] {
  switch (role.toUpperCase()) {
    case 'SUPER_ADMIN':
      // Platform-level admin. Gets every scope including the
      // NEVER_EXTERNAL `platform:admin`, because SUPER_ADMIN is first-party.
      return [...ALL_SCOPES_INCLUDING_ADMIN];

    case 'OWNER':
    case 'ADMIN':
      // Tenant owner / admin — full tenant ops including sensitive writes
      // (void invoice, reverse settlement, retire vehicle, etc.) and
      // bulk broadcast. No platform admin.
      return [...TENANT_ADMIN_SCOPES];

    case 'DISPATCHER':
      // Day-to-day fleet ops, including sensitive writes. The HITL policy
      // (hitl-policy.service.ts) still forces `tier='sensitive'` for
      // `:sensitive` scopes on first-party users — that triggers inline
      // confirm + PIN step-up in the UI, so granting the scope doesn't
      // skip the confirmation. Matches design §HITL matrix for
      // first-party users.
      return [...DISPATCHER_SCOPES];

    case 'DRIVER':
      // Own records only. Scope set is narrow; driver-id filtering lives
      // in the tool code itself.
      return ['fleet:read', 'loads:read', 'documents:read', 'alerts:read', 'comms:send'];

    case 'CUSTOMER':
      // Customer portal — their own loads + documents only.
      return ['loads:read', 'documents:read'];

    default:
      return [];
  }
}

// All scopes — derived from the canonical enum in shared-types so this file
// never drifts when a new scope is added. Adding a scope only requires
// updating `AgentScopeSchema`; roles pick it up automatically (or you
// exclude it below if it shouldn't be granted to that role).
const ALL_SCOPES_INCLUDING_ADMIN: readonly AgentScope[] = AgentScopeSchema.options;

// Tenant admins get everything except platform-level admin (`platform:admin`
// is NEVER_EXTERNAL + first-party SUPER_ADMIN only).
const TENANT_ADMIN_SCOPES: readonly AgentScope[] = ALL_SCOPES_INCLUDING_ADMIN.filter((s) => s !== 'platform:admin');

// Dispatchers get everything tenant admins do, minus a few admin-only
// sensitive scopes (integrations, desk lifecycle, platform write). HITL
// still enforces PIN step-up on `:sensitive` scopes for first-party users,
// so granting the scope doesn't skip the confirmation prompt.
const DISPATCHER_EXCLUDED_SCOPES = new Set<AgentScope>([
  'platform:admin',
  'platform:write',
  'integrations:write:sensitive',
  'desk:write:sensitive',
]);
const DISPATCHER_SCOPES: readonly AgentScope[] = ALL_SCOPES_INCLUDING_ADMIN.filter(
  (s) => !DISPATCHER_EXCLUDED_SCOPES.has(s),
);
