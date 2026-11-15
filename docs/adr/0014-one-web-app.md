# ADR-0014 — One web app: the separate console is removed

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

The starter used to ship two Next.js apps: `apps/web` for tenants and a separate console app (apps/console, now deleted)
for management, with its own auth store, API client, providers, Dockerfile, deploy job and CI job. Every cross-cutting
change (auth, the API client, the error envelope, the design system) had to land twice, and the two drifted: links the
backend sent (integration OAuth return, sync notices, onboarding actions) pointed at console routes that never existed.
Everything it did is also served by the web app's settings and super-admin pages, and products built on the starter had
already retired it.

## Decision

**There is one web app, `apps/web`. Tenant settings and super-admin pages are routes in it, guarded by role, not a
second application.**

- Tenant administration lives under `apps/web/src/app/settings/` (members, invitations, API keys, OAuth clients,
  webhooks, billing, AI and the rest).
- Super-admin pages live under `apps/web/src/app/admin/` (tenants, timers, AI spend, outbound). The route is
  limited to `SUPER_ADMIN` in `apps/web/src/middleware.ts`, and every controller in `apps/backend/src/domains/admin/`
  carries `@Roles(UserRole.SUPER_ADMIN)`.
- The console app and its plumbing (root scripts, CI and deploy jobs, dev and init tools, env examples) are gone.
  `init-app` has no console rule.
- A new management surface is a route group in `apps/web` with a role guard, not a new app. Review only: nothing
  stops a product from adding an app, so a product that needs one writes its own decision record.

## Consequences

- One auth flow, one API client, one provider stack, one deploy for the browser.
- An admin page shares the web app's design system and page chrome, so it follows the same UI rules and guards
  (`apps/web/src/features/__tests__/ui-grammar-guard.test.ts`).
- Super-admin code ships in the same bundle as tenant code. Access is enforced by the API's guards, never by the
  page being hidden; the route guard only keeps the page from rendering.
- `apps/mobile` is a separate client, not a web app, and is unaffected.
