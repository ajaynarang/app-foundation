---
owner: foundation
sources:
  - docs/adr/0009-tenancy.md
  - docs/operations.md
  - apps/backend/src/app.module.ts
  - apps/backend/src/bootstrap/edge-throttle.ts
  - packages/appshore/platform/src/auth/guards/jwt-auth.guard.ts#JwtAuthGuard
  - packages/appshore/platform/src/auth/guards/tenant.guard.ts#TenantGuard
  - packages/appshore/platform/src/auth/guards/roles.guard.ts#RolesGuard
  - packages/appshore/platform/src/auth/guards/plan.guard.ts#PlanGuard
  - packages/appshore/platform/src/auth/decorators/roles.decorator.ts
  - packages/appshore/platform/src/auth/decorators/public.decorator.ts
  - packages/appshore/platform/src/auth/decorators/current-user.decorator.ts
  - packages/appshore/platform/src/auth/decorators/tenant-db-id.decorator.ts
  - packages/appshore/platform/src/auth/auth.service.ts
  - packages/appshore/platform/src/auth/identity-resolver.service.ts#IdentityResolverService
  - packages/appshore/platform/src/auth/email-uniqueness.check.ts#EMAIL_UNIQUENESS_UNENFORCED_EVENT
  - packages/appshore/platform/src/auth/jwt.service.ts#rotateRefreshToken
  - packages/appshore/platform/src/auth/jwt.service.ts#issueSwitchSuccessor
  - packages/appshore/platform/src/auth/jwt.service.ts#revokeFamily
  - packages/appshore/platform/src/auth/refresh-session.service.ts#RefreshSessionService
  - packages/appshore/platform/src/auth/refresh-token-cookie.ts#setRefreshTokenCookie
  - packages/appshore/platform/src/auth/tokens-cleanup.processor.ts#TokensCleanupJobHandler
  - packages/appshore/platform/src/domains/workspaces/workspaces.controller.ts
  - packages/appshore/platform/src/domains/api-keys/guards/api-key-auth.guard.ts#ApiKeyAuthGuard
  - packages/appshore/platform/src/domains/api-keys/api-keys.service.ts#validateKey
  - packages/appshore/platform/src/domains/oauth-provider/oauth-token.guard.ts#OAuthTokenGuard
  - packages/appshore/platform/src/auth/agent-principal.ts#AgentPrincipal
  - packages/appshore/db/prisma/migrations/20261113230000_users_email_unique_live/migration.sql
  - apps/backend/src/domains/ai/mcp-server/mcp-server.controller.ts
  - apps/backend/src/domains/support/support.controller.ts
guards:
  - jwt-auth.guard.spec.ts
  - tenant.guard.spec.ts
  - roles.guard.spec.ts
  - plan.guard.spec.ts
  - api-contract.spec.ts
  - edge-throttle.spec.ts
  - rls-context-coverage.spec.ts
  - auth.service.tenant-login.spec.ts
  - tenant-login.integration.spec.ts
  - email-uniqueness.integration.spec.ts
  - email-uniqueness.check.spec.ts
  - refresh-session.service.spec.ts
  - refresh-rotation.integration.spec.ts
  - refresh-token-cookie.spec.ts
  - workspaces.service.spec.ts
  - tokens-cleanup.processor.spec.ts
  - api-key-auth.guard.spec.ts
  - api-key-storage.spec.ts
  - oauth-token.guard.spec.ts
  - oauth-provider.security.spec.ts
  - agent-principal.spec.ts
examples:
  - assigneeId
  - userDbId
---

# Auth and access: identity, sessions, the guard chain, roles, record checks, machine principals

Who a caller is (a person with a session, an API key, an OAuth client acting for a person), which workspace the call
runs in, and what it may do. Plan gates are [`plans-and-entitlements.md`](plans-and-entitlements.md); tenant scoping
and the tenant context are [`tenancy.md`](tenancy.md); the tool pipeline that agents go through is
[`ai-tools.md`](ai-tools.md). The decision behind identity and workspaces is the ADR "Tenancy",
`docs/adr/0009-tenancy.md`.

