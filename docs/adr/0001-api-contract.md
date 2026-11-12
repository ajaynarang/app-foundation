# ADR-0001 — API contract

**Date:** 2026-11-12 · **Status:** Adopted. Section 2 (errors) and the query DTO kit of section 3 are in force and
held by specs today. The table under "What is enforced, and by what" says where each other rule stands; it is
updated in the change that brings each rule into force.

## Context

A product built on this starter is driven by people in the web and mobile apps, and by agents over MCP and the
REST API with API keys and OAuth clients. An agent cannot special-case endpoints: it needs every route to succeed
and to fail the same way.

Before this record the API had no single contract. Most errors carried no machine code. The global filter spread
whatever a thrower attached onto the body, so Nest's `message` and `error` keys, and any ad-hoc key, reached the
wire. A Zod failure in a controller was a 500. A foreign-key conflict answered 400. A POST answered 201 whether it
created something or not. Lists paged four different ways, and query strings were parsed by hand, so
`?limit=abc` was silently ignored.

A starter is copied. Whatever its routes do is what every product built on it does, so the contract is decided
here, once.

## Decision

### 1. Success status follows the route's shape

| Route                                                             | Status  | Body                      |
| ----------------------------------------------------------------- | ------- | ------------------------- |
| `POST /things`: a new addressable record exists                   | **201** | the created resource      |
| Any other synchronous success (GET, PATCH, PUT, `POST /:id/verb`) | **200** | the resource as it is now |
| Work was queued                                                   | **202** | the record to poll        |
| `DELETE`                                                          | **204** | none                      |

Every success except DELETE returns the resource, so neither an app nor an agent needs a follow-up fetch. A POST
that has nothing to return (logout, a password reset, a code sent) answers 204. There are no acknowledgement bodies
(`{ success: true }`).

