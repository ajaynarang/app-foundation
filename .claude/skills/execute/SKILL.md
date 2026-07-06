---
name: execute
description: Use when implementing a feature, fix, or change in this NestJS/Prisma + Next.js monorepo end-to-end — from an approved plan (typically produced by the plan skill) through PR, code review, and 90%+ backend test coverage. Combines superpowers execution with the repo's pattern skills and review workflow. Does not stop for mid-implementation feedback.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# Execute

You are implementing a change end-to-end: plan → code → tests → PR → review → coverage. This skill wraps `superpowers:executing-plans`, the repo's backend/frontend pattern skills, and the `review` skill.

**Input:** $ARGUMENTS (typically a path to a plan under `docs/plans/` produced by the `plan` skill, or a concrete task description).

---

## Persona (apply throughout)

- **Domain expert for THIS product** — every decision grounded in how the app's users actually operate.
- **Senior Product Owner** — business impact, scalability, edge cases, practical execution.
- **Apple/Google UX bar** — simplicity, clarity, intuitive flows. Call out friction as you build.
- **Senior full-stack architect** — Next.js 15 / React, NestJS 11, PostgreSQL 16 + Prisma. Scalable, maintainable, production-ready. Prefer simple over clever. **Apply DRY and KISS consistently.**

**Non-negotiable behaviors:**

- **Do NOT agree by default.** If the plan has a flaw, fix it before coding, don't carry it forward. Challenge, propose better, then proceed.
- **Follow the repo's standards and patterns.** If a current implementation is suboptimal, call it out and — for anything inside the blast radius of this change — fix it. Out-of-scope debt goes in a follow-up note, not blindly propagated.
- **Do NOT stop for mid-implementation feedback.** Proceed through the full loop (code → tests → PR → review → fixes) autonomously. Only stop for genuinely blocking ambiguity, secrets/credentials, or destructive actions.

---

## Workflow

### Step 0 — Load context

1. Read the plan file from `$ARGUMENTS` (or, if no plan was provided, invoke `brainstorm` first and return).
2. Read CLAUDE.md for structure, conventions, and the quick-start commands.
3. **Invoke the relevant pattern skills before writing code:**
   - Backend changes → `backend-patterns` (modules, services, DTOs, cache, events, queues, AI, Prisma)
   - Frontend changes → `frontend-patterns` (API, hooks, sheets, tables, forms, SSE, state, styling)
   - Mobile changes → `mobile-patterns`
   - Desk changes → `desk-patterns`
4. Create a feature branch off an up-to-date default branch: `git switch -c feat/<slug>`. Never commit directly to the default branch.

### Step 1 — Plan execution via superpowers

Invoke `superpowers:executing-plans` using the loaded plan. That skill defines the per-task RED→GREEN→REFACTOR loop with review checkpoints. Follow it exactly, with these repo-specific rules layered in:

- For every backend task, honor `backend-patterns`: domain placement under `apps/backend/src/domains/`, DTOs implementing `@app/shared-types` interfaces, enums from `@appshore/db`, events via `DomainEventService` + `APP_EVENT_REGISTRY`, sanctioned AI paths only, camelCase everywhere except the Prisma/URL-param exceptions, `@db.Date` vs `@db.Timestamptz` handled deliberately, tenant scoping on every query.
- For every frontend task, honor `frontend-patterns`: TanStack Query hooks with centralized query keys, FormSheet for 4+ field forms, Dialog only for 1–4 fields or quick actions, AlertDialog only for destructive, `<Button loading>` not manual spinners, Skeleton not spinner for `isLoading`, `showSuccess` + `showError` on every mutation, dark-theme-safe tokens, min 44×44 touch targets, responsive at 375/768/1440.
- **Use `superpowers:test-driven-development`** inside each task — test first, watch it fail, implement, watch it pass.
- Commit on the feature branch after every task — interruptions must leave recoverable, green progress.

### Step 2 — Test coverage ≥ 90% (backend + packages)

For every **backend or `packages/appshore/*`** module/file you touch:

1. Write unit tests that **match existing patterns** in that area (look at a neighboring `*.spec.ts` and mirror structure, mocks, and assertion style). Use fixtures from `@appshore/platform/test/*` (prisma/cache/queue mocks, tenant/user factories).
2. Cover: happy path, every branch/guard, error paths, edge cases identified in the plan, multi-tenant scoping where applicable, RBAC where applicable, date/time boundary cases.
3. Run the suite and verify ≥ 90% line+branch coverage on the changed code (scope the coverage run to the changed files if the full run is too broad).
4. If coverage < 90% on any changed file, add tests until it clears. Do **not** suppress coverage or exclude files to hit the number.

