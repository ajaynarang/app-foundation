---
owner: foundation
status: interim
pending: F2
sources:
  - docs/adr/0001-api-contract.md
  - docs/adr/0002-id-boundary.md
  - apps/backend/src/architecture/api-contract.spec.ts#ACTION_VERBS
  - apps/backend/src/architecture/api-contract.allowlist.json
  - apps/backend/src/bootstrap/openapi.ts
  - apps/backend/src/bootstrap/public-openapi.ts
  - apps/backend/openapi.json
  - packages/appshore/kernel/src/shared/utils/query-dto.ts
  - packages/appshore/kernel/src/shared/utils/app-validation-pipe.ts#AppValidationPipe
  - packages/appshore/platform/src/infrastructure/idempotency
  - packages/appshore/platform/src/shared/base/base-tenant.controller.ts#BaseTenantController
  - apps/backend/src/domains/support/support.controller.ts#SupportController
  - docs/standards/id-convention.md
guards:
  - api-contract.spec.ts
  - swagger-completeness.spec.ts
  - id-boundary.spec.ts
  - field-errors.spec.ts
  - request-dto.scan.spec.ts
  - query-dto.spec.ts
  - idempotency.spec.ts
  - script:verify:api
examples:
  - Cents
---

# API contract: status by route shape, naming, DTOs, query DTOs, the ID boundary, OpenAPI, idempotency

Moved from the old backend skill; condensed with its recipe in its finish pull request. The decisions are
`docs/adr/0001-api-contract.md` and `docs/adr/0002-id-boundary.md`. The ratchet,
`apps/backend/src/architecture/api-contract.spec.ts`, holds one rule per line of the first ADR (`status/*`,
`naming/*`, `edge/*`, `input/*`, `errors/*`, `output/*`, `docs/*`); the starter passes all of them, its
`api-contract.baseline.json` is `{}`, and a test keeps it empty. Errors are in [`errors.md`](errors.md); lists in
[`lists-and-pagination.md`](lists-and-pagination.md).

The shape of a controller is `apps/backend/src/domains/support/support.controller.ts`.

## Rules

### Controllers and routes

- Every route carries `@Roles(...)` with `UserRole` values from `@appshore/db` (on the route or the class), and
  `@ApiOperation({ summary })`. A `:param` route carries `@ApiParam({ name, description })`; the success body is
  `@ApiResult(schema, status)` or `@ApiNoContentResponse()`. [guard: swagger-completeness.spec.ts]
- A URL param is snake_case (`:project_id`) and its variable camelCase; one name per collection, and
  `@Param('project_id')` matches the placeholder. [guard: api-contract.spec.ts]
- A self-service route is `/my-<entity>` and scopes by the user id from the token. [review-only: naming of
  self-service routes needs reading]
- `BaseTenantController` (`@appshore/platform`, `shared/base/base-tenant.controller.ts`) gives `getTenantDbId(user)`,
  `getUserDbId(userId)` and `validateTenantAccess(resourceTenantId, userTenantId)`, which answers 404.
  [review-only: a controller may read the ids from the token instead]

### Status by route shape

| Route                                                 | Status | Body                               | Decorator                          |
| ----------------------------------------------------- | ------ | ---------------------------------- | ---------------------------------- |
| `POST /things` (a new addressable record exists)      | 201    | the created resource               | `@HttpCode(HttpStatus.CREATED)`    |
| `POST /things/:thing_id/verb` (an action on a record) | 200    | the resource as it is now          | `@HttpCode(HttpStatus.OK)`         |
| Work was queued                                       | 202    | the record to poll (job, delivery) | `@HttpCode(HttpStatus.ACCEPTED)`   |
| `DELETE`                                              | 204    | none: the handler returns `void`   | `@HttpCode(HttpStatus.NO_CONTENT)` |
| A POST with nothing to return (logout, send a code)   | 204    | none                               | `@HttpCode(HttpStatus.NO_CONTENT)` |
| GET, PATCH, PUT                                       | 200    | the resource                       | none needed                        |

- Every POST and every DELETE declares its status: Nest answers 201 to any POST unless told otherwise.
  [guard: api-contract.spec.ts]
- No acknowledgement bodies (`{ success: true }`, `{ message: 'Done' }`, `{ deleted: true }`): return the resource as
  it is now, or answer 204. [guard: api-contract.spec.ts]
- An action verb is the last segment after a param (`/invitations/:invitation_id/resend`) and is never 201. The verbs
  the ratchet knows are `ACTION_VERBS` in `api-contract.spec.ts`; add yours there. [guard: api-contract.spec.ts]
- An illegal state transition is 409 (`invalidState(...)`), never a 400 or a 403. [guard: api-contract.spec.ts]
- Another tenant's record is 404 with the same text as a missing one. Scope the read itself
  (`findFirst({ where: { id, tenantId } })`); the ratchet flags a tenant comparison answered with 403 or 400.
  [guard: api-contract.spec.ts]
