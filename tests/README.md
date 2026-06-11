# @app/qa — QA Suite

Playwright-based QA for the platform starter. One framework, one package, all cross-cutting tests (smoke, RBAC, loadtest). Add your domain workflow suites under `api/` as your app grows.

## Suites

| Suite    | Tag      | What it tests                                            | Speed |
| -------- | -------- | -------------------------------------------------------- | ----- |
| smoke    | `@smoke` | Health, auth, critical reads, security headers           | ~30s  |
| rbac     | `@rbac`  | Every endpoint × every role → expected status            | ~2min |
| loadtest | —        | Baseline perf (50 concurrent users × platform endpoints) | ~5min |

## Directory layout

```
tests/
  smoke/                     — health + security-headers + auth
  rbac/                      — role × endpoint matrix (generated)
  loadtest/                  — autocannon baselines
  fixtures/                  — thin re-exports to @app/test-utils
  config/                    — global-setup, test-env, capability detection
  scripts/                   — RBAC matrix gen, gap audit, confidence matrix
```

## Quick start

```bash
# Backend must be running (default localhost:8000) with DEV_AUTH_SECRET set.
DEV_AUTH_SECRET=<secret> pnpm qa:list-tenants    # discover valid TENANT_ID
DEV_AUTH_SECRET=<secret> TENANT_ID=<id> pnpm test:qa

# Individual suites
DEV_AUTH_SECRET=<secret> TENANT_ID=<id> pnpm --filter @app/qa test:smoke
DEV_AUTH_SECRET=<secret> TENANT_ID=<id> pnpm --filter @app/qa test:rbac
```

### Against a deployed environment

```bash
DEV_AUTH_SECRET=<stg-secret> \
TENANT_ID=<id> \
API_BASE_URL=https://api-staging.example.com/api/v1 \
WEB_BASE_URL=https://staging.example.com \
pnpm test:qa
```

## Authentication

Tests authenticate via `/dev/users` + `/dev/switch` on the backend. Both endpoints are gated by `DevAuthGuard` which enforces the `x-dev-auth-secret` header with `crypto.timingSafeEqual`, plus a hard-block if `NODE_ENV === 'production'`.

- **Local**: export `DEV_AUTH_SECRET` in your shell (or use a secrets manager like Doppler — see `docs/doppler.md`).
- **CI**: `DEV_AUTH_SECRET` as a GitHub Actions repo secret.
- **Production**: hard-blocked by the NODE_ENV check; leave the secret unset.

The UI flag `NEXT_PUBLIC_DEV_SWITCHER` is independent — it only toggles the UI button visibility.

## Fixtures + factories

All from `@app/test-utils`. Never re-invent.

```ts
import { test, expect } from '@app/test-utils/auth';
import { buildUser } from '@app/test-utils/factories';
import { PlatformSchemas, expectContract } from '@app/test-utils/schemas';

test('admin creates a user @workflow', async ({ asAdmin }) => {
  const res = await asAdmin.post('/users', buildUser());
  expect(res.status()).toBe(201);
  expectContract(PlatformSchemas.UserCreateResponseSchema, await res.json());
});
```

Available fixtures: `asMember`, `asAdmin`, `asOwner`, `asSuperAdmin`, `asAnonymous`, `asRole('ROLE')`.

When you add a domain, copy the example pair (`@app/test-utils` → `factories/example.ts` + `schemas/example.ts`) as the pattern for your factories and response schemas.

## Reports

```bash
pnpm qa:report
open tests/reports/html/index.html              # Playwright HTML report
open tests/reports/confidence-matrix.html       # confidence dashboard
```

## Rules

1. Never modify application code — this package is tests only.
2. Always run against real API — no mocks, no stubs.
3. `TENANT_ID` is mandatory. Use `pnpm qa:list-tenants` if unsure.
4. Regenerate RBAC on every material change: `pnpm --filter @app/qa generate:rbac`.
5. Run RBAC gap audit before PR: `pnpm --filter @app/qa exec tsx scripts/audit-rbac-gaps.ts`.
6. Tag tests: `@smoke`, `@rbac`, `@workflow`, `@contract`.
7. Use `@app/test-utils` — never copy-paste factories or auth helpers.
8. Feature-gated endpoints: tag with `@requires:plan-<feature>`. Never use `test.skip()` at runtime.

---

## The 9-Criteria Rubric

Every new or rewritten API test MUST satisfy all 9 criteria. A PR that adds a test
failing any criterion is rejected.

### Criterion 1 — Use role fixture from `@app/test-utils/auth`

No raw tokens. Always use a named fixture.

```ts
// ❌ Don't
const token = process.env.MEMBER_TOKEN;
const res = await request.get('/users', { headers: { Authorization: `Bearer ${token}` } });

// ✅ Do
test('admin lists users @workflow', async ({ asAdmin }) => {
  const res = await asAdmin.get('/users');
});
```

### Criterion 2 — Use factory from `@app/test-utils/factories`

No inline JSON for mutations.

```ts
// ❌ Don't
await asAdmin.post('/users', { firstName: 'John', lastName: 'Smith', email: 'j@s.com', role: 'MEMBER' });

// ✅ Do
import { buildUser } from '@app/test-utils/factories';
await asAdmin.post('/users', buildUser());
```

### Criterion 3 — Assert specific HTTP status code

Never assert `.ok()`. Use exact numeric status.

```ts
// ❌ Don't
expect(res.ok()).toBeTruthy();

// ✅ Do
expect(res.status()).toBe(201);
```

### Criterion 4 — Assert response schema via `expectContract`

Import from `@app/shared-types` where available. Always use `.strict()`.