**What a session carries.** An access token (short-lived JWT) names the user, the session's **active workspace** and
the person's role in it. A refresh token (an httpOnly cookie scoped to the auth path) names a row in `refresh_tokens`
that stores the session's workspace (`tenantId`), its family and its predecessor. So two sessions of one person (two
browsers) can be in two workspaces; tabs share one cookie and so one session.

## Rules

### Identity and login

- One live account per email, held by the database: the partial unique index `users_email_live_key` on
  `lower(email)` where `deleted_at` is null. A second account on the same email is a 409. A database that predates
  the index keeps working: boot logs `auth.email_uniqueness_unenforced` and `docs/operations.md` ("Duplicate
  accounts") has the clean-up. [guard: email-uniqueness.integration.spec.ts, email-uniqueness.check.spec.ts]
- A person belongs to workspaces through `WorkspaceMember`, the source of truth for membership and role; the user
  row's tenant is only the login default. [guard: workspaces.service.spec.ts]
- Login is tenant-aware: on a workspace subdomain the form sends that `tenantId` as a hint, and a person signs in to
  that workspace only with a membership there. A password that matches accounts in several workspaces with no hint
  is a 409 `WORKSPACE_SELECTION_REQUIRED` naming them. Every miss is the same generic 401.
  [guard: auth.service.tenant-login.spec.ts, tenant-login.integration.spec.ts]

### Sessions

- Every refresh rotates: the presented token is stamped used and a successor is issued in the same family, under the
  user's session lock, in one transaction. [guard: refresh-session.service.spec.ts, refresh-rotation.integration.spec.ts]
- A retired token presented again is reuse: the whole family is revoked, a `REFRESH_REUSE` login failure is recorded
  and one warning is reported. Within the reuse grace window it is a request already in flight and gets a plain 401.
  A token revoked without rotation (logout, password reset, an admin) gets a plain 401. [guard: refresh-session.service.spec.ts]
- A session never outlives the session max age from its family's start, whatever its rows say.
  [guard: refresh-session.service.spec.ts]
- A refresh mints from the session's own workspace and that membership's current role, never the user's login
  default; a removed membership or an inactive workspace ends the session. [guard: refresh-session.service.spec.ts]
- A workspace switch (`POST /workspaces/switch`) issues a successor in the same family carrying the new workspace;
  a person with no membership there gets a 404. [guard: workspaces.service.spec.ts]
- The refresh cookie is host-only, httpOnly, `lax` and scoped to the auth path, set and cleared through
  `setRefreshTokenCookie` / `clearRefreshTokenCookie`, never by hand. [guard: refresh-token-cookie.spec.ts]
- Expired and long-revoked refresh rows are deleted by the `tokens-cleanup` cron. [guard: tokens-cleanup.processor.spec.ts]

### The guard chain

- Five global guards run in this order, registered in `apps/backend/src/app.module.ts`: `ThrottlerGuard`,
  `JwtAuthGuard`, `TenantGuard` (the workspace; short-circuits to the implicit tenant when `MULTI_TENANT=false`),
  `RolesGuard` (`@Roles`), `PlanGuard` (`@RequireFeature`). [guard: jwt-auth.guard.spec.ts, tenant.guard.spec.ts,
  roles.guard.spec.ts, plan.guard.spec.ts]
- Never add `@UseGuards(ThrottlerGuard)`: it is already global. [review-only: a duplicate guard is found by reading]
- The rate limit counts in Redis: per signed-in user, or per OAuth client and user, otherwise per client IP. Tuned by
  `THROTTLE_LIMIT` and `THROTTLE_TTL_MS`. [guard: edge-throttle.spec.ts]
- `@SkipThrottle()` is for health and SSE routes only; every other route that needs room gets
  `@Throttle(GENEROUS_THROTTLE)`. [guard: api-contract.spec.ts]

### Roles and record checks

- `@Roles(UserRole.ADMIN, ...)` names the roles a route needs (`OWNER`, `ADMIN`, `MEMBER`, `SUPER_ADMIN`);
  `@CurrentUser()` reads the token's user, `@TenantDbId()` the numeric tenant id, `@Public()` skips the auth guards
  (webhooks, health, login). [guard: roles.guard.spec.ts]
- A super-admin route declares what it reads: `@SystemScope('super-admin')` beside `@Roles(UserRole.SUPER_ADMIN)`, or
  `@TargetTenant` (see `apps/backend/src/domains/support/support.controller.ts`). [guard: rls-context-coverage.spec.ts]
- A role says "may this person call this route", not "may this person see this record". An owned resource (a task
  assigned to a member, a person's own profile) also checks the record (`task.assigneeId === user.userDbId`).
  [review-only: ownership is domain knowledge]
- A role refusal is 403; another tenant's record is 404, so existence never leaks. [guard: api-contract.spec.ts]

### Machine principals

- An API key is stored as a hash with a display prefix and last four characters; the key is shown once, at create
  or rotate, and looked up only by its hash. [guard: api-key-storage.spec.ts]
- `ApiKeyAuthGuard` checks the key (active, not expired, the client IP inside its allow-list), pins the request to
  the key owner's tenant, and attaches an `api_key` principal carrying only the key's scopes.
  [guard: api-key-auth.guard.spec.ts]
- `OAuthTokenGuard` accepts only an access token of this issuer, never a consent challenge, and pins the token's
  tenant; refresh tokens rotate atomically and a reused one revokes the chain. [guard: oauth-token.guard.spec.ts,
  oauth-provider.security.spec.ts]
- Every caller of the tool pipeline is an `AgentPrincipal` built by `fromUser`, `fromOAuthUser` or `fromApiKey`, which
  refuse a non-numeric id; scopes, role and plan are checked on the principal ([`ai-tools.md`](ai-tools.md)).
  [guard: agent-principal.spec.ts]
- The MCP endpoints take an OAuth token or an API key, each behind the agent rate limit, never the session JWT.
  [review-only: the guards on two controllers are read, not scanned]

## Recipe: protect a new route

```ts
@Controller('reports')
@Roles(UserRole.OWNER, UserRole.ADMIN) // who may call it; the chain is already global
export class ReportsController {
  @Get(':report_id')
  async get(@CurrentUser() user: AuthUser, @Param('report_id') reportId: string) {
    return this.reports.getForTenant(user.tenantDbId, reportId); // 404 when it is another tenant's
  }
}
```

The service filters by `tenantId` ([`tenancy.md`](tenancy.md)) and, for an owned record, checks the owner. A plan
gate is one more decorator ([`plans-and-entitlements.md`](plans-and-entitlements.md)). A route a machine calls is
reached through the tool pipeline, not by opening a REST route to API keys.

## Recipe: what a session change touches

- Reading "who and where" in a request: `@CurrentUser()` (user, `tenantId`, `tenantDbId`, `role`). Never read the
  workspace from the body.
- Ending a person's sessions (password reset, deactivation): `JwtTokenService.revokeAllUserTokens(userId)`; ending one
  session: `revokeFamily(familyId, userId)`.
- Moving a session to another workspace: the switch route, never a new login.
- Adding a field to the access token: add it in `JwtTokenService` and the JWT strategy, and say in the pull request
  that live sessions get it only on their next refresh.

## Flag in review

- A route with no `@Roles` and no `@Public()`.
- A role check standing in for a record-level check on an owned resource.
- A 403 for another tenant's record.
- `@UseGuards(ThrottlerGuard)`, or `@SkipThrottle()` outside health and SSE.
- A refresh token, API key or OAuth secret written to a log, a response after creation, or an error message.
- Domain code that reads the workspace from the request body or branches on `TENANCY_MODE`.
