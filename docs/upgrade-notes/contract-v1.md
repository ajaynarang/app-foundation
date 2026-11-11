# Upgrade note: the v1 API contract

For a product that was scaffolded from this starter **before** the API contract work, and now pulls it.

The starter's routes moved to one contract (see the ADR "API contract" in [`docs/adr/`](../adr/README.md)). That
changed the wire in places. This file lists every change a client or a database can notice, in the order the
changes were made. Pull the work as a whole, then plan your own cutover: you may have clients this repo cannot
move, such as shipped mobile builds and API-key, OAuth and MCP callers.

Each section says what changed, who notices, and what to do.

## 1. Error bodies

**What changed.** Every error body is now one envelope with exactly these keys:

```json
{
  "statusCode": 409,
  "code": "DUPLICATE",
  "detail": "A record with this value already exists. Please use a different value.",
  "fieldErrors": { "email": "email must be an email" },
  "timestamp": "2026-11-12T09:30:00.000Z",
  "path": "/api/v1/users",
  "method": "POST"
}
```

| Before                                                                                          | Now                                                                                       |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `message` and `error` (Nest's keys) were on most error bodies                                   | Gone. Read `detail` for the copy.                                                         |
| No machine code, except where a thrower attached one                                            | `code` is on every error: an `ApiErrorCode` from `@app/shared-types`, or a domain code    |
| Any key a thrower attached reached the wire (`feature`, `featureKey`, `requiredPlan`, `issues`) | Dropped. Only the keys above are sent.                                                    |
| Validation failure: `{ detail, fieldErrors }`                                                   | The same, plus `code: "VALIDATION_FAILED"`                                                |
| A bare 401 / 403 said `Unauthorized` / `Forbidden resource`                                     | `detail` is a sentence: "Sign in to continue." / "You don't have permission to do this."  |
| An uncaught `ZodError` was a 500                                                                | 400 `VALIDATION_FAILED` with `fieldErrors`                                                |
| Prisma foreign-key conflict (P2003) and required-relation violation (P2014): **400**            | **409** `INVALID_STATE`                                                                   |
| Prisma P2007 (a value the column cannot hold): 500                                              | 400 `VALIDATION_FAILED`                                                                   |
| A request body over the parser limit: 500                                                       | 413 `PAYLOAD_TOO_LARGE`                                                                   |
| The assistant stream and the queue board answered a failure with `{ statusCode, message }`      | The envelope                                                                              |
| Desk responsibility update with bad conditions: `{ message, issues }`                           | 400 `VALIDATION_FAILED`; each bad condition is in `fieldErrors` under `conditions.<path>` |

**Who notices.**

- A client that reads `message` or `error` from an error body.
- A client that expects 400 when a delete or update is blocked by linked data.
- A client that read `feature`, `featureKey`, `requiredPlan` or `issues` from an error body. The plan guard's
  `FEATURE_DISABLED` code is still sent, in `code`. Its plan-upgrade refusal is a 403 whose `detail` names the plan;
  the old `error: "PLAN_UPGRADE_REQUIRED"` key is gone.

**What to do.** Read `detail` to show, `code` to branch, `fieldErrors` to mark fields. In the web app that is
`extractErrorMessage`, `extractErrorCode` and `extractFieldErrors` from
`@appshore/web-core/shared/lib/error-utils`; a hand-written `fetch` reads `body.detail`. In the mobile app,
`ApiException` now carries `message` (the envelope's `detail`), `code` and `fieldErrors`. Treat a code you do not
know by its HTTP status.

## 2. OAuth protocol routes

**What changed.** `GET /oauth/authorize`, `POST /oauth/token`, `POST /oauth/revoke` and `POST /oauth/register`
answer an error with exactly `{ "error": "...", "error_description": "..." }` (RFC 6749 section 5.2, RFC 7591
section 3.2.2), with `Cache-Control: no-store`. Before, the two RFC keys rode on top of the app's error body, and
only where the controller set them.

- The token endpoint names the RFC code for each failure. A code that is invalid, expired, already used, or sent
  with the wrong client, redirect URI or PKCE verifier is 400 `invalid_grant`. So is a refresh token that is
  unknown, expired, revoked, reused, past the absolute cap, or issued to another client, and a grant whose user or
  client no longer has a workspace. A missing or wrong `client_secret` is 401 `invalid_client`.
- **Status changes at `POST /oauth/token`.** Refresh-token failures were **401** and are now **400**
  `invalid_grant`. A confidential client that sends no `client_secret` on a code exchange was 400 and is now
  **401** `invalid_client`.
- `GET /oauth/authorize` answers a scope the client may not request with 400 `invalid_scope`.
- Where the server names no RFC code, `error` follows the status: 400 `invalid_request`, 401 `invalid_client`,
  403 `access_denied`, 429 and 503 `temporarily_unavailable`, 5xx `server_error`.
- A bad redirect URI at registration is now `invalid_redirect_uri` (it was `invalid_client_metadata`).
- `POST /oauth/authorize/consent` is the web app's own route and answers the standard envelope.

**Who notices.**

- An OAuth client that read `detail`, `statusCode` or `message` from these four routes.
- An OAuth client that treated a **401** from the token endpoint as "the refresh token is dead, authorize again".
  That is now 400 `invalid_grant`; a 401 `invalid_client` means the client's own credentials are wrong.

A standards-following client reads `error` and `error_description` and needs no change: `invalid_grant` tells it
to authorize again.

## 3. Requests the API now refuses

**What changed.** The global validation pipe is `AppValidationPipe`. For the DTOs that exist today it validates as
before. The difference is in query strings read through the new query DTO kit: an unknown param, a repeated single
param, or a value that does not parse (`?limit=abc`) is a 400 that names the param, where hand parsing used to
ignore it.

**Who notices.** Nobody yet: no route of the starter reads its query string through the kit in this change. Each
route that moves to it is listed below when it moves.
