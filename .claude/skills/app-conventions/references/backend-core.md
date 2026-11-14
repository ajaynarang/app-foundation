---
owner: foundation
sources:
  - apps/backend/src/domains/support/support.module.ts
  - apps/backend/src/domains/support/support.controller.ts#SupportController
  - apps/backend/src/domains/support/support.service.ts#SupportService
  - apps/backend/src/domains/support/openapi.responses.ts
  - packages/appshore/kernel/src/constants/cache.constants.ts#CACHE_NAMESPACES
  - packages/appshore/kernel/src/infrastructure/cache/cache-key.constants.ts#buildKey
  - packages/appshore/platform/src/infrastructure/cache/app-cache.service.ts#AppCacheService
  - apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts
  - apps/backend/src/domains/integrations/vendor-registry.ts#VENDOR_REGISTRY
  - apps/backend/src/domains/integrations/adapters/adapter-factory.service.ts
  - apps/backend/src/platform-glue/features/index.ts#OPTIONAL_FEATURES
  - packages/appshore/kernel/src/shared/errors/api-errors.ts#invalidState
guards:
  - foundation-boundaries.spec.ts
  - domain-boundaries.spec.ts
  - no-duplicate-zod-enums.spec.ts
  - optional-features.spec.ts
  - gate:empty-catch
examples:
  - ProjectsService
  - TaskStatusService
  - IAccountingAdapter
  - Cents
---

# Backend core: modules, services, state machines, shared types, caching, integrations

Where code goes and how a domain is put together. The API surface is in [`api-contract.md`](api-contract.md), data
in [`database.md`](database.md), events in [`events-and-outbox.md`](events-and-outbox.md).

## Layout

```
apps/backend/src/
  domains/         your business domains, plus the generic ones (billing, notifications, support, admin,
                   feedback, ai, prompting, integrations)
  platform-glue/   app-side composition: event registry, queue topology, SSE bridge, outbound webhooks,
                   cache invalidation map, lifecycle hooks, optional-feature seam
  architecture/    the guard specs (layer and domain boundaries, enum parity, queue rules, the API ratchet)
packages/appshore/
  kernel/          @appshore/kernel: DB-free mechanics (logging, event/queue/cache mechanics, retry, utils)
  db/              @appshore/db: the Prisma package (schema, generated client, migrations, seeds, enum codegen)
  platform/        @appshore/platform: auth and tenancy guards, database, cache, queues, storage,
                   notifications, platform domains (users, tenants, plans, flags, api-keys, oauth)
```

A new business domain goes under `apps/backend/src/domains/<your-domain>/`, with an aggregate module that imports and
exports its sub-modules.

## Rules

### Modules and dependencies

- A module is registered in its parent domain module (imports and exports) and exports a service only when another
  domain needs it. [review-only: Nest fails at boot on a missing provider, not on an over-wide export]
- Import only what the module uses: `PrismaModule` almost always, `CacheModule` for `AppCacheService`, `QueueModule`
  for queues. Domain events need no import: `EventBusModule` is global and provides `OutboxService`.
  [review-only: an unused import costs nothing a spec sees]
- A package never imports app code: `kernel ← db ← platform ← apps`. [guard: foundation-boundaries.spec.ts]
- A domain imports another domain only along an allowed arrow; a new arrow is a deliberate edit of
  `apps/backend/src/architecture/domain-boundaries.allowed.json`. [guard: domain-boundaries.spec.ts]

### Services

- Every query scopes by tenant (`where: { tenantId }`); another tenant's record is a 404, never a 403.
  [review-only: scoping is manual; the database does not enforce it]
- Each service logs through `new Logger(ClassName.name)`, never `console.*`. [guard: log-hygiene.spec.ts]
- A service throws a NestJS exception or an api-errors factory, never a plain `Error`; see [`errors.md`](errors.md).
  [guard: gate:http-plain-error]
- A state change goes through a method that whitelists the allowed `from → to` pairs and answers an illegal one with
  `invalidState(...)` (409). A generic `update()` never accepts `status`. [review-only: no spec reads transition
  tables]
- A side effect that must not fail the response (a notification trigger, an audit row outside the transaction) is
  started with a `.catch` that logs, never one that swallows. A side effect that must succeed (a charge, an invoice)
  is not a side effect: it is part of the main flow or its transaction. [guard: gate:empty-catch]
- A domain event is never fired and forgotten: it is staged in the write's transaction (see
  [`events-and-outbox.md`](events-and-outbox.md)). [guard: no-direct-emit.spec.ts]

### Shared types