"Everything 200" was considered and rejected. Clients already accept any 2xx, so it buys nothing, while 201
(created: a retry's result is the record) and 202 (not done yet: poll) are signals an agent acts on.

URL params are `:snake_case`, and a collection's param has one name on every route that addresses it
(`/tenants/:tenant_id`, `/api-keys/:api_key_id`).

**Provider routes are the one exception.** A route whose wire format a third party sets keeps that format: the
Stripe and WhatsApp webhooks, the MCP transport, the OAuth protocol routes, a vendor's OAuth redirect, the Inngest
handler, and the server-sent event streams. Each is listed in `PROVIDER_ROUTES` in
`apps/backend/src/architecture/api-contract.allowlist.json`, with the standard or vendor document as its reason.
An entry exempts the route from four rules (acknowledgement bodies, query DTOs, snake_case query keys, "a 400 names
its field") and from nothing else, and the route is either documented or marked `@ApiExcludeEndpoint()`.

At the edge, `@SkipThrottle()` is for health and SSE routes only. A signed webhook, an MCP route and the dev levers
get a high ceiling (`GENEROUS_THROTTLE`) instead of an exemption. A route that takes an API key or an OAuth token is
also metered per agent (`AgentRateLimitGuard`) and answers a 401 with the bearer challenge.

### 2. One error envelope, one meaning per status, a machine code on every error

```json
{
  "statusCode": 409,
  "code": "INVALID_STATE",
  "detail": "This invoice is already paid",
  "fieldErrors": { "title": "Title is required" },
  "timestamp": "2026-11-12T09:30:00.000Z",
  "path": "/api/v1/invoices/inv_k3j2/pay",
  "method": "POST",
  "debugDetail": "…"
}
```

- **Keys.** `statusCode, code, detail, fieldErrors?, timestamp, path, method, debugDetail?` and nothing else.
  `fieldErrors` appears only on a 400. `debugDetail` appears only in development. There is no `message` and no
  `error` key. A key a thrower attaches that is not on this list is dropped.
- **Statuses.** **400** malformed or invalid input, naming the field in `fieldErrors`. **401** not authenticated.
  **403** authenticated but not allowed. **404** missing, **or in another tenant**: existence is never confirmed
  across tenants. **409** any state conflict: an illegal transition, a duplicate, a stale write. **429** rate
  limited. 422 is not used. A 400 that can name no field is the wrong status: it is a 401, 403 or 409 with a code.
- **Codes.** `ApiErrorCode` in `@app/shared-types`: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`,
  `NOT_FOUND`, `METHOD_NOT_ALLOWED`, `INVALID_STATE`, `STALE`, `DUPLICATE`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED`,
  `UNSAFE_WEBHOOK_URL`, `UNAVAILABLE`, `INTERNAL`. The code says what the status cannot: a 409 is `INVALID_STATE`
  (this will never succeed), `STALE` (refresh and retry) or `DUPLICATE`. A thrower names a code with the kernel
  factories (`fieldError`, `fieldErrors`, `invalidState`, `stale`, `duplicate`, `parseWithSchema`); otherwise the
  status implies it. A domain adds its own code by throwing `{ code, detail }`, and it passes through unchanged
  (`FEATURE_DISABLED`, `NO_TENANT`, `TRIAL_EXPIRED`, `ACCOUNT_SUSPENDED`, `PASSWORD_NOT_SET` exist today). A client
  treats a code it does not know by its HTTP status.
- **Copy.** `detail` is written for a person and is safe to show. Nest's bare defaults ("Unauthorized",
  "Forbidden resource") are replaced with a sentence. A thrower's own 429 text is kept; only the throttler's bare
  text becomes the generic line. An unknown error is a generic 500 whose real message is only logged.
- **Mapped errors.** A `ZodError` is a 400 with `fieldErrors` from the issue paths. Prisma P2002 is 409
  `DUPLICATE`; P2025 is 404 `NOT_FOUND`; P2003 and P2014 (a relation blocks the change) are 409 `INVALID_STATE`,
  because that is a state conflict and not bad input; P2007 is 400.
- **One writer.** `writeErrorEnvelope(res, req, error)` is the only place an error body is written. The global
  filter delegates to it, and a route that writes its own response (`@Res()`, a stream) calls it while its headers
  are unsent.
- **Exceptions set by a standard.** The OAuth protocol routes (`/oauth/authorize`, `/oauth/token`,
  `/oauth/revoke`, `/oauth/register`) answer `{ error, error_description }` (RFC 6749 section 5.2, RFC 7591 section
  3.2.2) through `OAuthErrorFilter`; `/oauth/authorize/consent` is the web app's own route and keeps the envelope.
  MCP answers a tool error as a JSON-RPC result. A 401 on a route that takes an API key or an OAuth token keeps
  the envelope body and carries the RFC 6750 challenge in `WWW-Authenticate` (`BearerChallengeFilter`).

### 3. Inputs are DTOs; lists are cursor lists; outputs are serialized

- Every body is a class-validator DTO: no `Record`, inline or interface types, and no `@Body('x')`.
- Every query string is a query DTO built from the kernel kit (`@appshore/kernel/shared/utils/query-dto`):
  `@QueryString`, `@QueryStringList`, `@QueryInt`, `@QueryLimit`, `@QueryBool`, `@QueryEnum`, `@QueryEnumList`,
  `@QuerySort`, `@QueryDate`, `@QuerySearch`, on the bases `CursorQueryDto`, `ListQueryDto` and
  `DatedListQueryDto`. Wire names are snake_case and properties are camelCase. Free-text search is `q`. A sort is a
  named option, never a column or a direction.
- An undeclared param, a repeated single param, or a value that does not parse (`?limit=abc`, `?flag=yes`) is a 400
  that names the wire param. A page size out of range is clamped, not refused.
- A body whose wire shape a standard defines (RFC 7591 client registration) is a DTO marked `@ProtocolWireDto`: the
  standard, not this API, names its fields and its error codes.
- Every list that can grow returns one envelope, `{ items, nextCursor, total, counts? }`, with a page size of 50 by
  default and 100 at most, and an opaque cursor.
- No raw database row crosses the boundary, and an Int primary key is never exposed.

### 4. Versioning

One URI major (`/api/v1`). Additive changes ship in v1. A breaking change ships as v2 alongside v1, with
`Deprecation` and `Sunset` headers on v1 and at least six months of overlap. The committed OpenAPI document is the
contract, and its diff in review is how a breaking change gets noticed.

**The document.** One builder (`apps/backend/src/bootstrap/openapi.ts`) serves `/api/openapi.json` and writes the
committed files (`pnpm --filter @app/backend openapi:generate`). Response bodies are the `@app/shared-types` Zod
schemas, named once (`defineResponseSchema`) and referenced with `@ApiResult(schema, status)`. The generator refuses
an incomplete document: every operation has a summary, described path params, documented body properties and
exactly one success response at the status the route answers.

**What is served.** In production (`isProductionEnv()`: `NODE_ENV` or `ENV_TYPE` says production, so every deployed
task of the shipped image, staging included) `/api/openapi.json` serves the public subset; a local run serves the full
document. The public subset is derived from each route's own metadata, never from a hand list: a route is public when
it is `@Public()` and takes an outside credential (`ApiKeyAuthGuard`, `OAuthTokenGuard`), is metered as an agent, or
speaks an agent protocol (`BearerChallengeFilter`, `OAuthErrorFilter`). In the starter that is the MCP and OAuth
protocol routes. A route that takes a credential without the bearer challenge, or carries a guard the generator
cannot classify, stops the generator.

**Known follow-ups.** Documenting every response wrote down a few raw shapes, which are now part of the v1
contract: the billing reads answer Prisma rows (numeric `tenantId`, provider references); the super-admin tenant
views, the plan admin rows and the user preferences row carry numeric ids (listed in `id-boundary.allowlist.json`);
the tenant list rows carry `_count`; support tickets are still addressed by their numeric `id`. Each moves to a
serializer when its routes are next touched, as a v1-compatible addition or through a v2 route.

The changes that first bring the starter's own routes under this record are the one exception: they set the v1
contract and so change statuses, list envelopes and error keys inside v1, once. `docs/upgrade-notes/contract-v1.md`
lists every such change for a product that was scaffolded before them.

### 5. Retries are safe

A create (a POST that answers 201 or 202) accepts an optional `Idempotency-Key`. The same key with the same request
replays the first response for 24 hours; the same key with a different request is a 409.

## What is enforced, and by what

CI in this repo is manual-only, so a rule counts as enforced only when a spec that runs locally holds it: in the
pre-push hook (`pnpm verify:arch`, the backend's architecture specs) or in `pnpm verify`.

| Rule                                                           | State                                                                                                                                                                                                                                       | Held by                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section 2: envelope keys, codes, mapping                       | In force                                                                                                                                                                                                                                    | `packages/appshore/platform/src/shared/filters/error-envelope.spec.ts`; `apps/backend/src/architecture/error-envelope.spec.ts` (boots the real filter and pipe; any other key on a body fails)                                                                  |
| Section 2: a 400 names its field                               | In force for the pipe, the query kit, Zod at the boundary and `fieldError`                                                                                                                                                                  | `apps/backend/src/architecture/field-errors.spec.ts`; `packages/appshore/kernel/src/shared/errors/api-errors.spec.ts`                                                                                                                                           |
| Section 2: OAuth and bearer-challenge shapes                   | In force on the four OAuth protocol routes and, for the bearer challenge, on both MCP controllers                                                                                                                                           | `oauth-error.filter.spec.ts`, `bearer-challenge.filter.spec.ts`, `oauth-provider.controller.spec.ts` under `packages/appshore/platform/src/domains/oauth-provider/__tests__/`; `mcp-edge.spec.ts`; ratchet rule `edge/agent-401-challenge`                      |
| Section 3: the query DTO kit                                   | In force: every query string of the starter is read through it                                                                                                                                                                              | `packages/appshore/kernel/src/shared/utils/__tests__/query-dto.spec.ts`, `list-query.spec.ts`, `app-validation-pipe.spec.ts`                                                                                                                                    |
| Clients read `detail` and `code`                               | In force                                                                                                                                                                                                                                    | `apps/web/src/shared/lib/__tests__/error-utils.test.ts`, `api-client-errors.test.ts`; `apps/mobile/test/api_client_test.dart`                                                                                                                                   |
| Section 1: status by shape, URL param names                    | In force on every route of the starter                                                                                                                                                                                                      | `apps/backend/src/architecture/api-contract.spec.ts`, rules `status/*`, `naming/snake-case-url-params`, `naming/one-param-name-per-collection`, `naming/param-matches-route`; `tests/api/status-by-shape.spec.ts` against a running backend (`pnpm verify:api`) |
| Section 2: a transition is 409, another tenant's record is 404 | In force                                                                                                                                                                                                                                    | ratchet rules `errors/transition-is-409`, `errors/cross-tenant-is-404`                                                                                                                                                                                          |
| Edge: throttle, agent rate limit                               | In force                                                                                                                                                                                                                                    | ratchet rules `edge/skip-throttle-only-health-sse`, `edge/agent-routes-rate-limited`                                                                                                                                                                            |
| Section 3: every body and query is a DTO                       | In force on every route of the starter: the baseline holds no entry for these rules                                                                                                                                                         | ratchet rules `input/*`, `naming/snake-case-query-keys`, `errors/controller-400-names-its-field`                                                                                                                                                                |
| Section 3: documented responses                                | In force on every route of the starter: the baseline is `{}` and a test keeps it empty                                                                                                                                                      | ratchet rules `docs/*`; `apps/backend/src/architecture/swagger-completeness.spec.ts`                                                                                                                                                                            |
| Section 3: cursor lists, bounded reads, serialized outputs     | In force on every route of the starter: the baseline holds no entry for these rules. A bare array or a `findMany` without `take` that stays is an entry in `api-contract.allowlist.json` (`BOUNDED_LISTS`, `BOUNDED_READS`) with its reason | ratchet rules `output/lists-are-cursor-lists`, `output/list-reads-are-bounded`, `output/no-raw-prisma-from-controllers`; `packages/appshore/kernel/src/shared/utils/__tests__/cursor-pagination.spec.ts`; one page-walking spec per list                        |
| Section 3: an Int primary key is never exposed                 | In force for new code; existing numeric ids are listed and may only shrink (ADR "ID boundary")                                                                                                                                              | `apps/backend/src/architecture/id-boundary.spec.ts` with `id-boundary.allowlist.json`                                                                                                                                                                           |
| Section 4: the committed contract                              | In force: `apps/backend/openapi.json` and `public-openapi.json` are generated, committed and held to the code; production serves the public subset                                                                                          | `apps/backend/src/architecture/swagger-completeness.spec.ts` (runs the generator; fails on drift); `tests/api/contract/openapi.spec.ts` under `pnpm verify:api` (the served document and real response bodies)                                                  |
| Section 4: versioning                                          | In force: `@DeprecatedRoute` writes `Deprecation`, `Sunset` and `Link` and refuses a sunset under 182 days. No route is deprecated yet                                                                                                      | `packages/appshore/platform/src/shared/http/__tests__/deprecation.spec.ts`                                                                                                                                                                                      |
| Section 5: Idempotency-Key                                     | Decided; not yet built                                                                                                                                                                                                                      |                                                                                                                                                                                                                                                                 |

## Consequences

- A client that read `message` from an error body reads `detail`. The web app, the mobile app and the QA schemas
  moved in the same change as the filter.
- A client that expected 400 on a foreign-key conflict gets 409 `INVALID_STATE`.
- A thrower can no longer put an ad-hoc key on an error body. The plan guard's `feature` key is gone; its
  `FEATURE_DISABLED` code stays.
- An agent gets a stable `code` on every failure and can decide between "retry", "refresh and retry" and "stop"
  without parsing copy.
- The rules are written into the `backend-patterns` skill (section 4.1 query DTOs, section 10 errors) and the
  `frontend-patterns` skill (the API error shape), and the `review` skill checks them.
