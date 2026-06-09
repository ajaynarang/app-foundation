# @app/qa — QA Suite

Playwright-based QA for the platform. One framework, one package, all cross-cutting tests (smoke, RBAC, API workflows, browser, loadtest, AI evals scaffold).

Spec: `.docs/plans/2026-04-17-qa-coverage/architecture-spec.md`
Plan: `.docs/plans/2026-04-17-qa-coverage/architecture-plan.md`
Phase roadmap: `.docs/plans/2026-04-17-qa-coverage/00-overview.md`

## Suites

| Suite    | Tag                       | What it tests                                                          | Speed |
| -------- | ------------------------- | ---------------------------------------------------------------------- | ----- |
| smoke    | `@smoke`                  | Health, auth, critical reads, security headers                         | ~30s  |
| rbac     | `@rbac`                   | Every endpoint × every role → expected status                          | ~2min |
| api      | `@workflow` / `@contract` | Multi-step domain chains (fleet, financials, operations, platform, ai) | ~3min |
| browser  | `@browser`                | Login, dashboard, page navigation, no JS errors                        | ~2min |
| loadtest | —                         | Baseline perf (50 concurrent users × top 10 endpoints)                 | ~5min |
| evals    | —                         | **Scaffold only** — not active (see `tests/evals/README.md`)           | —     |

## Directory layout

```
tests/
  smoke/                     — health + security-headers + auth
  rbac/                      — role × endpoint matrix (generated + hand-curated)
  api/                       — workflow + contract tests grouped by backend domain
    fleet/                   — drivers, vehicles, loads, trailers, recurring lanes, docs
    financials/              — invoicing, settlements, close-out, IFTA, lumper
    operations/              — alerts, command center, routing, convoy, smart routes
    platform/                — admin, integrations (Samsara, QuickBooks, EDI), tickets
    ai/                      — document intel, email intake
    contracts/               — response-shape sweeps across all endpoints
  browser/                   — Playwright UI critical paths
  evals/                     — AI evals scaffold (inactive)
  loadtest/                  — autocannon baselines
  fixtures/                  — thin re-exports to @app/test-utils
  config/                    — global-setup, test-env
  scripts/                   — RBAC matrix gen, gap audit, confidence matrix
```

## Quick start

### Local (Doppler-injected, no .env files)

Requires `doppler login` once per machine. Secrets come from `app-backend/dev` — no local config files to keep in sync.

```bash
pnpm qa:list-tenants                     # discover valid TENANT_ID
TENANT_ID=<id> pnpm test:qa:local        # full suite against localhost:8001

# Individual suites
TENANT_ID=<id> pnpm test:smoke:local
TENANT_ID=<id> pnpm test:rbac:local
TENANT_ID=<id> pnpm test:api:local
TENANT_ID=<id> pnpm test:browser:local
```

### Against staging

```bash
DEV_AUTH_SECRET=<stg-secret> \
TENANT_ID=<id> \
API_BASE_URL=https://app-api-staging.appshore.in/api/v1 \
WEB_BASE_URL=https://staging.app.appshore.in \
pnpm test:qa
```

### Individual suites

```bash
pnpm --filter @app/qa test:smoke
pnpm --filter @app/qa test:rbac
pnpm --filter @app/qa test:api
pnpm --filter @app/qa test:contracts
pnpm --filter @app/qa test:browser
```

## Authentication

Tests authenticate via `/dev/users` + `/dev/switch` on the backend. Both endpoints are gated by `DevAuthGuard` which enforces the `x-dev-auth-secret` header with `crypto.timingSafeEqual`, plus a hard-block if `NODE_ENV === 'production'`.

- **Local**: injected by `doppler run --project app-backend --config dev --` (via `pnpm test:qa:local`). No `.env.test` file.
- **CI**: `DEV_AUTH_SECRET` is a GitHub Actions repo secret (mirrors Doppler `app-backend/stg`).
- **Production**: hard-blocked by NODE_ENV check + secret unset in Doppler `app-backend/prd`.

The UI flag `NEXT_PUBLIC_ENABLE_DEV_SWITCHER` is independent — it only toggles the UI button visibility.

## Fixtures + factories

All from `@app/test-utils`. Never re-invent.

```ts
import { test, expect } from '@app/test-utils/auth';
import { buildDriver } from '@app/test-utils/factories';
import { DriverSchemas, expectContract } from '@app/test-utils/schemas';

test('dispatcher creates a driver @workflow', async ({ asDispatcher }) => {
  const res = await asDispatcher.post('/drivers', buildDriver());
  expect(res.status()).toBe(201);
  expectContract(DriverSchemas.CreateResponse, await res.json());
});
```

Available fixtures: `asDispatcher`, `asAdmin`, `asOwner`, `asDriver`, `asCustomer`, `asSuperAdmin`, `asAnonymous`, `asRole('ROLE')`.

## Adding new tests — use slash commands