- A provider route (a vendor webhook, the MCP transport, OAuth protocol routes, a vendor OAuth redirect, an SSE stream)
  keeps the format its standard fixes and is listed in `PROVIDER_ROUTES` of
  `apps/backend/src/architecture/api-contract.allowlist.json` with the document as the reason. An entry exempts it
  from acknowledgement bodies, query DTOs, snake_case query keys and "a 400 names its field" only; it still declares
  its status, and is documented or excluded on purpose with `@ApiExcludeEndpoint()`. [guard: api-contract.spec.ts]
- `@SkipThrottle()` is for health and SSE routes only. A signed webhook, an MCP route or a dev lever gets
  `@Throttle(GENEROUS_THROTTLE)`; never both on one route (the skip wins). [guard: api-contract.spec.ts]
- A route that takes an API key or an OAuth token (`ApiKeyAuthGuard`, `OAuthTokenGuard`) also carries
  `AgentRateLimitGuard` and sits on a controller with `@UseFilters(BearerChallengeFilter)`. [guard:
  api-contract.spec.ts]
- A violation is fixed in the route, never baselined. A product that adopts a rule before its code follows it removes
  the empty-baseline test in a reviewed diff; its baseline then only shrinks, through
  `UPDATE_API_BASELINE=1 pnpm --filter @app/backend exec jest src/architecture/api-contract`.
  [guard: api-contract.spec.ts]
- Run `pnpm verify:api` before a pull request that changes the wire; it boots the backend and runs the Playwright `api`
  project, the contract spec included. [guard: script:verify:api]

### The published contract: OpenAPI

- One builder, `apps/backend/src/bootstrap/openapi.ts`, makes the document the API serves at `/api/openapi.json` and
  the one `pnpm --filter @app/backend openapi:generate` writes. After any change to a route, a DTO or a response
  schema, regenerate and commit both `apps/backend/openapi.json` and `apps/backend/public-openapi.json`.
  [guard: swagger-completeness.spec.ts]
- The generator refuses an incomplete document: a summary per operation, a described path param, `@ApiProperty` or
  `@ApiPropertyOptional` on each DTO field (`PartialType` from `@nestjs/swagger`), exactly one success response at the
  route's status. A `@Res()` or `@Public()` route may skip the response schema. [guard: swagger-completeness.spec.ts]
- Response schemas are the `@app/shared-types` Zod schemas, named once in an `openapi.responses.ts` beside the
  controller group with `defineResponseSchema` or `defineCursorListSchema`, and referenced by name in `@ApiResult`. The
  schema says what the route sends: dates as strings, nullable columns `.nullable()`. A bare array
  (`@ApiResult([X])`) is only for a `BOUNDED_LISTS` entry. [guard: swagger-completeness.spec.ts]
- The builder adds the error envelope to every operation; the OAuth protocol routes get RFC 6749's error shape instead.
  [guard: swagger-completeness.spec.ts]
- In production (`isProductionEnv()`), `/api/openapi.json` serves the public subset; a local run serves the full
  document. [guard: openapi.spec.ts]
- The public subset is derived, never listed (`apps/backend/src/bootstrap/public-openapi.ts`): a route is public when
  it is `@Public()` with an outside credential, metered as an agent, or speaks an agent protocol. A new credential guard
  goes in `AGENT_AUTH_GUARDS` or `NON_CREDENTIAL_GUARDS`; the generator stops on a guard it cannot classify.
  [guard: swagger-completeness.spec.ts]
- A QA or dev lever is not part of the contract: `@ApiExcludeController()`. [guard: swagger-completeness.spec.ts]
- A breaking change ships as v2 beside v1, and the v1 route is marked
  `@DeprecatedRoute({ since, sunset, successor })`, which writes `Deprecation`, `Sunset` and `Link`; a sunset less than
  182 days after `since` throws at boot. [guard: deprecation.spec.ts]

### Creates are retry-safe: Idempotency-Key

- The global `IdempotencyInterceptor` covers every authenticated POST whose status is 201 or 202: the same key and
  request within 24 hours replays the first answer with `Idempotent-Replayed: true`; the same key on another request is
  409 `IDEMPOTENCY_KEY_REUSED`; a retry while the first runs is 409 `IDEMPOTENCY_KEY_IN_USE`. Only a success is kept;
  if Redis does not answer in 2 seconds the request runs without the key. You write nothing for it.
  [guard: idempotency.spec.ts]
- Not covered: no tenant on the request, `@Public()`, multipart uploads, `@Res()` without passthrough, and any status
  but 201 and 202. An action POST (200) makes the action itself idempotent (a state check, an upsert).
  [guard: openapi.spec.ts]
