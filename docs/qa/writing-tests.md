---
title: Writing Tests
description: Where tests go, the role fixtures, factories from @sally/test-utils, the tag system, and the patterns that make tests stable.
---

# Writing Tests

This page is the patterns. [Running Tests](running-tests.md) is the commands. [Quality Gate](index.md) is the layout map.

## Where each kind of test goes

| Kind | Path | Tag | Project |
|---|---|---|---|
| Backend unit | `apps/backend/src/**/*.spec.ts` | — | Jest (`pnpm backend:test`) |
| Health / auth / security | `tests/smoke/<name>.spec.ts` | `@smoke` | `api` |
| RBAC matrix | `tests/rbac/<name>.spec.ts` (mostly auto-generated) | `@rbac` | `api` |
| API workflow | `tests/api/<domain>/<name>.spec.ts` | `@workflow` | `api` |
| API contract | `tests/api/contracts/<name>.spec.ts` | `@contract` | `api` |
| Browser | `tests/browser/<name>.spec.ts` | `@browser` | `browser` |
| Loadtest | `tests/loadtest/<name>.mjs` | — | (autocannon, not Playwright) |
| AI evals | `tests/evals/` | — | **Not active** |

For backend Jest patterns, see [Backend → Testing](../backend/testing.md). The rest of this page is about the Playwright tests in `tests/`.

## `@sally/test-utils` — the shared library

`packages/test-utils/src/` holds everything cross-cutting:

```
packages/test-utils/src/
├── auth/         Role fixtures — dispatcher, driver, admin, customer, super-admin
├── factories/    Entity factories — load, driver, vehicle, tenant, invoice, etc.
├── helpers/      Generic helpers (cookies, IDs, retry-until)
├── playwright/   Playwright-specific helpers (page hooks, network logging)
├── schemas/      Zod response schemas — single source of truth for contract tests
└── index.ts      Barrel export
```

Import via the workspace name:

```ts
import { dispatcherFixture, driverFixture, makeLoad, LoadResponseSchema } from '@sally/test-utils';
```

`tests/fixtures/` is a thin re-export layer — for legacy reasons some test files import from there. New tests should import directly from `@sally/test-utils`.

## Role fixtures

Each role has a fixture that gives you an authenticated `request` context. The fixture uses the `DevAuthGuard` on the backend to impersonate a user with that role for the active tenant — see `DEV_AUTH_SECRET` in [Running Tests](running-tests.md).

```ts
import { test, expect } from '@playwright/test';
import { dispatcherFixture } from '@sally/test-utils';

test.describe('@workflow dispatcher creates a load', () => {
  test('end-to-end create → assign → dispatch', async ({ request }) => {
    const dispatcher = await dispatcherFixture(request);

    // dispatcher.request — authenticated APIRequestContext, scoped to the tenant
    const load = await dispatcher.request.post('/v1/loads', {
      data: { customer_id: 'cust-1', /* … */ },
    }).then((r) => r.json());

    expect(load.status).toBe('DRAFT');
  });
});
```

For RBAC tests, you'll often run the same request through every role fixture and assert the expected status per role.

## Factories

Factories build valid entities without you having to remember every required field. Use them; don't hand-roll request bodies:

```ts
import { makeLoad, makeDriver } from '@sally/test-utils';

const loadBody = makeLoad({
  customer_id: 'cust-1',
  pickup_at: '2026-05-21T10:00:00Z',
  // ... overrides for whatever your test actually cares about
});

const created = await dispatcher.request.post('/v1/loads', { data: loadBody }).then((r) => r.json());
```

Factories use `@faker-js/faker` for the random fields; deterministic seeding is set up in `tests/config/global-setup.ts`.

If a factory you need doesn't exist, add it to `packages/test-utils/src/factories/`.

## Tag conventions

Playwright `--grep` filters on the tag in the test title or `test.describe` title. Use tags so subsets can run:

```ts
test.describe('@smoke health endpoint responds', () => { … });
test.describe('@rbac /v1/loads access matrix', () => { … });
test.describe('@workflow dispatcher full load lifecycle', () => { … });
test.describe('@contract /v1/loads response shape', () => { … });
test.describe('@browser dispatcher login flow', () => { … });
```

Multiple tags allowed:

```ts
test.describe('@workflow @contract dispatch load and check response shape', () => { … });
```