- `/app-qa-add-api <desc>` — scaffold API test
- `/app-qa-add-browser <desc>` — scaffold browser E2E
- `/app-qa-add-smoke <desc>` — scaffold smoke
- `/app-qa-run [suite]` — run suite + publish report
- `/app-qa-fix` — triage last-run failures
- `/app-qa-review` — audit PR for missing coverage

## Reports

```bash
pnpm qa:report
open tests/reports/html/index.html              # Playwright HTML report
open tests/reports/confidence-matrix.html       # confidence dashboard
```

## CI

`.github/workflows/quality-gate.yml` — **manual-dispatch only** in this round. No PR/push/schedule triggers.

Trigger: GitHub Actions → "Quality Gate" → Run workflow → pick suite + tenant.

Artifacts per run:

- `qa-report-<n>` — reports + Playwright HTML + JUnit (30-day retention).
- `qa-traces-<n>` — traces, videos, screenshots (7-day retention).
- `unit-results-<n>` — unit test JSON + coverage summary (30-day retention).

## Rules

1. Never modify application code — this package is tests only.
2. Always run against real API — no mocks, no stubs.
3. `TENANT_ID` is mandatory. Use `pnpm qa:list-tenants` if unsure.
4. Regenerate RBAC on every material change: `pnpm --filter @app/qa generate:rbac`.
5. Run RBAC gap audit before PR: `pnpm --filter @app/qa exec tsx scripts/audit-rbac-gaps.ts`.
6. Tag tests: `@smoke`, `@rbac`, `@workflow`, `@contract`, `@browser`.
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
const token = process.env.DISPATCHER_TOKEN;
const res = await request.get('/loads', { headers: { Authorization: `Bearer ${token}` } });

// ✅ Do
test('dispatcher lists loads @workflow', async ({ asDispatcher }) => {
  const res = await asDispatcher.get('/loads');
});
```

### Criterion 2 — Use factory from `@app/test-utils/factories`

No inline JSON for mutations.

```ts
// ❌ Don't
await asDispatcher.post('/drivers', { firstName: 'John', lastName: 'Smith', email: 'j@s.com', licenseNumber: 'DL123' });

// ✅ Do
import { buildDriver } from '@app/test-utils/factories';
await asDispatcher.post('/drivers', buildDriver());
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
import { expectContract } from '@app/test-utils/schemas';
import { DriverSchema } from '@app/shared-types';
expectContract(DriverSchema.strict(), await res.json());
```

### Criterion 5 — Assert at least one semantic property

Verify that the response reflects the intent of the operation.

```ts
// ❌ Don't (schema pass is not enough)
expectContract(LoadStatusChangeSchema, body);

// ✅ Do
expect(body.status).toBe('IN_TRANSIT');
```

### Criterion 6 — Assert persistence via a second request

GET after POST to confirm the entity exists; GET 404 after DELETE to confirm it's gone.

```ts
// ❌ Don't
const createRes = await asDispatcher.post('/drivers', buildDriver());
expect(createRes.status()).toBe(201);

// ✅ Do
const createRes = await asDispatcher.post('/drivers', buildDriver());
expect(createRes.status()).toBe(201);
const { driverId } = await createRes.json();
const getRes = await asDispatcher.get(`/drivers/${driverId}`);
expect(getRes.status()).toBe(200);
```

### Criterion 7 — Clean up created data

Use `afterEach` or inline cleanup so tests are stateless.

```ts
// ✅ Do
let driverId: string;

afterEach(async ({ asDispatcher }) => {
  if (driverId) {
    await asDispatcher.post(`/drivers/${driverId}/deactivate`, {});
  }
});
```

### Criterion 8 — Tag appropriately

Every test gets at minimum `@workflow` or `@contract`. Feature-gated tests get `@requires:plan-<feature>`.

```ts
// ✅ Do
test('invoice is generated from delivered load @workflow @requires:plan-invoicing', async () => { ... });
```

### Criterion 9 — Zero runtime `test.skip()`

If the test can't run because the tenant lacks a feature, tag it `@requires:plan-<feature>` and
let Playwright exclude it at collection time. Never call `test.skip()` with a condition.

```ts
// ❌ Don't
if (!tenantHasFeature('quickbooks')) test.skip();

// ✅ Do — tag it, let playwright.config.ts grep-exclude it
test('syncs to QuickBooks @workflow @requires:plan-quickbooks', async () => { ... });
```

---

## Tag Taxonomy

```
@smoke               Health, critical reads. <60s total.
@workflow            Happy-path CRUD or multi-step operation.
@contract            Shape-only (Zod strict validation).
@rbac                Role × endpoint matrix (existing, unchanged).
@requires:plan-<F>   Needs plan feature F enabled on the tenant.
                     Examples: plan-quickbooks, plan-samsara, plan-ai-parser,
                     plan-command-center, plan-ai-chat, plan-email-intake.
@requires:data-<D>   Needs specific seeded data on the tenant.
                     Examples: data-completed-job, data-active-integration.
