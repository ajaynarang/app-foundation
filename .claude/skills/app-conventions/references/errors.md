---
owner: foundation
status: interim
pending: F2
sources:
  - packages/appshore/kernel/src/shared/errors/api-errors.ts#invalidState
  - packages/appshore/kernel/src/shared/errors/api-errors.ts#parseWithSchema
  - packages/shared-types/src/infrastructure/api-error.ts#ApiErrorCode
  - packages/appshore/platform/src/shared/filters/error-envelope.ts#writeErrorEnvelope
  - packages/appshore/platform/src/domains/oauth-provider/oauth-error.filter.ts#oauthError
  - packages/appshore/kernel/src/infrastructure/retry/retry.service.ts#RetryService
  - docs/adr/0001-api-contract.md
guards:
  - error-envelope.spec.ts
  - field-errors.spec.ts
  - api-errors.spec.ts
  - api-contract.spec.ts
  - gate:http-plain-error
  - retry.service.spec.ts
---

# Errors: the envelope, codes, helpers, copy rules, external API errors, retry

Moved from the old backend skill; condensed with its recipe in its finish pull request. The decision is the ADR "API
contract", `docs/adr/0001-api-contract.md`.

## Rules

### What to throw

- In services and controllers, throw a NestJS exception or a code-carrying factory from
  `@appshore/kernel/shared/errors/api-errors`: `fieldError(field, copy)` (400 `VALIDATION_FAILED` with
  `fieldErrors`), `invalidState(copy)` (409 `INVALID_STATE`), `duplicate(copy)` (409 `DUPLICATE`), `stale(copy)` (409
  `STALE`). [guard: api-errors.spec.ts]
- Never `throw new Error(` on an HTTP path: it becomes a generic 500 and its text is only logged. Infrastructure code
  that never reaches a response (cache utilities, env validation, health indicators) and queue or workflow workers may.
  [guard: gate:http-plain-error]
- One meaning per status. 400 is bad input and names the field; 401 is not signed in; 403 is signed in but not
  allowed; 404 is missing or in another tenant; 409 is any state conflict (illegal transition, duplicate, stale write);
  429 is rate limited. 422 is not used. A caller with no workspace is a 403 with a code (`NO_TENANT`), not a 400.
  [guard: api-contract.spec.ts]
- A `new BadRequestException('…')` in a controller fails the ratchet: name the field with `fieldError`, or answer with
  the right status and a code. A path param can be the field. [guard: field-errors.spec.ts, api-contract.spec.ts]
- Every error carries a machine `code`. A bare Nest exception gets its status's default; use a factory when the code
  differs. The shared codes are `ApiErrorCode` in `packages/shared-types/src/infrastructure/api-error.ts`; a domain
  may throw its own `{ code, detail }` (`FEATURE_DISABLED`, `PASSWORD_NOT_SET`), which passes through. Add a code to
  `ApiErrorCode` only when every domain shares it. [guard: error-envelope.spec.ts]
- Parse a Zod schema at the boundary with `parseWithSchema(schema, input)`, never `.parse()`: it answers a 400 with
  `fieldErrors`. [guard: api-contract.spec.ts]

### The envelope

- Every error body is `statusCode, code, detail, fieldErrors?, timestamp, path, method, debugDetail?`, plus
  `workspaces` on the login's 409 `WORKSPACE_SELECTION_REQUIRED` only, and nothing else: no `message`, no `error`.
  `fieldErrors` only on a 400; `debugDetail` only in development. A key a thrower attaches is dropped.
  [guard: error-envelope.spec.ts]
- The envelope is written in one place, `writeErrorEnvelope` (`@appshore/platform/shared/filters/error-envelope`); the
  global `HttpExceptionFilter` calls it. A route that writes its own response (`@Res()`, a stream) answers a failure
  with `writeErrorEnvelope(res, req, error)`, never `res.status(…).json({ message })`. [guard: error-envelope.spec.ts]
- Prisma errors map once: P2002 to 409 `DUPLICATE`, P2025 to 404, P2003 and P2014 to 409 `INVALID_STATE`, P2007 to
  400; anything unknown to a generic 500 `INTERNAL`. A service still catches the cases its domain can name.
  [guard: error-envelope.spec.ts]
- Two shapes are set by a standard: the OAuth protocol routes answer `{ error, error_description }` through
  `@UseFilters(OAuthErrorFilter)` (throw `oauthError(OAUTH_ERROR.INVALID_GRANT, '…')`), and a route that takes an API
  key or OAuth token adds `WWW-Authenticate` to its 401 through `BearerChallengeFilter`, with the body still the
  envelope. [guard: error-envelope.spec.ts]
- A DTO failure from `AppValidationPipe` is `VALIDATION_FAILED` with one `detail` (or "3 fields have validation
  errors") and `fieldErrors` keyed by field, dot paths for nested fields, the wire name for a query field.
  [guard: field-errors.spec.ts]
- 5xx logs at `error` with the stack, 4xx at `warn`; `/sse/` and `/health/` are silent.
  [guard: error-envelope.spec.ts]

### Copy

- `detail` is shown to the person as it is (the web puts it in a toast), so it says what happened and what to do next:
  no database field names, Prisma codes or SQL, no internal ids, tenant ids or storage keys, no raw vendor response,
  no stack or code reference. [guard: api-contract.spec.ts]
- A caught external error is logged with its detail and rethrown with plain copy
  (`new InternalServerErrorException('Sync failed. Please try again later.')`); never pass `error.message` on, it may
  hold a key or token. [review-only: the ratchet catches literal internals, not a forwarded message]

| Do                                                  | Don't                                                    |
| --------------------------------------------------- | -------------------------------------------------------- |
| `'This project was not found'`                      | `'Project with ID abc-123 not found in tenant 5'`        |
| `'Invoice number already exists'`                   | `'Unique constraint failed on fields: (invoice_number)'` |
| `'Cannot delete a project with open tasks'`         | `'P2003 foreign key constraint on project_id'`           |
| `'Sync failed. Please reconnect your integration.'` | `'Vendor API error 401: {"error":"invalid_grant"}'`      |

### Retry

- An external call that may fail transiently goes through `RetryService.withRetry(operation, options, context)` from
  `@appshore/kernel` (`infrastructure/retry/`), with `maxAttempts`, `baseDelayMs`, `maxDelayMs` and `exponentialBase`,
  and a context string for the log. [guard: retry.service.spec.ts]

## Flag in review

- `throw new Error(` in a service or controller.
- A 400 that names no field; a 422; a 403 for another tenant's record.
- A hand-written error body, or an extra key on an exception.
- `error.message` forwarded into an exception.
- Internal ids, field names or vendor text in `detail`.