- `@SkipIdempotency()` goes on every create whose body shows a secret once (an API key, a client or signing secret, a
  token-bearing link), so a replay never stores it in Redis. [guard: swagger-completeness.spec.ts]
- A body over 256 KB is not remembered. [guard: idempotency.spec.ts]

### The ID boundary

- An `Int` primary key never crosses the API: not in a URL, a query, a body, a response, an event payload that leaves
  the process, a tool input or a cursor. The canonical text is `docs/standards/id-convention.md` (role 6 and "The
  boundary"). [guard: id-boundary.spec.ts]
- Resolve on the way in: `@Param('id', ParseUUIDPipe) publicId: string`, the service finds the row by its public id and
  answers 404 when it is unknown. No `ParseIntPipe` on a new route param, no DTO property named `id` or `*Id` typed
  `number`. [guard: id-boundary.spec.ts]
- Serialize on the way out: a `toPublic…(row)` function beside the service emits the public id and omits `id` and every
  numeric foreign key (`invitation.serializer.ts`, `feedback.serializer.ts`, `notification.serializer.ts`,
  `broadcast.serializer.ts`). [guard: id-boundary.spec.ts]
- The numeric ids that cross today (the support ticket routes among them) are in
  `apps/backend/src/architecture/id-boundary.allowlist.json`, each with a reason; the list may only shrink.
  [guard: id-boundary.spec.ts]

### DTOs and query DTOs

- A body is a class that `implements` the shared-types input type, with `@ApiProperty` and class-validator decorators on
  every field; never `@Body('x')`, an inline type, an interface, a `Record` or an `import type` class.
  [guard: request-dto.scan.spec.ts, api-contract.spec.ts]
- DTO fields are camelCase. Optional strings are trimmed with `@Transform(({ value }) => value?.trim() || undefined)`;
  money is cents with `@IsInt()` and `@Min(0)`; nested objects use `@ValidateNested({ each: true })` and `@Type`.
  [review-only: no spec checks the field decorators beyond their presence]
- A query string is one `@Query() query: XQueryDto` built from `@appshore/kernel/shared/utils/query-dto`, extending
  `CursorQueryDto`, `ListQueryDto` or `DatedListQueryDto`; there is no `@Query('x')`.
  [guard: api-contract.spec.ts, query-dto.spec.ts]
- The wire name is snake_case (`@QueryString({ name: 'assignee_id' }) assigneeId`); free text is `q`. An unknown param,
  a repeated single param or a value that does not parse is a 400 `VALIDATION_FAILED` naming the wire param.
  [guard: field-errors.spec.ts]
- A user search goes into Prisma through `containsText(term)`, which escapes the LIKE wildcards; never
  `{ contains: term }`. [guard: list-query.spec.ts]
- Controllers never call `parseInt`, `parseFloat`, `Number()` or a schema's `.parse()`: the DTO parses.
  [guard: api-contract.spec.ts]
- A body a standard defines (RFC 7591 registration) is a DTO marked `@ProtocolWireDto`. A param the kit has no
  decorator for is a `QueryParam((raw, wire) => …)` that throws `fieldError(wire, …)`; a required param is one of these
  (see `AgentActivityQueryDto`). A date the service reads as text uses `QueryCalendarDate` or `QueryDateText` from
  `apps/backend/src/shared/dto/query-date-text.ts`. [guard: query-dto.spec.ts]
- The global pipe is `AppValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`, the `fieldErrors`
  factory); a test that boots a controller uses the same class. Test a DTO the way a request reaches it, with
  `readQueryDto` or `readBodyDto` and `fieldErrorsOf`. [guard: app-validation-pipe.spec.ts]

| Decorator                          | Reads                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `@QueryString`, `@QueryStringList` | one value / several, comma-joined or repeated                                 |
| `@QueryInt`, `@QueryLimit`         | a whole number / the page size, clamped to 1 to 100                           |
| `@QueryBool`                       | `true` or `false` only                                                        |
| `@QueryEnum`, `@QueryEnumList`     | one / several values from a whitelist                                         |
| `@QuerySort(allowed, fallback)`    | a named sort option (`newest`), never a column or a direction                 |
| `@QueryDate`                       | an ISO instant or `YYYY-MM-DD` (a UTC day, both bounds inclusive)             |
| `@QuerySearch`                     | `q`: one value, control characters removed, trimmed, capped at 200 characters |

## Flag in review

- A missing `@HttpCode` on a POST or DELETE; an acknowledgement body; an action verb answered 201.
- A tenant comparison answered with 403 or 400.
- `@SkipThrottle()` on anything but health and SSE; with `@Throttle` beside it.
- A route, DTO or response change without the regenerated OpenAPI files.
- A create that shows a secret without `@SkipIdempotency()`.
- `ParseIntPipe` on a new route; a numeric id in a response, event, tool or cursor.
- `@Query('x')`, `@Body('x')`, `parseInt` in a controller, `{ contains: term }` for user input.
