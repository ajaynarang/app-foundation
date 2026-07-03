# Workspace Membership (four tenancy models) — Design Record

- **Date:** 2026-07-03 · **Status:** Shipped
- **Decision:** support all four tenancy models (multi-tenant, single-tenant,
  workspace-based, user-centric) from one codebase with one env var.

## The design in five lines

1. `WorkspaceMember(userId, tenantId, role, isDefault)` is the **source of truth** for
   who belongs where; backfilled from `User.tenantId` (which remains the login-default cache,
   kept in sync by `WorkspacesService`).
2. The **JWT carries the session's active workspace** (tenantId + membership role), minted at
   login (default membership) or `POST /workspaces/switch` (any membership). Two browser tabs
   can therefore live in two different workspaces simultaneously.
3. `JwtStrategy` resolves the principal from the token's workspace claim via the membership
   row; a revoked membership kills the session (401) rather than silently re-homing it.
4. **Domain code is untouched**: every query stays `where: { tenantId }` — the guard chain
   decides which tenant that is, exactly as before.
5. `TENANCY_MODE=multi|single|personal` (MULTI_TENANT compat): `personal` adds
   `POST /auth/register` (simple signup → auto-created private workspace) and hides org chrome
   via `filterForTenancyMode()`; `single` keeps the implicit-tenant short-circuit; the org
   registration wizard is `multi`-only.

## Touch points

Schema `workspace_members` (+backfill migration) · platform `domains/workspaces`
(list/switch) · `jwt.strategy` active-workspace resolution · registration + invitations
create memberships (existing users JOIN a workspace instead of erroring) ·
web `WorkspaceSwitcherPopover` live switching · seeds: demo owner belongs to two
workspaces (OWNER in `demo`, ADMIN in `demo-two`) so the switcher demos on a fresh clone.

Verified: unit (platform 705), RBAC over the new endpoints, and a browser round-trip
(login → Demo Workspace → switch → Second Workspace · Admin).
