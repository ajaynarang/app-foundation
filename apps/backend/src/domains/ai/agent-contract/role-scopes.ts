import { AgentScopeSchema, type AgentScope } from '@app/shared-types';

/**
 * Role → AgentScope set for first-party principals (user principals built
 * from a JWT role).
 *
 * Design intent:
 * - First-party callers act *on behalf of a human role*; their scope set is
 *   derived from that role, not configured per-user.
 * - `:sensitive` tier and `platform:admin` are only granted to roles that
 *   genuinely need them, matching the HITL matrix.
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
      // and bulk broadcast. No platform admin.
      return [...TENANT_ADMIN_SCOPES];

    case 'MEMBER':
      // Standard tenant member — day-to-day ops. The HITL policy
      // (hitl-policy.service.ts) still forces `tier='sensitive'` for
      // `:sensitive` scopes on first-party users — that triggers inline
      // confirm + PIN step-up in the UI, so granting the scope doesn't
      // skip the confirmation.
      return [...MEMBER_SCOPES];

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

// Members get everything tenant admins do, minus a few admin-only sensitive
// scopes. HITL still enforces PIN step-up on `:sensitive` scopes for
// first-party users, so granting the scope doesn't skip the confirmation.
const MEMBER_EXCLUDED_SCOPES = new Set<AgentScope>([
  'platform:admin',
  'platform:write:sensitive',
  'integrations:write:sensitive',
]);
const MEMBER_SCOPES: readonly AgentScope[] = ALL_SCOPES_INCLUDING_ADMIN.filter((s) => !MEMBER_EXCLUDED_SCOPES.has(s));