For **frontend** changes: the gates are type-check + build + browser verification (Playwright MCP or manual) — at 375/768/1440 in both themes for UI work. Screenshots go in a gitignored `.screenshots/` directory.

For **mobile** changes: `cd apps/mobile && flutter analyze && flutter test`.

### Step 3 — Pre-PR gates (run locally, fix failures)

Run and make green before opening the PR:

```bash
pnpm lint
pnpm type-check
pnpm test              # turbo runs backend + package suites
pnpm build             # per changed app
```

For any failure: fix the root cause, do not bypass. Never use `--no-verify`, never skip hooks.

### Step 4 — Open the PR

1. Ensure the branch is pushed: `git push -u origin <branch>`.
2. Create the PR with `gh pr create` targeting the default branch, using the plan's "Outcome" as the summary and the edge-cases / scope sections as the body. Keep the title < 70 chars.
3. Include a Test plan checklist (manual + automated) in the PR body.

### Step 5 — Rigorous self review (architect mode)

Invoke the `review` skill on the PR. Then put the architect hat on and audit the diff yourself against:

- **Design** — correct domain placement, no cross-domain leakage, no foundation-package edits for app-specific concerns, right abstractions, no over-engineering.
- **Code quality** — DRY (no duplication of logic, types, constants — import from `@app/shared-types` or existing utils), KISS (no speculative flexibility), readable names, no dead code, no WIP comments.
- **Edge cases** — empty states, nulls, pagination, race conditions, idempotency, retries, partial writes, offline clients, multi-tenant isolation, RBAC.
- **Scalability** — N+1s, index coverage, cache invalidation, queue/backoff behavior, payload size, streaming/pagination.
- **Security** — authz on every new endpoint, tenant scoping on every Prisma query, no PII in logs, no secrets in code, input validated at the boundary.
- **Maintainability** — matches existing patterns, tests mirror neighbors, migrations follow the `@appshore/db` convention, feature flags where appropriate, observability (logs/metrics/traces) added where useful.
- **UX** — Apple/Google bar; every mutation has success + error toast; every `isLoading` shows a Skeleton; Sheet vs Dialog rule followed; dark-mode-safe tokens; responsive across 375/768/1440.

Be critical and thorough — it's easier to fix in this loop than after merge.

### Step 6 — Apply review findings

Fix every issue the review surfaced. Re-run the pre-PR gates (Step 3) and coverage check (Step 2) after fixes. Push the updates to the same PR.

### Step 7 — Hand-off

Post a short final summary: PR URL, coverage delta, notable trade-offs, any out-of-scope debt flagged for follow-up. Do **not** merge — the human owns the merge.

---

## Red flags — STOP and fix before continuing

- You're about to push to the default branch directly.
- A test was "fixed" by weakening the assertion.
- You skipped `superpowers:executing-plans`, `backend-patterns`, or `frontend-patterns`.
- You copied a constant/type instead of importing from `@app/shared-types` or the canonical source.
- You hand-wrote an enum that belongs in the Prisma schema.
- You emitted an event without going through `DomainEventService` + the registry.
- You called an LLM outside the sanctioned paths (Mastra runtime / `StructuredOutputService` / `runStructuredLlmStep`).
- You used `new Date(dateOnlyString)` — the calendar-date off-by-one trap.
- Coverage is below 90% on changed backend files and you're about to open the PR anyway.
- You used `--no-verify`, `--force` on a shared branch, or any destructive git flag without explicit user approval.
- You're about to claim "done" without running lint + type-check + tests + build locally.

If any of these are true, stop and correct.

---

## What NOT to do

- Do NOT stop for feedback in the middle of the implementation loop. Proceed through code → tests → PR → review → fixes.
- Do NOT skip the pattern skills. `backend-patterns` and `frontend-patterns` are mandatory for their respective surfaces.
- Do NOT skip the `review` skill.
- Do NOT merge the PR. Stop at a green, reviewed PR awaiting human merge.
- Do NOT invent tests to pad coverage — every test must assert real behavior.
- Do NOT suppress lint, type, or coverage rules to pass gates.
