# ADR-0008 — Package layering: kernel, db, platform, apps

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

Every product built from this starter shares the same cross-cutting code: logging, events, queues, auth, tenancy,
billing, notifications. If that code can import the product, it stops being reusable, a fix to it cannot be pulled
into another product, and a product change can break the foundation. The starter keeps the shared code in
`packages/appshore/` (the `@appshore/*` packages) and the product in `apps/`.

## Decision

**The foundation is four packages in fixed layers, and every dependency arrow points from the app toward the
kernel, never back.**

```
backend:  @appshore/kernel ← @appshore/db ← @appshore/platform ← apps/backend
web:      @appshore/kernel ← @appshore/web-core ← apps/web
```

- **`@appshore/kernel`** holds mechanics that need no database and no Redis: logging, event and queue mechanics,
  retry, SSE and SMS transport, telemetry, validators, the foundation event catalog, the tenant context. It
  imports no other `@appshore/*` package, no app code, no Prisma and no `ioredis`, and its `package.json` declares
  neither. Held by `apps/backend/src/architecture/foundation-boundaries.spec.ts`.
- **`@appshore/db`** is the only Prisma package: the multi-file schema (`foundation.prisma` plus the product's
  `app.prisma`), the generated client, migrations, seeds and the enum codegen. It imports no other `@appshore/*`
  package. Review only: the boundary spec does not scan `db` today; on 2026-11-14 it has no such import.
- **`@appshore/platform`** is the Prisma-coupled SaaS foundation: auth and tenancy guards, database, cache, queue
  persistence, storage, notifications, health, and the platform domains (users, tenants, workspaces, plans,
  flags, API keys, OAuth, settings, onboarding). It may import kernel and db, never app code and never web-core.
  Held by `foundation-boundaries.spec.ts`.
- **`@appshore/web-core`** is the web foundation (API client, SSE, hooks, stores). It imports no app feature and no
  backend package. **`@app/ui`** (the shadcn components and page chrome) imports no `@appshore/*` package, no
  router and no app code; what it needs from an app comes through its adapter. Both held by
  `foundation-boundaries.spec.ts`.
- **The app joins the foundation in one place.** `apps/backend/src/platform-glue/` holds the composition: the
  merged event registry, queue topology, SSE bridge, outbound webhooks, cache invalidation, and `hooks.module.ts`,
  where platform lifecycle hooks bind to app implementations. A package that needs something from the app
  declares an injection token; the app binds it there. Review only.
- **`init-app` never renames `@appshore/*`.** A product's own packages and scripts take its name; the foundation
  keeps one name, so the same fix applies to every product.

## Consequences

- A product adds its domain under `apps/backend/src/domains/` and `apps/web/src/features/`, and its models in
  `app.prisma`, without editing a package.
- A fix in a package can be pulled into another product as a diff of `packages/appshore/` alone.
- A feature that needs the database lives in platform or the app, not the kernel, even when that means one more
  injection token.
- A red `foundation-boundaries.spec.ts` means an arrow points the wrong way. The fix is to move the code, not to
  widen the spec.
