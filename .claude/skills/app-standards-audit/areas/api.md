---
owner: foundation
sources:
  - apps/backend/src/architecture/api-contract.spec.ts#ACTION_VERBS
  - apps/backend/src/architecture/api-contract.allowlist.json
  - apps/backend/src/architecture/id-boundary.allowlist.json
  - apps/backend/src/bootstrap/openapi.ts
  - apps/backend/src/bootstrap/public-openapi.ts
  - apps/backend/openapi.json
  - apps/backend/public-openapi.json
  - tests/scripts/audit-rbac-gaps.ts
  - apps/backend/src/domains/ai/mcp-server
  - apps/backend/src/platform-glue/webhooks
guards:
  - api-contract.spec.ts
  - swagger-completeness.spec.ts
  - id-boundary.spec.ts
  - error-envelope.spec.ts
  - field-errors.spec.ts
  - request-dto.scan.spec.ts
  - no-direct-emit.spec.ts
  - double-delivery.spec.ts
  - event-vocabulary.spec.ts
  - plan-gated-routes.spec.ts
  - mcp-tool.write-parity.spec.ts
  - deprecation.spec.ts
  - script:verify:api
  - script:audit:rbac
---

# Area: `api` — one contract, for people and for agents

What "consistent" means for the HTTP API, the MCP server and the outbound webhooks. Each check names the reference
that holds the rule and what already guards it. A check whose guard is a spec is recorded **held** when the spec is
green (`pnpm verify:arch`); spend the audit on the checks marked **review**, and on whether each allowlist entry still
has a true reason.

## Surface

Every controller under `apps/backend/src/**` and `packages/appshore/platform/src/**`; the global pipe, filter,
interceptors and guards wired in `apps/backend/src/main.ts` and the app module; the MCP server
(`apps/backend/src/domains/ai/mcp-server/`); outbound webhooks (`apps/backend/src/platform-glue/webhooks/`); the
committed documents `apps/backend/openapi.json` and `apps/backend/public-openapi.json`.

**Inventory columns:** `method | path | controller file:line | credential (public / session / api-key / oauth) | roles
| plan gate | body DTO | query DTO | response schema | status | list? | public?`

