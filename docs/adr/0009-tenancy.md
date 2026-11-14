# ADR-0009 — Tenancy: three modes, workspace membership, one live account per email, a declared tenant context

**Date:** 2026-11-14 · **Status:** Adopted. Database enforcement of the tenant context (row-level security) is
deferred; see "Consequences".

## Context

Products built from this starter run three ways: a SaaS with many customer organisations, a single organisation's
own deployment, and a personal app where each user has a private space. Writing three code paths would triple the
places a tenant leak can hide. The starter runs all three from one code path, and makes the tenant of every unit of
work explicit so a leak is visible.

## Decision

**One code path serves every tenancy mode. Data is tenant-scoped by an explicit filter in the service, and every
request, job and event handler runs in a declared tenant context.**

- **Three modes, one setting.** `TENANCY_MODE` is `multi` (the default), `single` or `personal`; the older
  `MULTI_TENANT=false` still maps to `single` (`apps/backend/src/config/configuration.ts`). Multi-tenant resolves
  the tenant from the subdomain and allows self-registration. Single-tenant pins every request to
  `IMPLICIT_TENANT_ID` and hides tenant UI. Personal creates a private workspace for each user at sign-up and hides
  organisation chrome. A feature asks for the mode through config; it does not re-derive it from `MULTI_TENANT`.
  Review only.
- **A tenant is a workspace; a user joins workspaces.** `WorkspaceMember` is the source of truth for who belongs
  where and with what role. One user may belong to many workspaces. The session's active workspace is stored on its
  refresh token row (`RefreshToken.tenantId`) and carried in the access token, so two sessions of the same user can
  be in two workspaces. Switching is `POST /workspaces/switch`.
- **One live account per email, enforced by the database.** The partial unique index `users_email_live_key`
  (`lower(email)` where `deleted_at` is null) holds it. Its migration skips the index when a database already holds
  duplicates; then boot logs `auth.email_uniqueness_unenforced`, login offers a workspace picker (409) for a password
  that matches several accounts, and `pnpm accounts:duplicates` / `pnpm accounts:enforce-unique-email` clean up
  (`docs/operations.md`). Login is tenant-aware: on a tenant subdomain the form sends that tenant.
- **Sessions rotate.** Every refresh issues a successor token in the same family; presenting a retired token again
  revokes the session (`packages/appshore/platform/src/auth/refresh-session.service.ts`, held by its spec).
- **Scoping is manual and explicit.** A global guard chain (`Throttler → Jwt → Tenant → Roles → Plan`) resolves the
  tenant, and every service query on a tenant-owned table filters `where: { tenantId }`. A record of another tenant
  answers 404, never 403, so its existence does not leak. Review only: no spec proves every query filters.
- **Every unit of work declares its tenant context.** The context lives in
  `packages/appshore/kernel/src/infrastructure/rls/`. The auth guards pin a request to its tenant; `withJobContext`
  scopes each job; cross-tenant work declares itself with `systemScope(reason)`, `forEachTenant` or
  `@SystemScope`; every log line carries the context. Every job name, Prisma table, `@OnEvent` handler and
  super-admin route declares its context, held by `rls-registry.spec.ts`, `rls-job-context-coverage.spec.ts`,
  `rls-context-coverage.spec.ts` and `rls-context-wiring.spec.ts` in `apps/backend/src/architecture/`. Unit tests run
  strict (`RLS_STRICT_CONTEXT=throw`). Every transaction is interactive, `$transaction(async (tx) => …)`; the array
  form is banned (`rls-no-array-transaction.spec.ts`), so a transaction can carry the context.

## Consequences

- **The database does not enforce tenancy today.** No row-level security policy exists; the declared context is
  plumbing for one. A product that needs enforcement in the database adds policies and roles on top of the context,
  in its own decision record. The AI domain's former per-call role switch is gone and stays gone
  (`no-ai-rls-role.spec.ts`).
- A product switches mode by setting `TENANCY_MODE`, with no query rewrite. Moving a live product from `single` to
  `multi` is a data migration (subdomains, tenants), not a code change.
- A new tenant-owned table needs a `tenantId` column, the filter in its service, and its entry in the app RLS
  registry (`apps/backend/src/platform-glue/database/app-rls-registry.ts`); the registry spec fails until it has one.
- A new job name declares its context in `apps/backend/src/platform-glue/queue/job-context.ts`.