@destructive         Mutates state beyond its own scope. Never on prod tenants.
@slow                >5s per test. Excluded from fast smoke loops.
```

**Example usages:**

```ts
// Smoke
test('health endpoint returns 200 @smoke', async ({ asAnonymous }) => { ... });

// Workflow (full CRUD cycle)
test('dispatcher creates and assigns a load @workflow', async ({ asDispatcher }) => { ... });

// Contract (shape only)
test('GET /drivers response matches DriverSchema @contract', async ({ asDispatcher }) => { ... });

// Plan-gated (excluded at collection time if tenant lacks Samsara integration)
test('syncs driver HOS from Samsara @workflow @requires:plan-samsara', async ({ asDispatcher }) => { ... });

// Data dependency (excluded at collection time if demo data is missing)
test('generates invoice from completed load @workflow @requires:data-completed-job', async () => { ... });

// Destructive (only runs against demo tenants, never staging production)
test('hard-deletes all loads @destructive', async ({ asSuperAdmin }) => { ... });
```

---

## ENABLE_ALL_TESTS Override

By default, tests tagged `@requires:plan-<feature>` are excluded from collection when the
target tenant does not have that feature enabled. This prevents noisy skip counts.

Set `ENABLE_ALL_TESTS=1` to disable the feature filter and run every test regardless of
tenant capabilities. Use this when:

- The tenant has all features enabled (e.g., a freshly seeded demo tenant after `pnpm qa:enable-features`).
- You want to see which plan-gated tests exist, even those that would fail.
- CI needs to gate on a full test count (separate from feature availability).

**Example CI usage:**

```yaml
# .github/workflows/quality-gate.yml
- name: Run full QA suite (all features must be enabled on demo-northstar)
  env:
    TENANT_ID: demo-northstar-2026
    ENABLE_ALL_TESTS: '1'
    DEV_AUTH_SECRET: ${{ secrets.DEV_AUTH_SECRET }}
  run: pnpm test:qa:local
```

Without `ENABLE_ALL_TESTS=1`, the standard CI run excludes plan-gated tests that the
tenant does not support, so the reported test count reflects only tests valid for that
tenant's plan.

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
# {
#   "tenantId": "demo-northstar-2026",
#   "planKey": "SCALE",
#   "enabledFeatures": ["samsara", "quickbooks", "ai_chat"],
#   "disabledFeatures": ["email_intake", "command_center"],
#   "generatedAt": "2026-04-17T10:00:00.000Z"
# }
```

If `disabledFeatures` lists a feature you expect to be enabled, run:

```bash
pnpm qa:enable-features --tenant demo-northstar-2026
```

---

## Adding a New Test

Use the `/app-qa-add-api` slash command for API tests:

```
/app-qa-add-api Create and assign a load
```

The command will scaffold a test file following the 9-criteria rubric. After scaffolding,
verify the following before committing:

- [ ] Role fixture used (no raw tokens)
- [ ] Factory used for request payload (no inline JSON)
- [ ] Specific status code asserted (`toBe(201)`, not `toBeTruthy()`)
- [ ] Schema asserted via `expectContract(Schema.strict(), body)`
- [ ] Semantic property asserted (field echo or state change)
- [ ] Persistence verified (second GET request)
- [ ] Cleanup in `afterEach`
- [ ] Tags: `@workflow` / `@contract` / `@requires:plan-<F>` as appropriate
- [ ] Zero `test.skip(condition, …)` calls

---

## Troubleshooting

### Tests skipped unexpectedly

The Playwright grep filter excluded them because the tenant lacks the required plan feature.

```bash
# 1. Inspect what's enabled
cat tests/config/tenant-capabilities.json

# 2. Enable all features on the demo tenant
pnpm qa:enable-features --tenant demo-northstar-2026

# 3. Re-run — or bypass filtering entirely:
ENABLE_ALL_TESTS=1 TENANT_ID=demo-northstar-2026 pnpm test:qa:local
```

### Tenant state polluted (tests failing due to stale data)

Hard-reset the demo tenant and start fresh:

```bash
pnpm qa:tenant:reset --tenant demo-northstar-2026 --yes
# Then re-seed if needed:
cd apps/backend && pnpm setup:demo
```

### `detect-capabilities` errors in console

Possible causes:

1. **`DEV_AUTH_SECRET` not set** — check that Doppler is injecting it:
   ```bash
   doppler run --project app-backend --config dev -- env | grep DEV_AUTH_SECRET
   ```
2. **Backend not running** — start it with `pnpm doppler:backend` from the repo root.
3. **Super-admin user doesn't exist** — run `pnpm setup:base` in `apps/backend/`.
4. **Wrong API base URL** — verify `API_BASE_URL` or `tests/config/test-env.ts` defaults.

These errors are non-fatal: capability detection failure causes the full suite to run
(all plan-gated tests included). Check the warning message in the test output for details.
