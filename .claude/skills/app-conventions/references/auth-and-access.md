---
owner: foundation
status: interim
pending: F4
sources:
  - apps/backend/src/app.module.ts
  - apps/backend/src/bootstrap/edge-throttle.ts
  - packages/appshore/platform/src/auth/guards/jwt-auth.guard.ts
  - packages/appshore/platform/src/auth/guards/tenant.guard.ts
  - packages/appshore/platform/src/auth/guards/roles.guard.ts
  - packages/appshore/platform/src/auth/guards/plan.guard.ts#PlanGuard
  - packages/appshore/platform/src/auth/decorators/roles.decorator.ts
  - packages/appshore/platform/src/auth/decorators/public.decorator.ts
  - packages/appshore/platform/src/auth/decorators/current-user.decorator.ts
  - packages/appshore/platform/src/auth/decorators/tenant-db-id.decorator.ts
  - docs/adr/0009-tenancy.md
guards:
  - jwt-auth.guard.spec.ts
  - tenant.guard.spec.ts
  - roles.guard.spec.ts
  - plan.guard.spec.ts
  - api-contract.spec.ts
  - swagger-completeness.spec.ts
examples:
  - assigneeId
  - userDbId
---

# Auth and access: the guard chain, roles, record-level checks, rate limits

Moved from the old backend skill; its finish pull request adds identity (one live account per email, workspaces as
memberships, tenant-aware login), sessions (refresh-token rotation with reuse detection, the session's workspace on the
refresh row), API keys, OAuth clients and agent principals, written from the code. Plan gates are in
[`plans-and-entitlements.md`](plans-and-entitlements.md). The tenancy decision is `docs/adr/0009-tenancy.md`.

## Rules

### The guard chain

- Five global guards run in this order, registered in `apps/backend/src/app.module.ts`: `ThrottlerGuard` (rate limit),
  `JwtAuthGuard` (the token), `TenantGuard` (the workspace; short-circuits to the implicit tenant when
  `MULTI_TENANT=false`), `RolesGuard` (`@Roles`), `PlanGuard` (`@RequireFeature`). Guards and decorators live in
  `@appshore/platform` (`auth/guards/`, `auth/decorators/`). [guard: jwt-auth.guard.spec.ts, tenant.guard.spec.ts,
  roles.guard.spec.ts, plan.guard.spec.ts]
- Never add `@UseGuards(ThrottlerGuard)`: it is already global. [review-only: a duplicate guard is found by reading]
- The rate limit counts in Redis: per signed-in user, or per OAuth client and user, otherwise per client IP; a
  `@Public()` route is per client IP unless `OAuthTokenGuard` protects it. Tuned by `THROTTLE_LIMIT` and
  `THROTTLE_TTL_MS` (`apps/backend/src/bootstrap/edge-throttle.ts`). [guard: edge-throttle.spec.ts]
- `@SkipThrottle()` is for health and SSE routes only; every other route that needs room gets
  `@Throttle(GENEROUS_THROTTLE)`. [guard: api-contract.spec.ts]

### Decorators

- `@Roles(UserRole.ADMIN, ...)` names the roles a route needs (`OWNER`, `ADMIN`, `MEMBER`, `SUPER_ADMIN` from
  `@appshore/db`); `@CurrentUser()` reads the token's user; `@TenantDbId()` the numeric tenant id; `@Public()` skips
  the auth guards (webhooks, health). [guard: roles.guard.spec.ts]
- A super-admin route declares its context with `@SystemScope('super-admin')` beside `@Roles(UserRole.SUPER_ADMIN)`
  (see `apps/backend/src/domains/support/support.controller.ts`). [guard: rls-context-coverage.spec.ts]

### Record-level checks

- A role says "may this person call this route"; it does not say "may this person see this record". A resource with
  scoped ownership (a task assigned to a member, a person's own profile, an item owned by a workspace) also checks the
  record (`task.assigneeId === user.userDbId`). Both are required. [review-only: ownership is domain knowledge]
- A role refusal is 403; another tenant's record is 404, so existence never leaks. [guard: api-contract.spec.ts]

### Tenancy modes

- The same code runs multi-tenant, single-tenant and personal (`TENANCY_MODE`, `MULTI_TENANT` kept for compatibility).
  Never branch on the mode in domain code: `where: { tenantId }` works the same in every mode because the guard chain
  resolves the tenant either way. [review-only: a branch on the mode is found by reading]

## Flag in review

- A route with no `@Roles` and no `@Public()`.
- A role check standing in for a record-level check on an owned resource.
- A 403 for another tenant's record.
- `@UseGuards(ThrottlerGuard)`, or `@SkipThrottle()` outside health and SSE.
- Domain code that branches on `TENANCY_MODE`.
