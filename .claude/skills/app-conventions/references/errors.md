---
owner: foundation
sources:
  - packages/appshore/kernel/src/shared/errors/api-errors.ts#invalidState
  - packages/appshore/kernel/src/shared/errors/api-errors.ts#parseWithSchema
  - packages/shared-types/src/infrastructure/api-error.ts#ApiErrorCode
  - packages/appshore/platform/src/shared/filters/error-envelope.ts#writeErrorEnvelope
  - packages/appshore/platform/src/domains/oauth-provider/oauth-error.filter.ts#oauthError
  - packages/appshore/kernel/src/infrastructure/retry/retry.service.ts#RetryService
  - packages/appshore/kernel/src/infrastructure/retry/retry.module.ts#RetryModule
  - packages/appshore/kernel/src/infrastructure/logging/log-filter.ts
  - packages/appshore/platform/src/domains/api-keys/api-keys.service.ts#pause
  - apps/backend/src/domains/ai/assistant/assistant.service.ts#asHttpError
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

Every failure a person or an agent sees has one shape and one meaning per status. The decision is the ADR "API
contract", `docs/adr/0001-api-contract.md`. How the web shows these errors is in
[`forms-and-sheets.md`](forms-and-sheets.md).

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
- 5xx logs at `error` with the error as an `err` field, 4xx at `warn`, never with the query string. In development
  only, errors on `/api/v1/sse/` and `/api/v1/health/` are not logged (`SILENT_PREFIXES` in the kernel's
  `log-filter.ts`); a deployed task logs them. [guard: error-envelope.spec.ts]

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

- A transient failure of an outside call made inside a request may be retried with
  `RetryService.withRetry(operation, options, context)` (`@appshore/kernel`, `infrastructure/retry/`; import
  `RetryModule`): `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `exponentialBase`, and `retryableErrors`, which defaults
  to the network codes `ECONNRESET`, `ETIMEDOUT` and `ENOTFOUND`. `RetryService.isRetryable` retries an error whose
  `code` is one of those codes or whose message contains one, an HTTP response with `response.status` 429 or 5xx, and
  a timeout (`name` `TimeoutError` or a message containing `timeout`); anything else, including any other HTTP status,
  fails at once. So a vendor 500 or 429 is retried up to `maxAttempts`. No call site uses it yet.
  [guard: retry.service.spec.ts]
- Work that can wait is not retried inside the request: it goes on a queue, whose attempts and backoff do the retry
  ([`jobs-and-deadlines.md`](jobs-and-deadlines.md)). [review-only: whether a call can wait needs reading]

## Recipe: refuse a request

Trimmed from `pause` in `packages/appshore/platform/src/domains/api-keys/api-keys.service.ts` (API keys keep their
numeric id, an exception the ADR "ID boundary" records; a new domain takes a public id):

```typescript
async pause(id: number, tenantId: number): Promise<ApiKeyDto> {
  const apiKey = await this.findTenantKeyOrThrow(id, tenantId); // findFirst scoped by tenant: missing or not yours is 404
  if (apiKey.revokedAt) {
    throw invalidState('A revoked key cannot be paused'); // 409 INVALID_STATE, copy a person can act on
  }
  // ... the write and its event, through the outbox
}
```

And a route that writes its own response, from `streamMessage` in
`apps/backend/src/domains/ai/assistant/assistant.service.ts`:

```typescript
} catch (err) {
  this.logger.error(`Failed to resolve promptKey=${options.promptKey}`, err instanceof Error ? err.stack : String(err));
  writeErrorEnvelope(res, req, new InternalServerErrorException('Failed to resolve prompt'));
  return;
}
```

1. Bad input: let the DTO refuse it; a check the DTO cannot make is `fieldError(field, copy)`.
2. Not found or another tenant's: scope the read by `tenantId` and throw `NotFoundException` with the same copy for
   both.
3. A state that forbids the action: `invalidState(copy)`; a duplicate: `duplicate(copy)`; a stale write:
   `stale(copy)`.
4. An outside call that fails: log the detail, rethrow with plain copy (`InternalServerErrorException`, or the typed
   refusal the domain owns). A route with `@Res()` answers through `writeErrorEnvelope`.
5. A new code every domain shares: add it to `ApiErrorCode`; otherwise throw `{ code, detail }` from the domain.
6. Add a spec that asserts the status and `code`, never the copy, and run `pnpm verify:arch`.

## Flag in review

- `throw new Error(` in a service or controller.
- A 400 that names no field; a 422; a 403 for another tenant's record.
- A hand-written error body, or an extra key on an exception.
- `error.message` forwarded into an exception.
- Internal ids, field names or vendor text in `detail`.
- A test that asserts the error copy instead of the status and `code`.
