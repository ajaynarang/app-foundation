---
owner: foundation
sources:
  - apps/backend/package.json
  - apps/backend/test/jest-env-defaults.js
  - packages/appshore/platform/src/test/index.ts
  - packages/appshore/platform/src/test/mocks/prisma.mock.ts
  - packages/appshore/platform/src/test/mocks/outbox.mock.ts#createMockOutbox
  - packages/appshore/platform/src/test/helpers/cursor-walk.ts#walkCursorList
  - packages/appshore/platform/src/test/helpers/field-errors.helpers.ts#fieldErrorsOf
  - apps/backend/src/domains/support/__tests__/support.service.spec.ts
  - apps/backend/src/platform-glue/events/__tests__/double-delivery.spec.ts
  - tools/verify/verify.sh
guards:
  - script:test
  - script:verify
  - script:verify:arch
  - script:verify:api
  - script:type-check
---

# Testing: where tests live, the failure modes, what to cover, guard specs

Write the test that would catch the bug, not the one that restates the implementation. A green suite has lied
before; every rule below is here because of one.

## Where tests live

| Kind                        | Where                                                                             | Run                                            |
| --------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Backend unit                | co-located `**/__tests__/*.spec.ts` under `apps/backend/src`                      | `pnpm --filter @app/backend test`              |
| Package unit                | `packages/appshore/*/src/**/*.spec.ts`, `packages/shared-types`, `test-utils`     | `pnpm test` (turbo runs every package)         |
| Integration (real Postgres) | `*.integration.spec.ts`; skipped when `DATABASE_URL` is unset or unusable         | `pnpm --filter @app/backend test` with the URL |
| Architecture guards         | `apps/backend/src/architecture/*.spec.ts`                                         | `pnpm verify:arch` (also the pre-push hook)    |
| Web unit and guards         | `apps/web/src/**/__tests__/*.test.{ts,tsx}`; web-core's tests run in the web jest | `pnpm --filter @app/web test`                  |
| API (booted backend)        | `tests/` (`@app/qa`, Playwright `api` project)                                    | `pnpm verify:api`                              |
| Repository guards and hooks | `tools/guards/*.test.mjs`, `.claude/hooks/tests/*.test.mjs`                       | `pnpm test:guards`, `pnpm test:hooks`          |

Fixtures come from `@appshore/platform/test/*`: `createMockPrisma`, `createMockOutbox`, the cache and queue mocks, the
tenant and user factories, and the helpers `walkCursorList`, `readBodyDto`, `fieldErrorsOf`.

## Rules

### What a test is

- Write the assertion from the requirement, watch it fail, then make it pass. A test that passed on its first run has
  not shown it can fail; find out why before moving on. [review-only: only the author knows the order]
- Assert specific rows (ids, statuses, order), never an arithmetic identity such as
  `expect(all.length).toBe(a.length + b.length)`. [review-only: needs reading]
- A change that crosses a seam (service to serializer, backend to web, a renamed field) gets one test that spans the
  seam, or `pnpm verify:api` drives the whole path. Green on both sides proves nothing about the mapper between.
  [guard: script:verify:api]
- Test the write, then read it back: a rename fixed on the read path and not the write path passes every read test.
  [review-only: needs reading]
- Exercise the path that writes a field first (the create), not an update of a row that was already right.
  [review-only: needs reading]
- A list test walks real pages with `walkCursorList` over `fixtureModel(rows)`, including rows that share a timestamp,
  and asserts every row comes back once. [guard: api-contract.spec.ts]
- Parse a structure and assert the parsed value; never `.toContain(id.slice(0, 8))`. Control the clock with Jest's
  fake timers; never sleep. [review-only: needs reading]
- No snapshot test for behaviour: a snapshot updates silently when the behaviour changes. A DTO's shape may be one.
  [review-only: needs reading]

### Shape of a spec

- One `describe` per class, one `it` per behavioural branch, named for the behaviour
  (`it('answers 404 for another tenant's ticket')`). Arrange, act, assert; no mutable fixture shared across tests.
  [review-only: needs reading]
- Mock at module boundaries only (Prisma, other services, vendor clients), with the shared mocks; never mock an
  internal helper. [review-only: needs reading]
- Unit specs run with the tenant context strict (`RLS_STRICT_CONTEXT=throw`, set in
  `apps/backend/test/jest-env-defaults.js`), so work that runs with no declared context fails the spec.
  [guard: rls-context-coverage.spec.ts]
- Jest does not type-check: the transform runs with diagnostics off. A type error in a spec shows only in
  `pnpm type-check`, so run it before saying a change is done. [guard: script:type-check]
- An integration spec reads `DATABASE_URL` and `REDIS_URL` and skips itself when they are unset; it never assumes a
  default database. [review-only: needs reading]

### What to cover, per unit

- The happy path, and each refused branch: an illegal transition (409), a missing record (404), another tenant's
  record (404, never 403), a role refusal (403), a field error (400 that names the field, checked with
  `fieldErrorsOf`). [review-only: coverage of branches needs reading]
- Tenant isolation, every time: a record in another tenant is invisible to the read and untouchable by the write.
  [review-only: needs reading]
- Idempotency wherever the code runs at least once (a queue handler, an event listener, a webhook, a deadline
  handler): run it twice and assert the second run changed nothing and emitted nothing. A new event consumer is added
  to `double-delivery.spec.ts`. [guard: double-delivery.spec.ts]
- A rollback publishes nothing: with `createMockOutbox`, a callback that throws records no event.
  [guard: no-direct-emit.spec.ts]
- New backend code is covered to about 90%. No threshold is configured; the number is a review prompt, and coverage of
  assertions that restate the code catches nothing. [review-only: no diff-coverage tool is chosen yet]

### Guard specs

- A rule a machine can check is a spec in `apps/backend/src/architecture/` (or a web guard test), not a paragraph.
  When a guard fails, fix the code; widening an allowlist is a decision with a reason in the entry and the commit.
  [guard: script:verify:arch]
- Never weaken or delete a test to make it pass. [review-only: a diff shows it]

## Recipe: test a service and its controller

Copied from the reference slice, `apps/backend/src/domains/support/__tests__/`:

1. Build the service in a Nest testing module with `PrismaService` replaced by a mock (`createMockPrisma()` for a new
   spec; the support spec predates it and hand-builds one).
2. One `it` per branch: a missing ticket is a `NotFoundException`; the tenant filter is on every read; the list is
   walked over `fixtureModel(rows)` built from `tiedTimestamps(9)`, with one row in another tenant, and every one of the
   tenant's rows comes back once ("walking pages over a fixture" in `support.service.spec.ts`).
3. The controller spec checks what the route adds (the DTO it reads, the status it answers), not the service again.
4. Run `pnpm --filter @app/backend exec jest src/domains/support`, then `pnpm type-check`.
5. If the change touched the wire, run `pnpm verify:api` (it needs `DATABASE_URL` and `REDIS_URL` exported) and paste
   its last line into the pull request with the `pnpm verify` line.

## Before you claim it passes

Run the command and read its output. "Should pass now" is not a result. If a suite failed, say so with the output; if
you skipped one, say which and why.

## Flag in review

- An assertion copied from the implementation, or one that cannot fail.
- A mocked internal helper.
- A list test at one page size.
- A missing other-tenant case.
- An at-least-once handler with no run-twice test.
- A snapshot of behaviour.
- A guard spec loosened in the same diff as the code it caught.