Build it from `apps/backend/openapi.json` (every documented route, its status and schema) and
`pnpm audit:rbac` (every route's roles), then add the routes `@ApiExcludeEndpoint()` or `@ApiExcludeController()`
hides, found with `grep`. Every row of the inventory is read; a check reports a count against it.

## A. Contract

The rules are in `.claude/skills/app-conventions/references/api-contract.md`.

| #   | Check                                                                                                               | Reference section               | Guard                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------- |
| A1  | Status by route shape: 201 create, 200 action, 202 queued, 204 delete or nothing to return; no acknowledgement body | Status by route shape           | `api-contract.spec.ts` (held)                             |
| A2  | URL and param naming: snake_case params, one name per collection, action verbs after a param                        | Controllers and routes          | `api-contract.spec.ts` (held)                             |
| A3  | Self-service routes are `/my-<entity>` and scope by the token's user                                                | Controllers and routes          | review                                                    |
| A4  | Every body is a class DTO; every query string is one query DTO from the kit; no parsing in a controller             | DTOs and query DTOs             | `request-dto.scan.spec.ts`, `api-contract.spec.ts` (held) |
| A5  | DTO field decorators match the field: trimmed optional strings, money in cents, nested `@ValidateNested`            | DTOs and query DTOs             | review                                                    |
| A6  | No `Int` id in a URL, DTO, tool input or shared schema; each `id-boundary.allowlist.json` entry still has a reason  | The ID boundary                 | `id-boundary.spec.ts` (held); the reasons: review         |
| A7  | No `Int` id in an event payload or a cursor                                                                         | The ID boundary                 | review                                                    |
| A8  | Every route documented: summary, described params, one success schema; both OpenAPI files fresh                     | The published contract: OpenAPI | `swagger-completeness.spec.ts` (held)                     |
| A9  | Creates are retry-safe; every create that shows a secret has `@SkipIdempotency()`                                   | Creates are retry-safe          | `swagger-completeness.spec.ts` (held)                     |
| A10 | An action POST (200) is idempotent in itself (a state check or an upsert)                                           | Creates are retry-safe          | review                                                    |
| A11 | Every `PROVIDER_ROUTES` entry names the standard or vendor document that fixes its format                           | Status by route shape           | `api-contract.spec.ts` (presence); the reason: review     |
| A12 | A breaking change ships as v2 with `@DeprecatedRoute` on v1                                                         | The published contract: OpenAPI | `deprecation.spec.ts` (held)                              |

## B. Errors

The rules are in `.claude/skills/app-conventions/references/errors.md`.

| #   | Check                                                                                               | Reference section | Guard                                                           |
| --- | --------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------- |
| B1  | One envelope: no route writes its own error body; `@Res()` routes use `writeErrorEnvelope`          | The envelope      | `error-envelope.spec.ts` (held)                                 |
| B2  | No `throw new Error(` on an HTTP path                                                               | What to throw     | gate rule `http-plain-error` (baselined)                        |
| B3  | One meaning per status; every 400 names its field; another tenant's record is 404                   | What to throw     | `api-contract.spec.ts`, `field-errors.spec.ts` (held)           |
| B4  | `detail` is copy a person can act on: no ids, field names, SQL or vendor text, no forwarded message | Copy              | `api-contract.spec.ts` for literals; forwarded messages: review |
| B5  | Domain codes: shared ones in `ApiErrorCode`, the rest `{ code, detail }` from the domain            | What to throw     | `error-envelope.spec.ts` (held)                                 |

## C. Lists

The rules are in `.claude/skills/app-conventions/references/lists-and-pagination.md`.

| #   | Check                                                                                   | Reference section | Guard                                          |
| --- | --------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| C1  | Every growing list is a `CursorList`; each `BOUNDED_LISTS` entry's reason is still true | Rules             | `api-contract.spec.ts` (held); reasons: review |
| C2  | Every other read behind a GET is bounded; no rows loaded to count                       | Rules             | `api-contract.spec.ts` (held)                  |
| C3  | Tiebreak is a public id; scope and keyset joined with `AND`; `total` ignores the cursor | Rules             | `id-boundary.spec.ts`; the rest: review        |
| C4  | A keyset index backs each list                                                          | Rules             | review                                         |
| C5  | Each list has a page-walking test with ties and a foreign cursor                        | Rules             | review                                         |

## D. Access for people and agents

The rules are in `.claude/skills/app-conventions/references/api-contract.md` and `auth-and-access.md`.

| #   | Check                                                                                     | Reference section                                 | Guard                                                                                   |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1  | Every route declares its roles; no role gap against the RBAC matrix                       | `auth-and-access.md`: Decorators                  | `pnpm audit:rbac` (fails the run)                                                       |
| D2  | A route behind a plan gate declares it                                                    | `auth-and-access.md`: The guard chain             | `plan-gated-routes.spec.ts` (held)                                                      |
| D3  | A key or OAuth route carries `AgentRateLimitGuard` and `BearerChallengeFilter`            | Status by route shape                             | `api-contract.spec.ts` (held)                                                           |
| D4  | The public subset in `public-openapi.json` is exactly what an outside credential can call | The published contract: OpenAPI                   | `swagger-completeness.spec.ts` (held); intent: review                                   |
| D5  | Each MCP tool matches its REST twin's scope, roles and plan                               | `ai-tools.md`: Keeping tools in step with the API | `mcp-tool.write-parity.spec.ts` for role and plan (held); fields and operations: review |

## E. Events and webhooks on the wire

The rules are in `.claude/skills/app-conventions/references/events-and-outbox.md`.

| #   | Check                                                                                           | Reference section | Guard                                                               |
| --- | ----------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| E1  | Every event with a write behind it goes through the outbox                                      | The outbox        | `no-direct-emit.spec.ts` (held)                                     |
| E2  | Every registered event is in `docs/event-vocabulary.md`; external events are meant to be public | The registry      | `event-vocabulary.spec.ts` (held); visibility: review               |
| E3  | Every consumer survives a second delivery                                                       | Consumers         | `double-delivery.spec.ts` for those it lists; new consumers: review |
| E4  | Inbound webhooks verify a signature over the raw body and are throttled, not skipped            | Webhooks          | `api-contract.spec.ts` (throttle); the signature: review            |

## Guards to prefer

A gap closes with the cheapest guard that fails when it reopens: a new rule in `api-contract.spec.ts` (one `ruleId`
per ADR line, with its allowlist section and reason), a scan in `apps/backend/src/architecture/` beside
`id-boundary.spec.ts`, or a Playwright check under `tests/api/` when only the running server can show it (run with
`pnpm verify:api`). A rule that lands also lands in the reference above it, with its guard tag, in the same pull
request.
