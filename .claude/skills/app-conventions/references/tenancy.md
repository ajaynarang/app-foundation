---
owner: foundation
sources:
  - docs/adr/0009-tenancy.md
  - apps/backend/src/config/configuration.ts
  - packages/appshore/platform/src/auth/guards/tenant.guard.ts#TenantGuard
  - packages/appshore/kernel/src/infrastructure/rls/rls-context.ts#runAsTenant
  - packages/appshore/kernel/src/infrastructure/rls/rls-context.ts#setRlsTenant
  - packages/appshore/kernel/src/infrastructure/rls/rls-context.ts#RLS_STRICT_CONTEXT_ENV
  - packages/appshore/kernel/src/infrastructure/rls/system-scope.ts#systemScope
  - packages/appshore/kernel/src/infrastructure/rls/system-scope.ts#forEachTenant
  - packages/appshore/kernel/src/infrastructure/rls/system-scope.decorator.ts#SystemScope
  - packages/appshore/kernel/src/infrastructure/rls/system-scope.decorator.ts#TargetTenant
  - packages/appshore/kernel/src/infrastructure/rls/on-tenant-event.decorator.ts#OnTenantEvent
  - packages/appshore/kernel/src/infrastructure/rls/system-reasons.ts#registerSystemReasons
  - packages/appshore/kernel/src/infrastructure/rls/job-context-registry.ts#JobContextDecl
  - packages/appshore/kernel/src/infrastructure/logging/job-log-context.ts#withJobContext
  - packages/appshore/platform/src/infrastructure/rls/rls-scope.interceptor.ts
  - packages/appshore/platform/src/infrastructure/database/rls-registry.ts#RLS_CLASS
  - apps/backend/src/platform-glue/queue/job-context.ts#APP_JOB_CONTEXT
  - apps/backend/src/platform-glue/queue/job-context.ts#APP_SYSTEM_REASONS
  - apps/backend/src/platform-glue/database/app-rls-registry.ts#APP_RLS_REGISTRY
  - apps/backend/src/domains/admin/admin-jobs.controller.ts
guards:
  - tenant.guard.spec.ts
  - api-contract.spec.ts
  - rls-registry.spec.ts
  - rls-job-context-coverage.spec.ts
  - rls-context-coverage.spec.ts
  - rls-context-wiring.spec.ts
  - rls-no-array-transaction.spec.ts
  - rls-context.spec.ts
  - system-scope.spec.ts
  - on-tenant-event.decorator.spec.ts
  - rls-context.http.spec.ts
examples:
  - orders
  - order_lines
  - OrderPlacedHandler
  - cron.invoice-sweep
  - INVOICE_SWEEP
---

# Tenancy: the three modes, scoping, and the tenant context

One code path serves every tenancy mode. A tenant is a workspace; a person joins workspaces through
`WorkspaceMember`. Data is scoped by an explicit filter in the service, and every unit of work (a request, a job, an
event handler, a deadline handler, an AI tool call) runs in a declared tenant context, so a leak is visible in the
logs and fails a spec. The decision is the ADR "Tenancy", `docs/adr/0009-tenancy.md`. Who may call a route, and what
a session carries, is [`auth-and-access.md`](auth-and-access.md).

**The database does not enforce tenancy.** No row-level security policy exists. The context is the plumbing such
policies would use, and it is held today by specs and by strict mode in tests, not by Postgres. A missing
`where: { tenantId }` is a leak no guard catches.

| Mode       | Set                                         | What changes                                                                      |
| ---------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| `multi`    | default                                     | Tenant from the subdomain, tenant-aware login, self-registration                  |
| `single`   | `TENANCY_MODE=single`, `MULTI_TENANT=false` | Every request resolves to `IMPLICIT_TENANT_ID`; tenant UI and registration hidden |
| `personal` | `TENANCY_MODE=personal`                     | A private workspace per user at sign-up; organisation chrome hidden               |

The mode is `multiTenancy.mode` in config; `TenantGuard` and the plan rule short-circuit on `multiTenancy.enabled`,
which only `MULTI_TENANT=false` turns off, so a single-tenant deployment sets both.

## Rules

### Scoping

- Every query on a tenant-owned table filters `where: { tenantId }` with the tenant the guard chain resolved, in
  every mode; domain code never branches on the mode to skip it. [review-only: scoping is manual and the database
  does not enforce it]
- Another tenant's record answers 404, the same as a missing one; never 403. [guard: api-contract.spec.ts]
- A feature that behaves differently per mode asks config (`multiTenancy.mode`), never re-derives it from
  `MULTI_TENANT`. [review-only: a mode read is found by reading]
