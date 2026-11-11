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

**Who notices.** Nobody from that change alone. Every route of the starter moved to the kit later: see section 5.

## 4. Success statuses, acknowledgement bodies and route params

**What changed.** The success status now follows the shape of the route (ADR "API contract", section 1), and no
route answers an acknowledgement (`{ success: true }`, `{ message: "…" }`). An action returns the resource as it
is now, or 204 with no body.

Statuses that moved. Nest answers 201 to a POST unless told otherwise, so most action POSTs moved from 201 to 200.

| Route                                                                                                                             | Before                             | Now                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------- |
| `POST /dev/switch`, `POST /admin/cache/flush`, `POST /admin/cache/flush/:namespace`                                               | 201                                | 200                                                |
| `POST /admin/jobs/:job_id/retry`                                                                                                  | 201                                | **202** `{ jobId, status }`                        |
| `POST /admin/jobs/tenants/:tenant_id/pause-jobs`, `…/resume-jobs`                                                                 | 201                                | 200                                                |
| `POST /admin/billing/tenants/:tenant_id/credit`, `pause`, `resume`, `cancel-immediately`, `extend-trial`, `suspend`, `reactivate` | 201 `{ success: true }`            | 200, the tenant's billing state                    |
| `PATCH /admin/billing/tenants/:tenant_id/price`                                                                                   | 200 `{ success: true }`            | 200, the tenant's billing state                    |
| `POST /admin/billing/tenants/:tenant_id/refund`, `change-plan`                                                                    | 201                                | 200 (same body)                                    |
| `POST /billing/checkout`, `POST /billing/payment-methods/setup`                                                                   | 201                                | 200 (same body)                                    |
| `POST /billing/upgrade`, `downgrade`, `cancel`, `reactivate`                                                                      | 201 `{ success: true }`            | 200, the billing overview                          |
| `PATCH /billing/quantity`, `PATCH /billing/payment-methods/:id/default`                                                           | 200 `{ success: true }`            | 200, the billing overview                          |
| `POST /billing/wallet/top-up`                                                                                                     | 201 `{ success: true }`            | 200, the wallet (`{ wallet, recentTransactions }`) |
| `PATCH /billing/wallet/auto-reload`                                                                                               | 200 `{ success: true }`            | 200, the wallet                                    |
| `DELETE /billing/payment-methods/:id`                                                                                             | 200 `{ success: true }`            | **204**                                            |
| `DELETE /integrations/:integration_id`                                                                                            | 200 `{ success: true }`            | **204**                                            |
| `POST /integrations/:integration_id/sync`                                                                                         | 201 `{ success, message, jobIds }` | **202** `{ jobId, status: "QUEUED" }`              |
| `POST /integrations/:integration_id/test`                                                                                         | 201                                | 200 (same body)                                    |
| `POST /integrations/oauth/:vendor/disconnect`                                                                                     | 201 `{ success, message }`         | **204**                                            |
| `POST /webhooks/:id/test`                                                                                                         | 201 `{ message }`                  | **202**, the queued delivery log                   |
| `POST /webhooks/:id/logs/:log_id/retry`                                                                                           | 201 `{ message }`                  | **202**, the delivery log, pending again           |
| `POST /webhooks/:id/replay`                                                                                                       | 201 `{ message }`                  | **202** `{ queued, since }`                        |
| `POST /auth/forgot-password`, `POST /auth/reset-password`                                                                         | 200 `{ success: true }`            | **204**                                            |
| `POST /auth/logout`                                                                                                               | 201 `{ message }`                  | **204**                                            |
| `POST /auth/phone/send-otp`, `set-pin`, `add-phone`                                                                               | 200 `{ message }`                  | **204**                                            |
| `POST /auth/phone/verify-add-phone`                                                                                               | 200 `{ message }`                  | 200, the profile                                   |
| `PATCH /auth/password`                                                                                                            | 200 `{ success, sessionsRevoked }` | 200 `{ sessionsRevoked }`                          |
| `POST /auth/refresh`, `POST /auth/firebase/exchange`                                                                              | 201                                | 200 (same body)                                    |
| `POST /notifications/:notification_id/read`, `unread`, `dismiss`, `POST /notifications/mark-all-read`, `dismiss-all-read`         | 201                                | 200 (same body)                                    |
| `POST /notifications/devices`, `POST /push/subscribe`                                                                             | 201 `{ message }`                  | **204**                                            |
| `DELETE /notifications/devices`, `DELETE /push/unsubscribe`                                                                       | 200 `{ message }`                  | **204**                                            |
| `POST /users/:user_id/activate`, `deactivate`                                                                                     | 201 `{ message }`                  | 200, the user                                      |
| `DELETE /users/:user_id`                                                                                                          | 200 `{ message }`                  | **204**                                            |
| `DELETE /invitations/:invitation_id`                                                                                              | 200, the invitation row            | **204**                                            |
| `POST /invitations/accept`, `POST /invitations/:invitation_id/resend`                                                             | 201                                | 200 (same body)                                    |
| `POST /tenants/:tenant_id/approve`, `reject`, `suspend`, `reactivate`                                                             | 201                                | 200 (same body)                                    |
| `POST /api-keys/:api_key_id/rotate`, `POST /oauth/clients/:client_id/rotate-secret`, `POST /webhooks/:id/rotate-secret`           | 201                                | 200 (same body)                                    |
| `POST /api-keys/:api_key_id/pause`, `resume`, `revoke`                                                                            | 204                                | 200, the key                                       |
| `POST /oauth/clients/:client_id/pause`, `resume`, `revoke`                                                                        | 204                                | 200, the client                                    |
| `POST /oauth/authorize/consent`, `POST /settings/reset`, `POST /voice/token`, `POST /mcp/hitl/:token/step-up`                     | 201                                | 200 (same body)                                    |
| `POST /admin/broadcasts/:id/publish`, `archive`; `POST /admin/feedback/:id/categorize`, `bulk-categorize`                         | 201                                | 200 (same body)                                    |
| `GET /mcp`, `GET /` (the MCP stream probe)                                                                                        | 405 `{ error, message }`           | 405, the error envelope (`METHOD_NOT_ALLOWED`)     |