```ts
// ❌ Don't
const body = await res.json();
expect(body.id).toBeTruthy();

// ✅ Do
import { expectContract, PlatformSchemas } from '@app/test-utils/schemas';
expectContract(PlatformSchemas.UserDetailSchema, await res.json());
```

### Criterion 5 — Assert at least one semantic property

Verify that the response reflects the intent of the operation.

```ts
// ❌ Don't (schema pass is not enough)
expectContract(UserDetailSchema, body);

// ✅ Do
expect(body.isActive).toBe(true);
```

### Criterion 6 — Assert persistence via a second request

GET after POST to confirm the entity exists; GET 404 after DELETE to confirm it's gone.

```ts
// ❌ Don't
const createRes = await asAdmin.post('/users', buildUser());
expect(createRes.status()).toBe(201);

// ✅ Do
const createRes = await asAdmin.post('/users', buildUser());
expect(createRes.status()).toBe(201);
const { userId } = await createRes.json();
const getRes = await asAdmin.get(`/users/${userId}`);
expect(getRes.status()).toBe(200);
```

### Criterion 7 — Clean up created data

Use `afterEach` or inline cleanup so tests are stateless.

```ts
// ✅ Do
let userId: string;

afterEach(async ({ asAdmin }) => {
  if (userId) {
    await asAdmin.post(`/users/${userId}/deactivate`, {});
  }
});
```

### Criterion 8 — Tag appropriately

Every test gets at minimum `@workflow` or `@contract`. Feature-gated tests get `@requires:plan-<feature>`.

```ts
// ✅ Do
test('AI assistant answers a prompt @workflow @requires:plan-ai_assistant', async () => { ... });
```

### Criterion 9 — Zero runtime `test.skip()`

If the test can't run because the tenant lacks a feature, tag it `@requires:plan-<feature>` and
let Playwright exclude it at collection time. Never call `test.skip()` with a condition.

```ts
// ❌ Don't
if (!tenantHasFeature('ai_assistant')) test.skip();

// ✅ Do — tag it, let playwright.config.ts grep-exclude it
test('streams a chat turn @workflow @requires:plan-ai_assistant', async () => { ... });
```

---

## Tag Taxonomy

```
@smoke               Health, critical reads. <60s total.
@workflow            Happy-path CRUD or multi-step operation.
@contract            Shape-only (Zod strict validation).
@rbac                Role × endpoint matrix (generated).
@requires:plan-<F>   Needs plan feature F enabled on the tenant.
@requires:data-<D>   Needs specific seeded data on the tenant.
                     Examples: data-pending-tenant, data-job-row.
@destructive         Mutates state beyond its own scope. Never on prod tenants.
@slow                >5s per test. Excluded from fast smoke loops.
```

---

## ENABLE_ALL_TESTS Override

By default, tests tagged `@requires:plan-<feature>` are excluded from collection when the
target tenant does not have that feature enabled. This prevents noisy skip counts.

Set `ENABLE_ALL_TESTS=1` to disable the feature filter and run every test regardless of
tenant capabilities. Use this when:

- The tenant has all features enabled (e.g., a freshly seeded tenant after `pnpm qa:enable-features`).
- You want to see which plan-gated tests exist, even those that would fail.
- CI needs to gate on a full test count (separate from feature availability).

---

## Tenant Capability Detection

### How it works

At global-setup time, `tests/config/global-setup.ts` calls `detectCapabilities()` from
`tests/config/detect-capabilities.ts`. This function:

1. Acquires a super-admin token via the dev switcher (`POST /dev/switch`).
2. Calls `GET /plans/tenant/:tenantId` with that token.
3. Reads `planConfig.entitlements[]` — each entry has `{ feature: string, enabled: boolean }`.
4. Splits into `enabled` and `disabled` sets.
5. Writes the result to `tests/config/tenant-capabilities.json` (gitignored).

Simultaneously, `playwright.config.ts` runs the same detection before test collection to
compute a `grepInvert` regex. Tests tagged `@requires:plan-<feature>` for any disabled
feature are excluded from Playwright's collection entirely — they never appear in the report
as "skipped", they simply do not run.

### Why no runtime skips

Runtime `test.skip(condition, …)` produces noisy "skipped" counts in the HTML report.
More importantly, it means the test is collected, started, and then aborted, which:

- Inflates the reported test count with meaningless entries.
- Obscures genuine failures from actual skips.
- Makes CI failure analysis harder.

Collection-time exclusion via `grepInvert` means the test count = tests valid for this tenant.

### Inspecting `tenant-capabilities.json`

After any test run with `TENANT_ID` set:

```bash
cat tests/config/tenant-capabilities.json
```

If `disabledFeatures` lists a feature you expect to be enabled, run:

```bash
pnpm qa:enable-features --tenant <tenant-id>
```

---

## Troubleshooting

### Tests skipped unexpectedly

The Playwright grep filter excluded them because the tenant lacks the required plan feature.

```bash
# 1. Inspect what's enabled
cat tests/config/tenant-capabilities.json

# 2. Enable all features on the tenant
pnpm qa:enable-features --tenant <tenant-id>

# 3. Re-run — or bypass filtering entirely:
ENABLE_ALL_TESTS=1 TENANT_ID=<tenant-id> pnpm test:qa
```

### `detect-capabilities` errors in console

Possible causes:

1. **`DEV_AUTH_SECRET` not set** — export it in your shell (must match the backend's value).
2. **Backend not running** — start it with `pnpm dev` from the repo root.
3. **Super-admin user doesn't exist** — run the seed: `cd apps/backend && pnpm db:seed`.
4. **Wrong API base URL** — verify `API_BASE_URL` or `tests/config/test-env.ts` defaults (localhost:8000).

These errors are non-fatal: capability detection failure causes the full suite to run
(all plan-gated tests included). Check the warning message in the test output for details.
