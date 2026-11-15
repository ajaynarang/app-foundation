---
name: app-qa
description: Senior QA lead for this platform. Use to run, triage or extend the @app/qa Playwright suite (smoke, RBAC matrix, API workflow and contract suites) against a local or deployed backend — "run QA", "test staging", "why is QA red", "does my PR have coverage", "add a test for X". Takes a mode as its first argument - run, fix, review, add-api, add-browser or add-smoke.
user-invocable: true
allowed-tools: Bash, Read, Write, Edit, Glob, Grep, Agent
owner: foundation
guards:
  - script:test:qa
  - script:verify:api
  - script:audit:rbac
---

# QA

You test the product the way its users use it, across every role, and you keep the automated suite at `tests/`
(`@app/qa`) in step with the code. Hand testing by a person is `app-test-notes`; driving the running app to see one
change work is `app-verify`.

**Command:** `/app-qa <mode> [args]` — $ARGUMENTS. No mode: `run`.

## The suite

- **Unit tests** are co-located (`apps/backend/src/**/*.spec.ts`, `packages/appshore/*/src/**/*.spec.ts`) and run with
  `pnpm test`. Not this skill's job.
- **The Playwright suite** is `tests/`, one project, `api` (`tests/playwright.config.ts`): `tests/smoke/` (`@smoke`),
  `tests/rbac/` (`@rbac`, the generated role by endpoint matrix), `tests/api/` (`@api`: the wire checks, the contract
  spec and the product's workflow suites). `tests/loadtest/` is separate (`pnpm --filter @app/qa test:load`).
- **Shared test library:** `packages/test-utils/` (`@app/test-utils`): the role fixtures (`asOwner`, `asAdmin`,
  `asMember`, `asSuperAdmin`, `asAnonymous`), factories and Zod response schemas. Never reinvent them in a spec.
- **Environment:** `tests/config/test-env.ts` is the one place with defaults (API on 8000, web on 3000). The suite
  signs in through the dev auth routes, guarded by `DEV_AUTH_SECRET`, which production never sets. `TENANT_ID` is a
  tenant slug: discover it with `pnpm qa:list-tenants`, never guess.
- **`pnpm verify:api`** builds, migrates, seeds and boots its own backend and runs the `api` project. It is the
  pre-PR gate for a wire change and needs `DATABASE_URL` and `REDIS_URL` exported.

## `run` — run the suite and report

Args: empty (all), `smoke`, `rbac` or `api`; add `local` to target localhost, otherwise ask which environment.

1. Confirm the target is the build you mean (`app-verify`, "whose code is answering").
2. Require `DEV_AUTH_SECRET` and `TENANT_ID`. For a deployed environment also `API_BASE_URL` and `WEB_BASE_URL`,
   from the operator, never invented.
3. Run it: all `pnpm test:qa`; `pnpm --filter @app/qa test:smoke`; `pnpm --filter @app/qa test:rbac`;
   `pnpm --filter @app/qa exec playwright test api`. With Doppler set up, the root `test:*:local` scripts inject the
   env.
4. `pnpm qa:report` writes the confidence matrix; the Playwright report is `reports/html/index.html` under `tests/` (gitignored).
5. Summarise: totals, each failing spec with a one-line reason, the report paths.

## `fix` — triage a red run

1. Read `reports/results.json` under `tests/` (written by the last run); list the failing specs and their errors.
2. For each: open its trace (`test-results/<test-id>/trace.zip` under `tests/`) and the spec. Decide test bug or app bug,
   with the evidence. A red test is never assumed to be the test's fault.
3. Propose the smallest fix for each. Ask before editing; never edit application code in this mode.

## `review` — does this change have coverage?

1. List the changed controllers and services:
   `git diff --name-only origin/<default-branch>...HEAD | grep -E 'apps/backend/src/.*\.(controller|service)\.ts$'`.
2. For each, the routes (decorators) and public service methods it changed.
3. Look for matching coverage in `tests/api/` and the RBAC matrix (`pnpm --filter @app/qa generate:rbac:diff`).
4. Report per file: covered, or missing, with the `/app-qa add-api <what>` call that would close it.
5. Run the gap audit: `pnpm audit:rbac` fails on a mutation route with no `@Roles()` or `@Public()`.

## `add-api` — a new workflow or contract suite

Args: what to test ("support ticket reopen").

1. Name the endpoints (method and path), the roles allowed and denied, and the response schema.
2. Read two neighbours under `tests/api/` to match their style (`tests/api/idempotency.spec.ts` is a good one).
3. Write `tests/api/<domain>/<feature>.spec.ts`, importing `test` and `expect` from `../fixtures/auth.fixture.js` (or
   `@app/test-utils/auth`): one happy path per allowed role (`@workflow`), a 403 per denied role (`@rbac`), the
   response checked against its `@app/test-utils/schemas` schema (`@contract`), another tenant's record answered 404.
   Missing factory data goes into `@app/test-utils`, never inline.
4. A new route: regenerate the matrix, `pnpm --filter @app/qa generate:rbac`.
5. Run the one file against a local backend, then `pnpm verify:api`. Report what was added.

## `add-browser` — a new user journey in a browser

Args: the journey ("an admin creates a support ticket from the list").

The suite has no browser project yet. The first browser suite adds one to `tests/playwright.config.ts` (`browser`,
`testMatch` on `browser/**/*.spec.ts`, `baseURL` from `ENV.webBaseUrl`) and a `test:browser` script to
`tests/package.json`, in the same PR. Then:

1. Name the role, the pages, the actions and the assertions (URL, visible text, toast, the data after).
2. Write `tests/browser/<slug>.spec.ts`. Start signed in: inject the role's session through `page.addInitScript`
   rather than typing into the login form, except in a spec that tests login itself.
3. Select by role and name (`getByRole('button', { name: /new ticket/i })`), never by CSS class.
4. Run it, then report.

## `add-smoke` — a critical read or health check

1. Write `tests/smoke/<slug>.spec.ts`, tagged `@smoke`, under five seconds, read-only. `tests/smoke/health.spec.ts`
   is the shape.
2. Run `pnpm --filter @app/qa test:smoke` and report.

## Always

- Run against a real API. No mocks and no stubs in this suite.
- Tag every test: `@smoke`, `@rbac`, `@api`, `@workflow`, `@contract`, `@browser`.
- Regenerate the RBAC matrix whenever a route or role changes.
- Report failures honestly, with the evidence; an unrun suite is reported as not run.
- Never weaken the dev auth guard to make a run pass. A missing `DEV_AUTH_SECRET` is an environment fix.
- Never point a writing suite at production.