Creates that already answered 201 still do (`POST /users`, `/invitations`, `/api-keys`, `/oauth/clients`,
`/webhooks`, `/integrations`, `/support/tickets`, `/feedback`, `/conversations`, `/admin/broadcasts`,
`/tenants/register`, `/admin/billing/tenants/:tenant_id/subscription`, `/desk/memories/playbook`, ticket messages).

Errors that moved:

| Case                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Before | Now                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| A record of another tenant or user: a user, an OAuth client, an assistant or voice conversation, a webhook subscription (read, update, delete, logs, retry, replay, test)                                                                                                                                                                                                                                                                                                     | 403    | 404 `NOT_FOUND`     |
| Another tenant's invitation on cancel, resend and link (the copy is now `Invitation not found`)                                                                                                                                                                                                                                                                                                                                                                               | 400    | 404 `NOT_FOUND`     |
| An action the record's state does not allow: a revoked key or client, an invitation that is accepted, cancelled or expired, a tenant that is not pending, active or suspended as the action needs, a job or delivery that has not failed, a trial that cannot be extended, a subscription that is already active or already on that plan, removing the only payment method, a Desk episode that is not escalated, a responsibility that is coming soon, step-up without a PIN | 400    | 409 `INVALID_STATE` |

The copy of those 409s changed too, and no longer carries a raw enum name.

Route params are `:snake_case`, with one name per collection. A URL with a value in it is unchanged; only a client
that builds URLs from the route template, or reads the OpenAPI path, notices.

| Before                                                              | Now                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `:tenantId` (tenants, plans, admin billing), `:id` under admin jobs | `:tenant_id`                                                             |
| `:userId`, `:invitationId`, `:clientId`, `:integrationId`, `:jobId` | `:user_id`, `:invitation_id`, `:client_id`, `:integration_id`, `:job_id` |
| `:conversationId`, `:logId`                                         | `:conversation_id`, `:log_id`                                            |
| `DELETE /api-keys/:id`                                              | `DELETE /api-keys/:api_key_id`                                           |

Edge changes:

- `POST /oauth/register` is limited to 5 requests a minute per address. The limit was declared before and switched
  off by a `@SkipThrottle()` beside it.
- `GET /oauth/authorize`, the Stripe and WhatsApp webhooks, the MCP routes and `GET /dev/users` have a ceiling of
  1000 requests a minute per address, where they had no throttle.
- `POST /` and `DELETE /` (MCP at the domain root) and `DELETE /mcp` are now metered per agent, like `POST /mcp`.
- A 401 from any MCP route carries `WWW-Authenticate: Bearer … resource_metadata="…"`.

