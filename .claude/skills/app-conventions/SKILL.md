---
name: app-conventions
description: Use when implementing, modifying, reviewing or planning any code in this monorepo — backend (NestJS, Prisma, the @appshore/* packages), web or mobile. Carries the rules that hold in every layer, each with the guard that holds it, and routes to the one reference file for the area you are touching. Read this first; open a reference only for the area you work in.
owner: foundation
guards:
  - script:guards
  - script:verify
  - script:verify:arch
examples:
  - UPPER_SNAKE_CASE
---

# Conventions

The rules that hold everywhere, then a map to the detail. The non-negotiables below are the whole contract; read
them. Open a reference only for the area you touch. Each reference lists its `sources:` (the code it describes) and
its `guards:` (what holds it); a reference marked `status: interim` is moved text that its finish pull request will
condense, and its rules hold all the same.

## References: open on demand

**Building a feature end to end**

| Working on                                                                 | Read                                                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------- |
| A vertical slice in order (schema, endpoint, event, job, tool, web, tests) | [`feature-checklist.md`](references/feature-checklist.md) |
| The reasoning behind the size, naming, comment and DRY rules               | [`code-quality.md`](references/code-quality.md)           |
| Where tests live, what to assert, the failure modes                        | [`testing.md`](references/testing.md)                     |

**Backend** (`apps/backend`, `packages/appshore/*`)

| Working on                                                                    | Read                                                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Modules, services, state machines, shared types, caching, integrations        | [`backend-core.md`](references/backend-core.md)                                           |
| Routes, status codes, DTOs, query DTOs, the ID boundary, OpenAPI, idempotency | [`api-contract.md`](references/api-contract.md)                                           |
| The error envelope, codes, copy, external errors, retry                       | [`errors.md`](references/errors.md)                                                       |
| Cursor lists, bounded reads, list tests                                       | [`lists-and-pagination.md`](references/lists-and-pagination.md)                           |
| Prisma models, naming, enums, transactions, migrations                        | [`database.md`](references/database.md)                                                   |
| The event registry, the outbox, SSE, webhooks                                 | [`events-and-outbox.md`](references/events-and-outbox.md)                                 |
| Queues, job handlers, deadlines, API and worker roles, shutdown               | [`jobs-and-deadlines.md`](references/jobs-and-deadlines.md)                               |
| The guard chain, roles, record-level checks, rate limits                      | [`auth-and-access.md`](references/auth-and-access.md)                                     |
| Plan gates on routes, jobs and tools                                          | [`plans-and-entitlements.md`](references/plans-and-entitlements.md)                       |
| The config schema, the production boot guard, Doppler, feature flags          | [`config-and-secrets.md`](references/config-and-secrets.md)                               |
| Notifications, file storage and streaming, health checks, billing             | [`platform-services.md`](references/platform-services.md)                                 |
| Logging, error reporting, metrics, traces                                     | [`observability.md`](references/observability.md)                                         |
| Model calls, prompts, moderation, the knowledge base, evals                   | [`ai.md`](references/ai.md)                                                               |
| Model aliases, the route resolver, tenant keys, OpenRouter, AI cost           | [`ai-routing.md`](references/ai-routing.md)                                               |
| MCP tools and the one tool pipeline                                           | [`ai-tools.md`](references/ai-tools.md)                                                   |
| A tenant context with no request in hand (jobs, crons, system work)           | `CLAUDE.md`, "Tenancy models", and [the tenancy ADR](../../../docs/adr/0009-tenancy.md)   |
| A send to a person or a system outside (email, SMS, push, WhatsApp, webhook)  | [the outbound gate ADR](../../../docs/adr/0006-outbound-gate.md) and `docs/operations.md` |
| Compose services, Terraform, deploy workflows                                 | `infra/README.md` and `docs/operations.md`                                                |
| Desk, the optional workflow engine                                            | [the Desk skill](../app-desk/SKILL.md)                                                    |

**Web** (`apps/web`, `@app/ui`, `@appshore/web-core`) and **mobile** (the Flutter app, when the product has one)

| Working on                                                                    | Read                                                    |
| ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| Feature folders, components, status maps, utilities, routes, auth, providers  | [`frontend-core.md`](references/frontend-core.md)       |
| Shared types, the API layer, query and mutation hooks, SSE, URL state, stores | [`frontend-data.md`](references/frontend-data.md)       |
| A list page: the cursor list, URL params, the branch order, pickers, tables   | [`frontend-lists.md`](references/frontend-lists.md)     |
| Sheets, dialogs, forms, the feedback layers, error boundaries                 | [`forms-and-sheets.md`](references/forms-and-sheets.md) |
| Page chrome, row actions, status tones, dark theme, responsive, microcopy     | [`ui-grammar.md`](references/ui-grammar.md)             |
| The Flutter app                                                               | [`mobile.md`](references/mobile.md)                     |

The ids and names behind the database rules are `docs/standards/id-convention.md` and `docs/standards/column-naming.md`;
the logging standard is `docs/standards/observability.md`. The binding docs and ADRs are listed in `CLAUDE.md`.

## Non-negotiables (every layer)

- **camelCase on the wire.** API responses, request bodies, DTOs, service params and frontend types are camelCase.
  [review-only: no spec reads body and response keys]
- **snake_case only where the wire fixes it**: Prisma `where`, `data`, `select`, `include` and `orderBy` blocks, URL
  params (`:tenant_id`) and query keys (`@QueryString({ name: 'tenant_id' }) tenantId`, a camelCase property).
  [guard: api-contract.spec.ts]
- **Enums have one source: the Prisma schema.** The backend imports enums and the client from `@appshore/db`, never
  `@prisma/client`; the web and shared-types import the generated mirror. A DTO references the generated schema's
  `.options`, never a copied array. An app-owned vocabulary (events, jobs, deadline kinds, notification types) is a
  string plus a registry. [guard: enum-codegen-parity.spec.ts, schema-enum-conventions.spec.ts,
  no-duplicate-zod-enums.spec.ts]
- **Status casing is `UPPER_SNAKE_CASE` end to end**: the Prisma enum, the mirror, the service, the DTO's `@IsIn`, the
  web comparator. Derived lowercase display labels and third-party wire formats are the only exceptions, each
  allowlisted. [guard: status-call-sites.spec.ts, web-status-casing.spec.ts, schema-conventions.spec.ts]
- **No magic strings.** Anything in a `where`, a comparison, an event name, a queue or job name, a role or status
  check, a cache key or a feature key comes from, in order: a Prisma enum, the generated mirror, a constants file
  (`DOMAIN_EVENTS`, `QUEUE_NAMES`, `CACHE_TTL_WARM_5M`, `FEATURE_KEYS`), or a named module-level `const`. Error copy is
  prose; `'asc'`, `'desc'` and HTTP verbs are framework primitives. [review-only: only the status half is
  spec-checked, by status-call-sites.spec.ts]
- **Every query scopes by tenant.** A role says "may you call this route", not "may you see this record": an owned
  record also gets a record-level check. [review-only: scoping is manual and the database does not enforce it]
- **Another tenant's record is 404**, the same answer as a missing one, never 403; a role refusal is 403.
  [guard: api-contract.spec.ts]
- **No `Int` key crosses the API**: not in a URL, query, body, response, event that leaves the process, tool input or
  cursor. Resolve a public id on the way in, serialize on the way out. [guard: id-boundary.spec.ts]
- **Errors are the envelope and the copy is for people.** NestJS exceptions or the api-errors factories on every HTTP
  path, never `throw new Error(`; a 400 names its field; a state conflict is 409. `detail` lands in a toast: no field
  names, Prisma codes, internal ids or vendor text. [guard: error-envelope.spec.ts, field-errors.spec.ts,
  gate:http-plain-error]
- **An event exists if and only if its write committed.** Raise it inside the write's transaction with
  `OutboxService.transaction`, never after the commit. [guard: no-direct-emit.spec.ts]
- **At least once means idempotent.** Every queue handler, event listener, webhook and deadline handler runs twice
  eventually; key it on the event or job id, or re-read state. Never mint a fresh id inside a retryable handler.
  [guard: double-delivery.spec.ts]
- **A timer is a row**, written with `DeadlineService` on the write's transaction; never a delayed job or a
  `setTimeout`. [guard: deadline.service.spec.ts]
- **A model is reached only through the route resolver, by alias** (`fast`, `standard`, `powerful`); ids live only in
  the model catalog ([`ai-routing.md`](references/ai-routing.md)). A tool call runs only through the one pipeline.
  [guard: model-id-literals.spec.ts, ai-provider-clients.spec.ts, pipeline.integration.spec.ts]
- **Config through the schema.** `process.env` only in config and bootstrap files; everything else asks `ConfigService`.
  [guard: gate:process-env]
- **Generated files, real env files and applied migrations are never hand-edited.** Regenerate the enum mirror and
  the OpenAPI documents; add a new migration. [guard: .claude/hooks/protected-paths.mjs,
  swagger-completeness.spec.ts]
- **The UI uses the one component set and theme tokens.** shadcn components from `@app/ui` only, no raw `<button>` or
  `<input>`; theme tokens, never a light-only colour; dates through `useFormatters()`. [guard: gate:raw-control,
  ui-grammar-guard.test.ts, single-component-set.test.ts, lint:no-restricted-syntax]
- **Every mutation shows a success and an error toast; every loading state shows a skeleton.**
  [review-only: no spec follows a mutation to its toast]
- **Layers point one way**: `kernel ← db ← platform ← apps`, `kernel ← web-core ← web`; a domain imports another only
  along an allowed arrow. [guard: foundation-boundaries.spec.ts, domain-boundaries.spec.ts]
- **A source comment never cites a skill or a path under `.claude/`**; it names the guard or a file under `docs/`.
  [guard: script:guard:source]

## Size and naming

- A backend or package source file over 800 lines, or a web `.tsx` over 300, fails the gate. Aim lower: files at most
  500 lines, methods at most 60, web components at most 150, hooks at most 50; split along a seam, never mechanically.
  [guard: gate:file-size]
- Classes are `PascalCase` nouns, methods `camelCase` verbs (`is`, `has`, `should` for booleans), files
  `kebab-case.role.ts` with the role suffix always present, constants `SCREAMING_SNAKE_CASE`, events
  `app.<aggregate>.<past-tense-action>`. No `Manager`, `Helper` or `Util` without a sharper noun.
  [review-only: names need reading; the long form is code-quality.md]
- Comments say why, never what; no commented-out code; JSDoc only at public boundaries. [review-only: needs reading]

## Flag in review

Rules a guard holds need no reviewer: run `pnpm guards`, lint and `pnpm verify:arch` first. Then look for what no guard
sees, listed in each reference's "Flag in review": a missing record-level check on an owned resource; a magic string
outside a status; a handler that would act twice on a redelivery; copy that leaks an internal; a tool that drifted from
its REST twin; an assertion that cannot fail; a method or file past its target with a clear seam; a name with no
sharper noun; a comment that repeats the code.