- A response or input shape is a Zod schema in `packages/shared-types/src/<domain>/`, exported from
  `packages/shared-types/src/index.ts`; rebuild the package after a change (`pnpm --filter @app/shared-types build`).
  [review-only: the build fails only when a consumer imports a missing name]
- Names: `<Entity>Schema` (full), `Create<Entity>Schema`, `Update<Entity>Schema` (`.partial()` of the create),
  `<Entity>SummarySchema`. [review-only: naming needs reading]
- A status, role or type schema comes from the generated mirror, never a hand-written `z.enum` of the same name.
  [guard: no-duplicate-zod-enums.spec.ts]
- Money is integer cents with a `Cents` suffix; timestamps are ISO strings; an optional nullable is
  `.nullable().optional()`; a batch array has a `.max(...)`. [review-only: no spec checks the shape rules]

### Caching

- TTLs come from the tiers in `packages/appshore/kernel/src/constants/cache.constants.ts` (hot 15 to 60 seconds,
  warm 2 to 10 minutes, cold 10 to 30 minutes, frozen 1 to 24 hours), never a literal. [review-only: no spec checks
  TTL literals]
- A key is built with `buildKey(namespace, ...parts)`, its namespace listed in `CACHE_NAMESPACES`.
  [review-only: no spec checks key literals]
- Read through `AppCacheService.getOrSet`: it holds a Redis lock against a stampede and caches a null with a sentinel.
  Never nest one `getOrSet` inside another; fetch the dependency first. [review-only: a nested call is found by
  reading]
- Invalidate after the write commits: `cache.del(...)` in the service, or a case in
  `apps/backend/src/platform-glue/cache/cache-invalidation.subscriber.ts` keyed on the event.
  [guard: double-delivery.spec.ts]

### Integrations

- A vendor is an entry in `VENDOR_REGISTRY` (`apps/backend/src/domains/integrations/vendor-registry.ts`), an
  `IntegrationVendor` enum value, and an adapter returned by `AdapterFactoryService`. Domain code depends on the
  adapter interface, never on a vendor client. [review-only: no spec checks vendor imports]
- OAuth tokens are stored and refreshed only by `apps/backend/src/domains/integrations/oauth/`; an adapter never keeps
  or refreshes a token itself. [review-only: needs reading]

### Optional features

- A feature a product chooses at scaffold time is reached only through `apps/backend/src/platform-glue/features/`:
  `<name>.feature.ts` is the one file outside the feature's folder that imports it, and `OPTIONAL_FEATURES` lists what
  the product kept. [guard: optional-features.spec.ts]
- A line for that feature outside its folder sits between `feature:<name>:start` and `feature:<name>:end` comments and
  is registered in its manifest, `tools/init-app/features/<name>.json`, in the same pull request; run
  `pnpm verify:scaffold` before the pull request. [guard: optional-features.spec.ts, script:verify:scaffold]

## Recipe: add a domain module

Copied from the support desk (`apps/backend/src/domains/support/`), the reference slice. Its routes still take a
numeric `:id` (listed in `id-boundary.allowlist.json`); a new domain takes a public id instead (see
[`api-contract.md`](api-contract.md), "The ID boundary").

1. Model it in `packages/appshore/db/prisma/schema/app.prisma` and add a migration ([`database.md`](database.md)).
2. Shapes: Zod schemas in `packages/shared-types/src/<domain>/`, exported from the index.
3. Module: `<domain>.module.ts` with its controller and service, imported by the app module (support's is
   `apps/backend/src/domains/support/support.module.ts`).
4. DTOs under `dto/`: one class per body, one query DTO per list (`dto/ticket-list-query.dto.ts` extends
   `CursorQueryDto` and adds `@QueryEnum` filters).
5. Service: tenant-scoped reads, a cursor list (`SupportService.listTicketsForTenant`), a mapper that builds the wire
   shape. A write that raises an event uses `OutboxService.transaction`.
6. Controller: `@Roles` on the class or route, `@HttpCode` on every POST, `@ApiOperation`, `@ApiParam`, `@ApiResult`
   with the schemas named once in `openapi.responses.ts`.
7. Regenerate the OpenAPI documents (`pnpm --filter @app/backend openapi:generate`) and commit them.
8. Specs beside the code under `__tests__/` ([`testing.md`](testing.md)), then walk
   [`feature-checklist.md`](feature-checklist.md).

## Flag in review

- A query without the tenant filter, or a tenant comparison answered with 403.
- `update({ status })` from a generic update method.
- `.catch(() => {})`, or a `.catch` that logs nothing.
- A hand-written Zod enum or TTL literal.
- A nested `getOrSet`.
- A vendor client imported outside its adapter; a token refreshed in an adapter.
- An import from another domain that the allowed-edges file does not list.