## Contract assertions — use the Zod schemas

For contract tests, never hand-write `expect(body.foo).toBe(...)` line by line. Use the schema:

```ts
import { LoadResponseSchema } from '@sally/test-utils';

test.describe('@contract GET /v1/loads/:id matches schema', () => {
  test('shape', async ({ request }) => {
    const dispatcher = await dispatcherFixture(request);
    const res = await dispatcher.request.get(`/v1/loads/${seededLoadId}`);
    const body = await res.json();

    // throws with field-level errors if anything drifted
    LoadResponseSchema.parse(body);
  });
});
```

When the backend response changes, update the schema in `packages/test-utils/src/schemas/` — and that update will surface in every consumer that imports the schema (frontend, contract tests, and `@sally/shared-types`).

## Workflow patterns

Workflow tests exercise a chain of operations. Structure:

```ts
test.describe('@workflow dispatcher full load lifecycle', () => {
  test('create → assign → dispatch → deliver → invoice → settle → pay', async ({ request }) => {
    const dispatcher = await dispatcherFixture(request);

    // 1. Create
    const load = await dispatcher.request.post('/v1/loads', { data: makeLoad() }).then((r) => r.json());

    // 2. Assign driver
    await dispatcher.request.patch(`/v1/loads/${load.id}/assignment`, {
      data: { driver_id: seededDriverId },
    });

    // 3. Dispatch
    await dispatcher.request.post(`/v1/loads/${load.id}/dispatch`);

    // 4. Deliver
    await dispatcher.request.post(`/v1/loads/${load.id}/deliver`);

    // 5. Invoice
    const invoice = await dispatcher.request.post('/v1/invoices', {
      data: { load_ids: [load.id] },
    }).then((r) => r.json());

    // 6. Settle
    // 7. Pay
    // ...

    expect(/* final state */).toBe(/* expected */);
  });
});
```

Keep each workflow test in one file. Don't share state across test files — they may run in parallel, and the dependency makes failures hard to diagnose.

## Idempotency

Tests run on a real (staging) tenant. Two rules:

1. **Don't assume a clean state.** Use `pnpm tenant:reset` between runs if you need one, but tests should generally tolerate residual data.
2. **Use factories with unique values.** Driver names, load reference numbers, etc., should be generated unique per run (factories do this by default).

If a test depends on specific seeded data, document it at the top of the file and put the seeding in `tests/config/global-setup.ts`.

## Browser test patterns

Browser tests use Playwright's `page` fixture, with the role fixture authenticating the browser session via injected cookies:

```ts
import { test, expect } from '@playwright/test';
import { dispatcherBrowserFixture } from '@sally/test-utils';

test.describe('@browser dispatcher loads list', () => {
  test('opens detail sheet on click', async ({ page, context }) => {
    await dispatcherBrowserFixture(context);  // injects auth cookies
    await page.goto('/dispatcher/loads');
    await page.getByRole('row').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
  });
});
```

Selectors should use role + accessible name (`getByRole`, `getByLabel`) rather than CSS classes or test IDs — accessibility-first selectors are stable across UI refactors.

## RBAC tests

Mostly auto-generated. The generator (`tests/scripts/generate-rbac-matrix.ts --write`) reads the backend controllers' role decorators and produces a `tests/rbac/generated.spec.ts` that runs every endpoint × every role and asserts the expected status. Re-run after controller changes:

```bash
cd tests && pnpm generate:rbac
# Or
cd tests && pnpm generate:rbac:diff   # show what would change
```

Hand-curated RBAC tests live alongside in `tests/rbac/` for cases the generator can't infer.

## Skills for QA

The `sally-qa` Claude skill is the canonical reference. Use `/sally-qa` for full QA Director mode; use `/sally-qa-add-api`, `/sally-qa-add-browser`, `/sally-qa-add-smoke` to scaffold new tests from a recent code change.

## Don'ts

- Don't put fixtures or factories in `tests/` — they go in `packages/test-utils/`.
- Don't hardcode tenant IDs, driver IDs, or anything that varies between environments — use the discovery commands or seed via global-setup.
- Don't catch and silently ignore assertion failures.
- Don't write `setTimeout(() => …, 1000)` — use Playwright's auto-waiting or `expect.poll`.
- Don't bypass the role fixtures by directly setting headers — that's how you forget to test as a different role.