- Every Prisma model declares its tenant class: the foundation's in `FOUNDATION_RLS_REGISTRY`, a product's in
  `APP_RLS_REGISTRY` (`tenant`, `tenant_nullable`, `child` with its parent, `identity`, `catalog`, `platform`).
  [guard: rls-registry.spec.ts]

### The tenant context

- A request is pinned by the auth guards (`setRlsTenant` from the JWT, API key or OAuth token) inside the holder
  `RlsContextMiddleware` opens on every route; nothing in a controller or service sets it.
  [guard: rls-context-wiring.spec.ts, rls-context.http.spec.ts]
- The context is set once: pinning a second tenant in the same scope throws in strict mode and is logged otherwise.
  [guard: rls-context.spec.ts]
- Every job name declares how it gets its tenant, in `APP_JOB_CONTEXT` beside `job-names.ts`: `tenant` (the payload
  names it), `forEachTenant` or `system` with a reason, or `noDatabase`. The dispatcher runs each job inside
  `withJobContext`. [guard: rls-job-context-coverage.spec.ts]
- Cross-tenant work declares itself and its reason: `systemScope(reason, fn)` for a global sweep,
  `forEachTenant(reason, rows, fn)` to visit tenants one at a time, each as itself. A product's reasons go in
  `APP_SYSTEM_REASONS` and are registered with `registerSystemReasons`; an unlisted reason throws in strict mode.
  [guard: system-scope.spec.ts]
- Entering a system scope from inside a tenant scope is an escalation: strict mode throws.
  [guard: system-scope.spec.ts]
- An event handler that touches tenant data is `@OnTenantEvent`, which re-enters the tenant its payload names; a plain
  `@OnEvent` is allow-listed with a reason (no database, or cross-tenant with its own `systemScope`). Imperative
  `emitter.on(...)` listeners are refused. [guard: rls-context-coverage.spec.ts, on-tenant-event.decorator.spec.ts]
- A route only a super-admin can call says what it reads: `@SystemScope('super-admin')` across tenants, or
  `@TargetTenant('<param>')` for the one tenant its URL names. [guard: rls-context-coverage.spec.ts]
- Every transaction is interactive, `$transaction(async (tx) => ...)` or `OutboxService.transaction`; the array form
  is refused, because it cannot carry a per-transaction tenant. [guard: rls-no-array-transaction.spec.ts]
- Unit tests run strict (`RLS_STRICT_CONTEXT=throw`, set in each package's jest setup); a deployed task logs a
  context error and keeps running. [guard: rls-context.spec.ts]

## Recipe: run work with no request in hand

**A job for one tenant.** Put the tenant in the payload (`buildJobEnvelope` sets `tenantId`) and declare the name:

```ts
// apps/backend/src/platform-glue/queue/job-context.ts
[APP_JOB_NAMES.BULK_OPS.INVOICE_SYNC]: { tenant: true },
```

The dispatcher reads `tenantId` from the job and runs the handler as that tenant. Nothing else to do.

**A cron over every tenant.** Register a reason, declare the job, and visit each tenant as itself:

```ts
export const APP_SYSTEM_REASONS = { INVOICE_SWEEP: 'cron.invoice-sweep' } as const;   // job-context.ts
[APP_JOB_NAMES.BULK_OPS.INVOICE_SWEEP]: { forEachTenant: APP_SYSTEM_REASONS.INVOICE_SWEEP },

await forEachTenant(APP_SYSTEM_REASONS.INVOICE_SWEEP, () => this.tenants.listActive(), (tenant) =>
  this.sweepOne(tenant.id),                                                            // runs as tenant.id
);
```

A throw from the callback ends the loop; to isolate tenants, catch inside it and count with `CronRun`
([`observability.md`](observability.md)).

**A global sweep** that deletes old rows of every tenant at once: `{ system: reason }` in the job context and
`systemScope(reason, () => ...)` around the work.

**An event handler:**

```ts
@OnTenantEvent(DOMAIN_EVENTS.ORDER_PLACED)
async onOrderPlaced(payload: { tenantId: number; orderId: string }) { /* runs as payload.tenantId */ }
```

**A new tenant-owned table:** a `tenantId Int` column in `app.prisma`, the filter in its service, and its entry in
`APP_RLS_REGISTRY` (`orders: { class: 'tenant' }`, `order_lines: { class: 'child', parent: 'orders' }`). Add it to the
tenant-reset registry too (`docs/operations.md`, "Tenant reset").

## Flag in review

- A tenant-owned query with no `tenantId` filter, or one that takes the tenant from the body instead of the session.
- A 403 for another tenant's record.
- A new system reason: each one is a standing hole once enforcement arrives; is it needed?
- `forEachTenant` whose callback swallows every error with no `CronRun` count.
- A handler that reads `tenantId` from the payload and queries by hand instead of `@OnTenantEvent`.