**Who notices.**

- A client that checks for exactly 201 on an action, or exactly 200 on a delete.
- A client that reads `success`, `message` or `jobIds` from a success body.
- A client that parses the body of a route that now answers 204. `response.json()` on an empty body throws.
- A client that treated 400 as "invalid input" for a state conflict, or 403 as "exists, not yours".
- An MCP or OAuth client that sent more than the new limits allow.

**What to do.** Treat any 2xx as success, and read the body only when the status is not 204. In the web app,
`apiClient` returns `undefined` for a 204 and for an empty 200, 201 or 202; `apiFetchRaw` is there for binary
downloads. In the mobile app, `ApiClient` returns an empty map for an empty body. Show `detail` on a 409, as
`extractErrorMessage` does. A stored webhook, runbook or script that calls a moved route by its template needs the
new param name only if it templates the URL itself.

## 5. Query keys, request bodies and 400s that name their field

**What changed.** Every query string and every request body of the starter is now a DTO class, so the global pipe
checks all of them. Three things follow.

**Query keys are snake_case, and free-text search is `q`.** The old key is not read any more: it is an unknown
param, and answers 400.

| Route                                                             | Before                                                                | Now                                                                          |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /admin/feedback`                                             | `tenantId`, `sentimentMin`, `sentimentMax`                            | `tenant_id`, `sentiment_min`, `sentiment_max`                                |
| `GET /admin/login-activity`, `GET /super-admin/login-activity`    | `tenantId`, `userQuery`, `excludeSuperAdmin`                          | `tenant_id`, `user_query`, `exclude_super_admin`                             |
| `GET /admin/login-activity/summary`, `GET /super-admin/…/summary` | `tenantId`, `excludeSuperAdmin`                                       | `tenant_id`, `exclude_super_admin`                                           |
| `GET /admin/jobs`                                                 | `tenantId`, `dateFrom`, `dateTo`                                      | `tenant_id`, `date_from`, `date_to`                                          |
| `GET /admin/jobs/metrics`, `GET /admin/jobs/categories/summary`   | `tenantId`                                                            | `tenant_id`                                                                  |
| `GET /admin/events`                                               | `search`, `actorType`                                                 | `q`, `actor_type`                                                            |
| `GET /support/admin/tickets`                                      | `tenantId`, `search`                                                  | `tenant_id`, `q`                                                             |
| `GET /agent-activity`                                             | `principalKind`, `principalId`, `dateFrom`, `dateTo`                  | `principal_kind`, `principal_id`, `date_from`, `date_to`                     |
| `GET /webhooks/:id/logs`                                          | `dateFrom`, `dateTo`                                                  | `date_from`, `date_to`                                                       |
| `GET /integrations/sync-history`                                  | `syncType`                                                            | `sync_type`                                                                  |
| `GET /desk/memories`                                              | `agentKey`, `authoredByOperatorOnly`, `sourceEpisodeId`, `activeOnly` | `agent_key`, `authored_by_operator_only`, `source_episode_id`, `active_only` |
| `GET /dev/users`                                                  | `tenantId`                                                            | `tenant_id`                                                                  |

**A value that does not parse is a 400 that names the param.** Hand parsing used to replace it or pass it on.

| Case                                                                                                                                                                                                            | Before                                              | Now                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------- |
| A number that is not one (`?limit=abc`, `?offset=x`, `?days=abc`, `?page=abc`, `?tenant_id=abc`), a negative `offset`, a `page` below 1                                                                         | the default was used, or `NaN` reached the database | 400 `VALIDATION_FAILED`      |
| A page size out of range (`?limit=999`, `?limit=0`)                                                                                                                                                             | varied by route                                     | clamped to the route's 1…max |
| An unknown enum value: `status` on admin jobs, broadcasts, tenants, invitations, notifications, support tickets and sync history; `category` and `priority` on support and notifications; `surface` on AI spend | ignored, or a 500 from the database                 | 400 `VALIDATION_FAILED`      |
| A date that is not a date (`since`, `until`, `date_from`, `date_to`, `from`, `to`)                                                                                                                              | an invalid date reached the query                   | 400 `VALIDATION_FAILED`      |
| A bad Desk filter (`GET /desk/episodes`, `/desk/episodes/handled`, `/desk/memories`)                                                                                                                            | an uncaught `ZodError`                              | 400 with `fieldErrors`       |
| A Desk boolean (`active_only`, `authored_by_operator_only`)                                                                                                                                                     | `1`, `yes`, `on` and friends were accepted          | `true` or `false` only       |
| An undeclared query param on any of these routes                                                                                                                                                                | ignored                                             | 400 that names it            |

`status` on `GET /support/tickets`, `GET /support/admin/tickets` and `GET /notifications` takes the stored values
(`OPEN`, `BILLING`, `unread`); a value in another case never matched a row before and is now refused.

**Bodies that were unchecked types are checked.** These routes took an inline type, an interface or `@Body('x')`,
which the pipe cannot see. Each now refuses a missing or wrong-typed field, and a field it does not declare.

| Route                                                  | Body                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `POST /oauth/clients`, `PUT /oauth/clients/:client_id` | `name`, `description`, `redirectUris` (absolute URLs), `scopes` (known scopes), `clientType` |
| `POST /oauth/authorize/consent`                        | `challenge`, `selectedScopes`                                                                |
| `PATCH /plans/tenant/:tenant_id`                       | `plan` (a plan that exists), `reason`                                                        |
| `PATCH /plans/:plan/provider-price`                    | `providerPriceId` (text or `null`)                                                           |
| `POST /tenants/:tenant_id/reject`                      | `reason`                                                                                     |
| `DELETE /invitations/:invitation_id`                   | `reason`                                                                                     |
| `POST /settings/reset`                                 | `scope` (`user`)                                                                             |
| `POST /push/subscribe`, `DELETE /push/unsubscribe`     | the browser's `PushSubscription.toJSON()` under `subscription`; `endpoint`                   |
| `POST /notifications/mark-all-read`                    | `category` (a notification category)                                                         |
| `POST /admin/cache/flush`                              | `confirm`                                                                                    |

The OAuth protocol bodies (`POST /oauth/token`, `/oauth/revoke`, `/oauth/register`) are DTOs too, in the standards'
own field names. A parameter the server does not use is still ignored, as RFC 6749 and RFC 7591 require. A value of
the wrong shape (a repeated form key, a nested object) answers 400 `invalid_request`, or `invalid_client_metadata`
or `invalid_redirect_uri` on registration, where it used to reach the handler.

**A 400 names its field; if no field is at fault it is not a 400.**

| Case                                                                                              | Before                     | Now                                                      |
| ------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| `GET /plans/my-plan` with no workspace (a super admin)                                            | 400                        | 403 `NO_TENANT`                                          |
| `POST /desk/memories/playbook` when the session carries no user id                                | 400                        | 401 `UNAUTHENTICATED`                                    |
| `POST /tenants/register` with a missing or failed bot check                                       | 400, no field              | 400 with `fieldErrors.turnstileToken`                    |
| `GET /integrations/oauth/:vendor/connect`, `POST …/:vendor/disconnect` for a vendor without OAuth | 400                        | 404 `NOT_FOUND`                                          |
| A wrong PIN on `POST /mcp/hitl/:token/step-up`                                                    | 400, no field              | 400 with `fieldErrors.pin`                               |
| `POST /webhooks/:id/replay` further back than 7 days                                              | 400, no field              | 400 with `fieldErrors.since`                             |
| `POST /admin/cache/flush` without `confirm`, or an unknown namespace                              | 400, no field              | 400 with `fieldErrors.confirm` / `fieldErrors.namespace` |
| `PATCH /notifications/whatsapp-consent` with nothing to change                                    | 400, no field              | 400 with `fieldErrors.optedIn` and `marketingOptedIn`    |
| `POST /desk/approvals/:id/claim` when someone else holds it                                       | 409 naming their user id   | 409 `INVALID_STATE`, no id in the copy                   |
| A file missing from storage                                                                       | 404 naming the storage key | 404 `This file was not found`                            |

**Who notices.**

- A client, script or saved link that sends one of the old query keys, or relies on a bad value being ignored.
- A client that sent extra fields in one of the bodies above.
- A client that read the 400 on `GET /plans/my-plan` or on an OAuth-less vendor as "bad input".

**What to do.** Rename the keys. Send only declared fields. Read `fieldErrors` to place a message on the right
input: its keys are the wire names (`tenant_id`, `subscription.keys.auth`). The web app's own callers
(`agentActivityApi`, `getWebhookLogs`, the dev user switcher) moved in the same change.
