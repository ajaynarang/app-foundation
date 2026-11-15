# ADR-0009 — Tenancy: three modes, workspace membership, one live account per email, a declared tenant context

**Date:** 2026-11-14 · **Status:** Adopted. Database enforcement of the tenant context (row-level security) is
deferred; see "Consequences".

## Context

Products built from this starter run three ways: a SaaS with many customer organisations, a single organisation's
own deployment, and a personal app where each user has a private space. Writing three code paths would triple the
places a tenant leak can hide. The starter runs all three from one code path, and makes the tenant of every unit of
work explicit so a leak is visible.

A `WorkspaceMember` row is the whole authorization to sign in to a workspace: an account can enter any workspace it
has a row in (`IdentityResolverService`, `POST /workspaces/switch`). The invitation accept used to be the one flow
that wrote such a row into another person's workspace, and it trusted the token alone. That allowed a
**pre-hijack**: someone signs up first as `victim@x.com` (no proof of the address is asked), a real workspace later
invites the victim, the victim clicks the link, and the account whose password the attacker knows is now a member.
It also let a token holder attach any existing account without its owner knowing, and let an inviter mint a
"verified" account for an address they do not control (amended 2026-11-15).

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
- **A person joins a workspace that is not theirs only signed in, as themselves, with a verified matching email**
  (amended 2026-11-15). The one route is `POST /invitations/join`: a JWT session only (no OAuth or API-key guard),
  and the account row, read from the database, must not be a super admin, must have the invitation's email and must
  have it verified (`emailVerified`, which only a signed-in verify link, a password reset or an emailed-only
  invitation sets; see ADR-0012). A token alone, through the public `POST /invitations/accept`, only ever creates a
  **new** account, and refuses an email that already has one with 409 `SIGN_IN_TO_ACCEPT`. The join is the one
  request that writes into a tenant other than its session's, so it runs as the invitation's tenant through
  `runAsInvitationTenant` (`packages/appshore/kernel/src/infrastructure/rls/rls-context.ts`), the one sanctioned way
  out of a pinned tenant. Held by `user-invitations.service.spec.ts`, `user-invitations.controller.spec.ts`,
  `user-invitations.integration.spec.ts` (the pre-hijack and the reclaim against Postgres, in strict mode) in
  `packages/appshore/platform/src/domains/user-invitations/__tests__/`, and `rls-context.spec.ts`.
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
- A new flow that writes a `WorkspaceMember` row into a workspace the caller is not already in (an SSO link, a
  domain auto-join) is an amendment to this record: it must prove the account's ownership of the address the same
  way, or say why it need not.
- Every account starts unverified, so an account must verify its email before it can join a second workspace. The
  first-party verify, reset and emailed-invitation paths are the only proofs the starter trusts; a product that can
  prove ownership another way marks its accounts with its own statement (`docs/upgrade-notes/identity-and-invitations.md`).
